import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { botConfig } from '../config.js';
import { logger } from '../logger.js';
import { resolveSubmissionUrl } from '../resolvers.js';

const API_BASE_URL = 'https://wasans.tully.sh/v1/';
const PAGE_SIZE = 10;
const CUSTOM_ID_PREFIX = 'wasans-slash';
const MAX_PLAYER_NAME_LENGTH = 12;

export const trials = [
    'Crystal', 'Genesis', 'Glass', 'Riser', 'Solar', 'Vestibule', 'Celsius', 'Circulation',
    'Flow', 'Martyr', 'Neon Bold', 'Sawdust', 'Ascension', 'Faith', 'Gale', 'Grip',
    'Thread', 'Umbrel', 'Depot', 'Flame', 'Ironsing', 'Monoxide', 'Rust Belt', 'Wisp',
];

const trialChoices = trials.map((trialName) => ({ name: trialName, value: trialName }));
const trialSet = new Set(trials);
const paginationContexts = new Map();

function truncate(value, maxLength) {
    const text = String(value ?? '');
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function asArray(payload) {
    if (Array.isArray(payload)) return payload;

    const listCandidates = [
        payload?.data,
        payload?.items,
        payload?.results,
        payload?.leaderboard,
        payload?.records,
        payload?.submissions,
        payload?.players,
    ];

    return listCandidates.find(Array.isArray) || [];
}

function getPlayerName(item) {
    return item?.player_name || item?.name || item?.username || item?.display_name || item?.discord_name || 'Unknown player';
}

function getDisplayPlayerName(item) {
    return truncate(getPlayerName(item), MAX_PLAYER_NAME_LENGTH);
}

function getPlayerUuid(item) {
    return item?.uuid || item?.id || item?.player_uuid || item?.player_id || null;
}

function getSubmissionUuid(item) {
    return (
        item?.submission_uuid ||
        item?.submission_id ||
        item?.uuid ||
        item?.pb_submission_uuid ||
        item?.personal_best_submission_uuid ||
        item?.record_submission_uuid ||
        null
    );
}

function getTrialName(item) {
    return item?.trial_name || item?.trial || item?.name || 'Unknown trial';
}

function getSubmissionStatus(item) {
    const state = String(item?.state || item?.status || '').trim();
    if (!state) return 'Unknown';
    return state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatScore(value) {
    const num = toNumber(value);
    return num === null ? 'N/A' : num.toFixed(3);
}

function formatTime(value) {
    const num = toNumber(value);
    if (num !== null) return `${num.toFixed(3)}s`;
    if (typeof value === 'string' && value.trim()) return `${value.trim()}s`;
    return 'N/A';
}

function cleanNickname(value) {
    return String(value || '').replace(/\s+\(\d+(?:\.\d+)?\)\s*$/, '').trim();
}

async function apiGet(pathname, query = undefined) {
    const url = new URL(pathname, API_BASE_URL);

    if (query && typeof query === 'object') {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }
    }

    const response = await fetch(url);
    const rawBody = await response.text();

    let parsedBody = null;
    if (rawBody) {
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            parsedBody = null;
        }
    }

    if (!response.ok) {
        const message =
            parsedBody?.error?.message ||
            parsedBody?.error ||
            parsedBody?.message ||
            parsedBody?.detail ||
            rawBody ||
            `API request failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return parsedBody;
}

async function findPlayerByName(searchTerm) {
    const normalized = String(searchTerm || '').trim().toLowerCase();
    if (!normalized) return null;

    const searchPayload = await apiGet('players', { search: normalized }).catch(() => null);
    let players = asArray(searchPayload);

    if (players.length === 0) {
        const fallbackPayload = await apiGet('players');
        players = asArray(fallbackPayload);
    }

    const exactMatch = players.find((player) => getPlayerName(player).toLowerCase() === normalized);
    if (exactMatch) return exactMatch;

    const startsWithMatch = players.find((player) => getPlayerName(player).toLowerCase().startsWith(normalized));
    if (startsWithMatch) return startsWithMatch;

    return players.find((player) => getPlayerName(player).toLowerCase().includes(normalized)) || null;
}

async function resolvePlayerFromInput(interaction, input) {
    const rawInput = String(input || '').trim();
    if (!rawInput) return null;

    const mentionMatch = rawInput.match(/^<@!?(\d+)>$/);
    const candidateNames = [];

    if (mentionMatch) {
        const discordId = mentionMatch[1];

        if (interaction.inGuild() && interaction.guild) {
            const member = await interaction.guild.members.fetch(discordId).catch(() => null);
            if (member) {
                const cleanedNickname = cleanNickname(member.nickname || member.displayName);
                if (cleanedNickname) candidateNames.push(cleanedNickname);
                if (member.user?.username) candidateNames.push(member.user.username);
            }
        }

        const fallbackUser = await interaction.client.users.fetch(discordId).catch(() => null);
        if (fallbackUser?.username) candidateNames.push(fallbackUser.username);
    } else {
        candidateNames.push(rawInput);
    }

    const deduped = [...new Set(candidateNames.map((value) => value.trim()).filter(Boolean))];

    for (const candidate of deduped) {
        const player = await findPlayerByName(candidate);
        if (player) return player;
    }

    return null;
}

function buildCommandDefinitions() {
    return [
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('View the overall or per-trial leaderboard')
            .addStringOption((option) =>
                option
                    .setName('trial')
                    .setDescription('Specific trial leaderboard')
                    .addChoices(...trialChoices)
                    .setRequired(false),
            ),
        new SlashCommandBuilder()
            .setName('submissions')
            .setDescription('View recent submissions')
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Player name or Discord mention')
                    .setRequired(false),
            ),
        new SlashCommandBuilder()
            .setName('pbs')
            .setDescription('View personal bests')
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Player name or Discord mention')
                    .setRequired(true),
            ),
        new SlashCommandBuilder().setName('wrs').setDescription('View world records'),
        new SlashCommandBuilder()
            .setName('stats')
            .setDescription('View player stats')
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Player name or Discord mention')
                    .setRequired(true),
            ),
    ];
}

function rankLabel(globalIndex) {
    if (globalIndex === 0) return '🥇';
    if (globalIndex === 1) return '🥈';
    if (globalIndex === 2) return '🥉';
    return `#${globalIndex + 1}`;
}

function buildPages(items, mapper) {
    if (items.length === 0) return [];

    const pages = [];
    for (let offset = 0; offset < items.length; offset += PAGE_SIZE) {
        const pageItems = items.slice(offset, offset + PAGE_SIZE);
        const lines = [];
        const submissionOptions = [];

        for (let index = 0; index < pageItems.length; index += 1) {
            const item = pageItems[index];
            const globalIndex = offset + index;
            const mapped = mapper(item, globalIndex);
            if (!mapped) continue;

            if (mapped.leaderboardEntry) {
                const { name, stat } = mapped.leaderboardEntry;
                lines.push(`${rankLabel(globalIndex)} ${name}`);
                lines.push(`\`${stat}\``);
                lines.push('');
            }

            if (mapped.submissionUuid) {
                submissionOptions.push({
                    label: truncate(mapped.submissionLabel || `Entry ${globalIndex + 1}`, 100),
                    value: mapped.submissionUuid,
                    description: mapped.submissionDescription ? truncate(mapped.submissionDescription, 100) : undefined,
                });
            }
        }

        if (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }

        pages.push({
            description: lines.join('\n'),
            submissionOptions,
        });
    }

    return pages;
}

function createPaginationContext(context) {
    const id = randomUUID();
    paginationContexts.set(id, context);

    if (paginationContexts.size > 1000) {
        const firstKey = paginationContexts.keys().next().value;
        if (firstKey) paginationContexts.delete(firstKey);
    }

    return id;
}

function parseComponentId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) {
        return null;
    }

    const parts = customId.split(':');
    if (parts.length < 3) return null;

    return {
        action: parts[1],
        contextId: parts[2] || null,
        value: parts.slice(3).join(':') || null,
    };
}

function buildPageView(contextId, context, requestedPageIndex) {
    const totalPages = Math.max(context.pages.length, 1);
    const currentPageIndex = Math.min(Math.max(Number(requestedPageIndex) || 0, 0), totalPages - 1);

    const embed = new EmbedBuilder()
        .setColor(context.color || 0x4bb503)
        .setTitle(context.title)
        .setFooter({ text: `${currentPageIndex + 1}/${totalPages}` });

    if (context.botName) {
        const authorData = { name: context.botName };
        if (context.botAvatarUrl) authorData.iconURL = context.botAvatarUrl;
        embed.setAuthor(authorData);
    }

    if (context.pages.length === 0) {
        const emptyDesc = context.description
            ? `${context.description}\n\n${context.emptyMessage || 'No results found.'}`
            : context.emptyMessage || 'No results found.';
        embed.setDescription(emptyDesc);
        return { embeds: [embed], components: [] };
    }

    const page = context.pages[currentPageIndex];

    const descParts = [];
    if (context.description) {
        descParts.push(context.description);
        descParts.push('');
    }
    descParts.push(page.description || context.emptyMessage || 'No results found.');
    embed.setDescription(descParts.join('\n'));

    const pageLabel = `${currentPageIndex + 1}/${totalPages}`;
    const prevPageIndex = Math.max(0, currentPageIndex - 1);
    const nextPageIndex = Math.min(totalPages - 1, currentPageIndex + 1);
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${CUSTOM_ID_PREFIX}:page:${contextId}:${prevPageIndex}`)
                .setLabel('◀')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPageIndex <= 0),
            new ButtonBuilder()
                .setCustomId(`${CUSTOM_ID_PREFIX}:noop:${contextId}:refresh`)
                .setLabel('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`${CUSTOM_ID_PREFIX}:noop:${contextId}:indicator`)
                .setLabel(pageLabel)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`${CUSTOM_ID_PREFIX}:page:${contextId}:${nextPageIndex}`)
                .setLabel('▶')
                .setStyle(ButtonStyle.Success)
                .setDisabled(currentPageIndex >= totalPages - 1),
        ),
    ];

    if (page.submissionOptions.length > 0) {
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`${CUSTOM_ID_PREFIX}:select:${contextId}:${currentPageIndex}`)
                    .setPlaceholder('Get a submission URL')
                    .addOptions(page.submissionOptions),
            ),
        );
    }

    return { embeds: [embed], components };
}

async function replyFromContext(interaction, contextId, context, pageIndex) {
    const payload = buildPageView(contextId, context, pageIndex);

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
        return;
    }

    if (context.ephemeral) {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.reply(payload);
}

async function sendPaginatedReply(interaction, context) {
    const botUser = interaction.client.user;
    const enrichedContext = {
        ...context,
        botName: botUser?.displayName || botUser?.username || 'WASANS Bot',
        botAvatarUrl: botUser?.displayAvatarURL() || null,
    };
    const contextId = createPaginationContext(enrichedContext);
    await replyFromContext(interaction, contextId, enrichedContext, 0);
}

function compareNewestFirst(left, right) {
    const leftDate = new Date(left?.created_at || left?.createdAt || left?.submitted_at || left?.submittedAt || left?.timestamp || 0).getTime() || 0;
    const rightDate = new Date(right?.created_at || right?.createdAt || right?.submitted_at || right?.submittedAt || right?.timestamp || 0).getTime() || 0;
    return rightDate - leftDate;
}

async function handleLeaderboardCommand(interaction) {
    const trial = interaction.options.getString('trial');

    if (trial && !trialSet.has(trial)) {
        await interaction.reply({
            content: 'Invalid trial. Please choose one of the available trial options.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!trial) {
        const payload = await apiGet('leaderboards/overall');
        const entries = asArray(payload);

        await sendPaginatedReply(interaction, {
            ownerId: interaction.user.id,
            title: 'Overall Leaderboard',
            description: 'View the overall WASANS leaderboard.',
            pages: buildPages(entries, (item) => ({
                leaderboardEntry: {
                    name: getPlayerName(item),
                    stat: `Score ${formatScore(item?.score ?? item?.overall_score)}`,
                },
            })),
            emptyMessage: 'No overall leaderboard entries found.',
            ephemeral: true,
        });

        return;
    }

    const payload = await apiGet(`leaderboards/trials/${encodeURIComponent(trial)}`);
    const entries = asArray(payload);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        title: `${trial} Leaderboard`,
        description: `View the ${trial} leaderboard.`,
        pages: buildPages(entries, (item, index) => {
            const rank = item?.rank || index + 1;
            const playerName = getPlayerName(item);
            const submissionUuid = getSubmissionUuid(item);
            return {
                leaderboardEntry: {
                    name: playerName,
                    stat: formatTime(item?.time ?? item?.time_new),
                },
                submissionUuid,
                submissionLabel: truncate(`#${rank} ${playerName}`, 100),
                submissionDescription: `${trial} PB`,
            };
        }),
        emptyMessage: `No leaderboard entries found for ${trial}.`,
        ephemeral: true,
    });
}

async function handleSubmissionsCommand(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const playerInput = interaction.options.getString('player');
    let player = null;

    if (playerInput) {
        player = await resolvePlayerFromInput(interaction, playerInput);
        if (!player) {
            await interaction.editReply('Player not found.');
            return;
        }

        if (!getPlayerUuid(player)) {
            await interaction.editReply('Player found, but no UUID was returned by the API.');
            return;
        }
    }

    const query = player ? { player_uuid: getPlayerUuid(player) } : undefined;
    const payload = await apiGet('submissions', query);
    const submissions = asArray(payload).slice().sort(compareNewestFirst);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        title: 'Recent Submissions',
        description: player ? `View ${getPlayerName(player)}'s recent submissions.` : 'View recent submissions.',
        pages: buildPages(submissions, (submission) => {
            const trialName = getTrialName(submission);
            const playerName = getPlayerName(submission);
            const status = getSubmissionStatus(submission);
            const submissionUuid = getSubmissionUuid(submission);

            return {
                leaderboardEntry: {
                    name: playerName,
                    stat: `${trialName} • ${status}`,
                },
                submissionUuid,
                submissionLabel: truncate(`${trialName} • ${playerName}`, 100),
                submissionDescription: truncate(formatTime(submission?.time ?? submission?.time_new), 100),
            };
        }),
        emptyMessage: player ? 'No submissions found for this player.' : 'No submissions found.',
        ephemeral: true,
    });
}

function buildPbs(submissions) {
    const approved = submissions.filter((submission) => String(submission?.state || '').toLowerCase() === 'approved');

    const bestByTrial = new Map();
    for (const submission of approved) {
        const trialName = getTrialName(submission);
        if (!trialSet.has(trialName)) continue;

        const candidateTime = toNumber(submission?.time ?? submission?.time_new);
        if (candidateTime === null) continue;

        const current = bestByTrial.get(trialName);
        const currentTime = current ? toNumber(current?.time ?? current?.time_new) : null;

        if (!current || currentTime === null || candidateTime < currentTime) {
            bestByTrial.set(trialName, submission);
        }
    }

    return trials.map((trialName) => ({
        trialName,
        submission: bestByTrial.get(trialName) || null,
    }));
}

async function handlePbsCommand(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const playerInput = interaction.options.getString('player', true);
    const player = await resolvePlayerFromInput(interaction, playerInput);
    if (!player) {
        await interaction.editReply('Player not found.');
        return;
    }

    const playerUuid = getPlayerUuid(player);
    if (!playerUuid) {
        await interaction.editReply('Player found, but no UUID was returned by the API.');
        return;
    }

    const payload = await apiGet('submissions', { player_uuid: playerUuid });
    const submissions = asArray(payload);
    const pbs = buildPbs(submissions);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        title: 'Personal Bests',
        description: `View ${getPlayerName(player)}'s personal bests.`,
        pages: buildPages(pbs, (entry) => {
            if (!entry.submission) {
                return {
                    leaderboardEntry: { name: entry.trialName, stat: 'No PB' },
                };
            }

            const submissionUuid = getSubmissionUuid(entry.submission);
            const time = formatTime(entry.submission?.time ?? entry.submission?.time_new);
            return {
                leaderboardEntry: { name: entry.trialName, stat: time },
                submissionUuid,
                submissionLabel: truncate(entry.trialName, 100),
                submissionDescription: truncate(`PB • ${time}`, 100),
            };
        }),
        emptyMessage: 'No PB data found for this player.',
        ephemeral: true,
    });
}

async function handleWrsCommand(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const payload = await apiGet('records/world');
    const records = asArray(payload);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        title: 'World Records',
        description: 'View the WASANS world records.',
        pages: buildPages(records, (record) => {
            const trialName = getTrialName(record);
            const playerName = getPlayerName(record);
            const submissionUuid = getSubmissionUuid(record);
            const time = formatTime(record?.time ?? record?.time_new);
            return {
                leaderboardEntry: {
                    name: playerName,
                    stat: `${trialName} • ${time}`,
                },
                submissionUuid,
                submissionLabel: truncate(trialName, 100),
                submissionDescription: truncate(playerName, 100),
            };
        }),
        emptyMessage: 'No world records found.',
        ephemeral: true,
    });
}

async function handleStatsCommand(interaction) {
    await interaction.deferReply();

    const playerInput = interaction.options.getString('player', true);
    const player = await resolvePlayerFromInput(interaction, playerInput);
    if (!player) {
        await interaction.editReply('Player not found.');
        return;
    }

    const playerUuid = getPlayerUuid(player);
    if (!playerUuid) {
        await interaction.editReply('Player found, but no UUID was returned by the API.');
        return;
    }

    const payload = await apiGet('submissions', { player_uuid: playerUuid });
    const submissions = asArray(payload).slice().sort(compareNewestFirst);
    const mostRecent = submissions[0] || null;

    const embed = new EmbedBuilder()
        .setColor(0x4bb503)
        .setTitle(`Stats for ${getDisplayPlayerName(player)}`)
        .addFields(
            {
                name: 'Current Score',
                value: formatScore(player?.score ?? player?.overall_score),
                inline: true,
            },
            {
                name: 'Total Submissions',
                value: String(submissions.length),
                inline: true,
            },
            {
                name: 'Most Recent Submission',
                value: mostRecent ? `${getTrialName(mostRecent)} | ${formatTime(mostRecent?.time ?? mostRecent?.time_new)}` : 'No submissions',
                inline: true,
            },
        );

    const components = [];
    const mostRecentSubmissionUuid = mostRecent ? getSubmissionUuid(mostRecent) : null;
    if (mostRecentSubmissionUuid) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${CUSTOM_ID_PREFIX}:url:static:${mostRecentSubmissionUuid}`)
                    .setLabel('Get latest submission URL')
                    .setStyle(ButtonStyle.Secondary),
            ),
        );
    }

    await interaction.editReply({ embeds: [embed], components });
}

async function handleAutocomplete(interaction) {
    if (interaction.commandName !== 'leaderboard') return false;

    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'trial') return false;

    const value = String(focused.value || '').toLowerCase();
    const choices = trials
        .filter((trialName) => trialName.toLowerCase().includes(value))
        .slice(0, 25)
        .map((trialName) => ({ name: trialName, value: trialName }));

    await interaction.respond(choices);
    return true;
}

async function handleComponentInteraction(interaction) {
    const parsed = parseComponentId(interaction.customId);
    if (!parsed) return false;

    if (parsed.action === 'url') {
        const submissionUuid = parsed.value;
        if (!submissionUuid) {
            await interaction.reply({
                content: 'Submission link is unavailable.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        await interaction.reply({
            content: resolveSubmissionUrl(submissionUuid),
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    const context = parsed.contextId ? paginationContexts.get(parsed.contextId) : null;
    if (!context) {
        await interaction.reply({
            content: 'This interaction is no longer available.',
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    if (context.ownerId && interaction.user.id !== context.ownerId) {
        await interaction.reply({
            content: 'Only the original command user can control this pagination.',
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    if (parsed.action === 'page' && interaction.isButton()) {
        const page = Number(parsed.value || 0);
        await interaction.update(buildPageView(parsed.contextId, context, page));
        return true;
    }

    if (parsed.action === 'noop' && interaction.isButton()) {
        await interaction.deferUpdate();
        return true;
    }

    if (parsed.action === 'select' && interaction.isStringSelectMenu()) {
        const submissionUuid = interaction.values[0];
        if (!submissionUuid) {
            await interaction.reply({
                content: 'Submission link is unavailable.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        await interaction.reply({
            content: resolveSubmissionUrl(submissionUuid),
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    return false;
}

async function handleChatInputCommand(interaction) {
    if (!interaction.isChatInputCommand()) return false;

    try {
        if (interaction.commandName === 'leaderboard') {
            await handleLeaderboardCommand(interaction);
            return true;
        }

        if (interaction.commandName === 'submissions') {
            await handleSubmissionsCommand(interaction);
            return true;
        }

        if (interaction.commandName === 'pbs') {
            await handlePbsCommand(interaction);
            return true;
        }

        if (interaction.commandName === 'wrs') {
            await handleWrsCommand(interaction);
            return true;
        }

        if (interaction.commandName === 'stats') {
            await handleStatsCommand(interaction);
            return true;
        }
    } catch (error) {
        const message = error?.message || 'Command failed.';

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => {});
        } else {
            const payload =
                interaction.commandName === 'stats'
                    ? { content: message }
                    : { content: message, flags: MessageFlags.Ephemeral };
            await interaction.reply(payload).catch(() => {});
        }

        await logger.error('Slash command failed', message, { command_name: interaction.commandName }).catch(() => {});
        return true;
    }

    return false;
}

export async function registerSlashCommands(client) {
    const commands = buildCommandDefinitions().map((command) => command.toJSON());

    try {
        if (!client.application) return;

        if (botConfig.guild_id) {
            const guild = await client.guilds.fetch(botConfig.guild_id).catch(() => null);
            if (guild) {
                await guild.commands.set(commands);
                await logger.log('Slash commands registered', `Guild: ${botConfig.guild_id}`);
                return;
            }
        }

        await client.application.commands.set(commands);
        await logger.log('Slash commands registered', 'Global scope');
    } catch (error) {
        await logger.error('Slash command registration failed', error?.message || 'Unknown error').catch(() => {});
    }
}

export async function handleSlashCommandInteraction(interaction) {
    if (interaction.isAutocomplete()) {
        return await handleAutocomplete(interaction);
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        return await handleComponentInteraction(interaction);
    }

    return await handleChatInputCommand(interaction);
}
