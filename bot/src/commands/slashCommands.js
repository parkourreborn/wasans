import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { comboCategoryChoices, getComboCategories, resolveComboCategory } from '../comboCategories.js';
import { botConfig, cardRateLimit } from '../config.js';
import { logger } from '../logger.js';
import { fetchAvatarDataUri } from '../render/avatar.js';
import { cachedRender } from '../render/cache.js';
import { pngAttachment, renderAttachment, renderPng } from '../render/png.js';
import { renderComboOverviewCard } from '../render/templates/comboOverview.js';
import { renderLeaderboardCard } from '../render/templates/leaderboard.js';
import { renderPbsCard } from '../render/templates/pbs.js';
import { renderStatsCard } from '../render/templates/stats.js';
import { renderSubmissionsCard } from '../render/templates/submissions.js';
import { renderWrsCard } from '../render/templates/wrs.js';
import { createRateLimiter } from '../rateLimit.js';
import { resolveSubmissionUrl } from '../resolvers.js';
import { apiGet, asArray, getTotal } from '../wasansApi.js';

const PAGE_SIZE = 10;
// The combo board front page shows this many holders per category.
const OVERVIEW_PER_CATEGORY = 3;
// Categories are admin-configurable and unbounded, but one tall card gets
// scaled down to illegibility in Discord — and each category costs a request.
// Past this many the overview shows the first few and points at the per-category
// view for the rest.
const OVERVIEW_MAX_CATEGORIES = 8;
const COMBO_STATES = ['approved', 'pending', 'denied'];
const CUSTOM_ID_PREFIX = 'wasans-slash';

export const trials = [
    'Crystal', 'Genesis', 'Glass', 'Riser', 'Solar', 'Vestibule', 'Celsius', 'Circulation',
    'Flow', 'Martyr', 'Neon Bold', 'Sawdust', 'Ascension', 'Faith', 'Gale', 'Grip',
    'Thread', 'Umbrel', 'Depot', 'Flame', 'Ironsing', 'Monoxide', 'Rust Belt', 'Wisp',
];

const trialChoices = trials.map((trialName) => ({ name: trialName, value: trialName }));
const trialSet = new Set(trials);
const paginationContexts = new Map();

const cardLimiter = createRateLimiter(cardRateLimit);

function formatRetry(retryAfterMs) {
    const seconds = Math.max(Math.ceil(retryAfterMs / 1000), 1);
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

// Claims budget for one card. Page turns count too: a cached page still uploads
// an image, and charging every interaction uniformly keeps the limit
// predictable for whoever hits it.
function reserveCardRender(userId) {
    const { allowed, retryAfterMs } = cardLimiter.tryConsume(userId);
    if (allowed) return { allowed: true };

    return {
        allowed: false,
        message: `You're requesting cards too quickly. Try again in ${formatRetry(retryAfterMs)}.`,
    };
}

function truncate(value, maxLength) {
    const text = String(value ?? '');
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function getPlayerName(item) {
    return item?.player_name || item?.name || item?.username || item?.display_name || item?.discord_name || 'Unknown player';
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

// The list cards show exact counts — ranking depends on the difference between
// two nearby combos — but group them so seven digits stay readable.
function formatComboCount(value) {
    const num = toNumber(value);
    return num === null ? 'N/A' : num.toLocaleString('en-US');
}

// Combo counts run large, so the headline stat is abbreviated to three
// significant figures: 784573 -> "784k", 3520000 -> "3.52m".
//
// The three digits are taken by integer division rather than by scaling to a
// float and rounding: it truncates (so the figure never overstates a real
// count) and it sidesteps binary rounding, which would otherwise turn
// 1150000 into "1.14m".
const COMBO_UNIT_SUFFIXES = ['', 'k', 'm', 'b', 't'];

function formatComboCountShort(value) {
    const num = toNumber(value);
    if (num === null) return 'N/A';

    const sign = num < 0 ? '-' : '';
    const abs = Math.floor(Math.abs(num));

    // Anything under a thousand is already at most three digits.
    if (abs < 1000) return `${sign}${abs}`;

    const digitCount = String(abs).length;
    const unitIndex = Math.min(Math.floor((digitCount - 1) / 3), COMBO_UNIT_SUFFIXES.length - 1);
    const suffix = COMBO_UNIT_SUFFIXES[unitIndex];

    // How many of the three digits sit left of the decimal point: 1234 -> 1,
    // 12345 -> 2, 784573 -> 3.
    const wholeDigits = digitCount - unitIndex * 3;
    const kept = String(Math.floor(abs / 10 ** (digitCount - 3)));

    const rendered = wholeDigits >= 3 ? kept : `${kept.slice(0, wholeDigits)}.${kept.slice(wholeDigits)}`;

    return `${sign}${rendered}${suffix}`;
}

function getComboCount(item) {
    return item?.combo_count ?? item?.count ?? null;
}

function getComboCategorySlug(item) {
    return item?.category_slug || item?.category || null;
}

function formatJoinDate(value) {
    const seconds = toNumber(value);
    if (seconds === null || seconds <= 0) return null;

    // The API stores join dates as unix seconds.
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return null;

    return `Joined ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

function cleanNickname(value) {
    return String(value || '').replace(/\s+\(\d+(?:\.\d+)?\)\s*$/, '').trim();
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
        new SlashCommandBuilder()
            .setName('combos')
            .setDescription('View the combo leaderboard for a category, or an overview of every category')
            .addStringOption((option) =>
                option
                    .setName('category')
                    .setDescription('Combo category (leave empty for an overview of them all)')
                    .setAutocomplete(true)
                    .setRequired(false),
            ),
        new SlashCommandBuilder()
            .setName('combopbs')
            .setDescription("View a player's best combo in every category")
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Player name or Discord mention')
                    .setRequired(true),
            ),
        new SlashCommandBuilder()
            .setName('combosubmissions')
            .setDescription('View recent combo submissions')
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Player name or Discord mention')
                    .setRequired(false),
            )
            .addStringOption((option) =>
                option
                    .setName('category')
                    .setDescription('Combo category')
                    .setAutocomplete(true)
                    .setRequired(false),
            )
            .addStringOption((option) =>
                option
                    .setName('state')
                    .setDescription('Only show submissions in this state')
                    .addChoices(
                        { name: 'Approved', value: 'approved' },
                        { name: 'Pending', value: 'pending' },
                        { name: 'Denied', value: 'denied' },
                    )
                    .setRequired(false),
            ),
    ];
}

// Every list command stores its already-normalised rows here; a page change
// just re-slices them and re-renders the card, so paging never re-hits the API.
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

function totalPagesOf(context) {
    return Math.max(Math.ceil(context.rows.length / PAGE_SIZE), 1);
}

function renderCard(context, rows, page, totalPages) {
    const { meta } = context;

    if (context.kind === 'leaderboard') {
        return renderLeaderboardCard({ trial: meta.trial, entries: rows, page, totalPages, total: meta.total });
    }

    if (context.kind === 'combos') {
        return renderLeaderboardCard({
            entries: rows,
            page,
            totalPages,
            eyebrow: 'WASANS · Combo Leaderboard',
            title: meta.category,
            subtitle: `Highest combo counts on ${meta.category}`,
            emptyMessage: 'No approved combos in this category yet.',
            footerNote:
                meta.total === null ? null : `${meta.total} ranked player${meta.total === 1 ? '' : 's'}`,
        });
    }

    if (context.kind === 'submissions') {
        return renderSubmissionsCard({ player: meta.player, submissions: rows, page, totalPages, total: meta.total });
    }

    if (context.kind === 'combosubmissions') {
        return renderSubmissionsCard({
            player: meta.player,
            submissions: rows,
            page,
            totalPages,
            total: meta.total,
            eyebrow: 'WASANS · Combos',
            title: meta.player ? `${meta.player}'s Combo Submissions` : 'Recent Combo Submissions',
            subtitle: meta.subtitle,
            emptyMessage: 'No combo submissions found.',
            noun: 'combo submission',
        });
    }

    if (context.kind === 'pbs') {
        return renderPbsCard({
            player: meta.player,
            entries: rows,
            page,
            totalPages,
            completed: meta.completed,
            totalTrials: meta.totalTrials,
        });
    }

    if (context.kind === 'combopbs') {
        return renderPbsCard({
            player: meta.player,
            entries: rows,
            page,
            totalPages,
            completed: meta.completed,
            totalTrials: meta.totalCategories,
            eyebrow: 'WASANS · Combo Bests',
            noun: 'categories',
            verb: 'ranked',
            emptyMessage: 'No approved combos found for this player.',
            emptyValue: 'No combo',
        });
    }

    return renderWrsCard({ records: rows, page, totalPages, total: meta.total });
}

function buildPageView(contextId, context, requestedPageIndex) {
    const totalPages = totalPagesOf(context);
    const pageIndex = Math.min(Math.max(Number(requestedPageIndex) || 0, 0), totalPages - 1);
    const start = pageIndex * PAGE_SIZE;

    const png = cachedRender(`${contextId}:${pageIndex}`, () => {
        const rows = context.rows.slice(start, start + PAGE_SIZE);
        const { svg, width } = renderCard(context, rows, pageIndex + 1, totalPages);
        return renderPng(svg, width);
    });
    const file = pngAttachment(png, `${context.kind}-${pageIndex + 1}`);

    const components = [];

    if (totalPages > 1) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${CUSTOM_ID_PREFIX}:page:${contextId}:${Math.max(0, pageIndex - 1)}`)
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(pageIndex <= 0),
                new ButtonBuilder()
                    .setCustomId(`${CUSTOM_ID_PREFIX}:page:${contextId}:${Math.min(totalPages - 1, pageIndex + 1)}`)
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(pageIndex >= totalPages - 1),
            ),
        );
    }

    const options = context.options
        .slice(start, start + PAGE_SIZE)
        .filter((option) => option && option.value);

    if (options.length > 0) {
        components.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`${CUSTOM_ID_PREFIX}:select:${contextId}:${pageIndex}`)
                    .setPlaceholder('Get a submission URL')
                    .addOptions(options),
            ),
        );
    }

    // `attachments: []` drops the previous page's image; without it Discord keeps
    // both the old and the new render on the message.
    return { content: '', embeds: [], files: [file], attachments: [], components };
}

async function sendPaginatedReply(interaction, context) {
    const contextId = createPaginationContext(context);
    await interaction.editReply(buildPageView(contextId, context, 0));
}

async function handleLeaderboardCommand(interaction) {
    const trial = interaction.options.getString('trial');

    if (trial && !trialSet.has(trial)) {
        await interaction.editReply('Invalid trial. Please choose one of the available trial options.');
        return;
    }

    if (!trial) {
        const payload = await apiGet('leaderboards/overall', { limit: 100 });
        const entries = asArray(payload);

        await sendPaginatedReply(interaction, {
            ownerId: interaction.user.id,
            kind: 'leaderboard',
            meta: { trial: null, total: getTotal(payload) },
            rows: entries.map((item, index) => ({
                rank: index + 1,
                name: getPlayerName(item),
                stat: formatScore(item?.score ?? item?.overall_score),
            })),
            options: entries.map(() => null),
        });

        return;
    }

    const payload = await apiGet(`leaderboards/trials/${encodeURIComponent(trial)}`, { limit: 100 });
    // Players with no time on the trial come back ranked null; they would only
    // pad the card with empty rows.
    const entries = asArray(payload).filter((item) => toNumber(item?.time ?? item?.time_new) !== null);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'leaderboard',
        meta: { trial, total: entries.length },
        rows: entries.map((item, index) => ({
            rank: item?.rank || index + 1,
            name: getPlayerName(item),
            stat: formatTime(item?.time ?? item?.time_new),
            isWorldRecord: Boolean(item?.is_world_record),
        })),
        options: entries.map((item, index) => {
            const submissionUuid = getSubmissionUuid(item);
            if (!submissionUuid) return null;

            return {
                label: truncate(`#${item?.rank || index + 1} ${getPlayerName(item)}`, 100),
                value: submissionUuid,
                description: truncate(`${trial} PB`, 100),
            };
        }),
    });
}

async function handleSubmissionsCommand(interaction) {
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

    const payload = await apiGet('submissions', {
        player_uuid: player ? getPlayerUuid(player) : undefined,
        limit: 100,
    });
    const submissions = asArray(payload);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'submissions',
        meta: { player: player ? getPlayerName(player) : null, total: getTotal(payload) },
        rows: submissions.map((submission) => ({
            trial: getTrialName(submission),
            player: getPlayerName(submission),
            state: getSubmissionStatus(submission),
            time: formatTime(submission?.time ?? submission?.time_new),
        })),
        options: submissions.map((submission) => {
            const submissionUuid = getSubmissionUuid(submission);
            if (!submissionUuid) return null;

            return {
                label: truncate(`${getTrialName(submission)} • ${getPlayerName(submission)}`, 100),
                value: submissionUuid,
                description: truncate(formatTime(submission?.time ?? submission?.time_new), 100),
            };
        }),
    });
}

// The API's `pbs` table is the source of truth for personal bests, so the card
// lists every trial and fills in the ones the player has a time on.
function buildPbRows(pbs, worldRecordUuids) {
    const byTrial = new Map(pbs.map((pb) => [getTrialName(pb), pb]));

    return trials.map((trialName) => {
        const pb = byTrial.get(trialName) || null;
        const submissionUuid = pb ? getSubmissionUuid(pb) : null;

        return {
            trial: trialName,
            time: pb ? formatTime(pb?.time ?? pb?.time_new) : null,
            isWorldRecord: Boolean(submissionUuid && worldRecordUuids.has(submissionUuid)),
            submissionUuid,
        };
    });
}

async function handlePbsCommand(interaction) {
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

    const [detailPayload, recordsPayload] = await Promise.all([
        apiGet(`players/${encodeURIComponent(playerUuid)}`, { include: 'pbs' }),
        apiGet('records/world').catch(() => null),
    ]);

    const detail = detailPayload?.data?.player || detailPayload?.data || null;
    const pbs = Array.isArray(detail?.pbs) ? detail.pbs : [];
    const worldRecordUuids = new Set(
        asArray(recordsPayload)
            .map((record) => getSubmissionUuid(record))
            .filter(Boolean),
    );

    const rows = buildPbRows(pbs, worldRecordUuids);
    const completed = rows.filter((row) => row.time).length;

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'pbs',
        meta: { player: getPlayerName(detail || player), completed, totalTrials: rows.length },
        rows,
        options: rows.map((row) => {
            if (!row.submissionUuid) return null;

            return {
                label: truncate(row.trial, 100),
                value: row.submissionUuid,
                description: truncate(`PB • ${row.time}`, 100),
            };
        }),
    });
}

async function handleWrsCommand(interaction) {
    const payload = await apiGet('records/world');
    const records = asArray(payload);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'wrs',
        meta: { total: records.length },
        rows: records.map((record) => ({
            trial: getTrialName(record),
            holder: getPlayerName(record),
            time: formatTime(record?.time ?? record?.time_new),
        })),
        options: records.map((record) => {
            const submissionUuid = getSubmissionUuid(record);
            if (!submissionUuid) return null;

            return {
                label: truncate(getTrialName(record), 100),
                value: submissionUuid,
                description: truncate(getPlayerName(record), 100),
            };
        }),
    });
}

async function handleStatsCommand(interaction) {
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

    const [detailPayload, countPayload, approvedPayload, recordsPayload] = await Promise.all([
        apiGet(`players/${encodeURIComponent(playerUuid)}`, {
            include: 'pbs,combo_pbs,recent_submissions',
            submissions_limit: 1,
        }),
        // Only the envelope's total is needed for the counts, so ask for the
        // smallest page the API will hand back.
        apiGet('submissions', { player_uuid: playerUuid, limit: 1 }).catch(() => null),
        apiGet('submissions', { player_uuid: playerUuid, state: 'approved', limit: 1 }).catch(() => null),
        apiGet('records/world').catch(() => null),
    ]);

    const detail = detailPayload?.data?.player || detailPayload?.data || player;
    const pbs = Array.isArray(detail?.pbs) ? detail.pbs : [];
    const comboPbs = Array.isArray(detail?.combo_pbs) ? detail.combo_pbs : [];
    const recentSubmissions = Array.isArray(detail?.recent_submissions) ? detail.recent_submissions : [];
    const mostRecent = recentSubmissions[0] || null;

    // Their single best combo, whichever category it came from.
    const comboCounts = comboPbs.map((pb) => toNumber(getComboCount(pb))).filter((count) => count !== null);
    const highestCombo = comboCounts.length > 0 ? Math.max(...comboCounts) : null;

    const worldRecords = asArray(recordsPayload).filter((record) => record?.player_uuid === playerUuid);
    const submissionCount = getTotal(countPayload);
    const approvedCount = getTotal(approvedPayload);

    const avatarDataUri = await fetchAvatarDataUri(detail?.player_id, detail?.discord_avatar);

    const { svg, width } = renderStatsCard({
        name: getPlayerName(detail),
        handle: formatJoinDate(detail?.date_joined),
        avatarDataUri,
        score: formatScore(detail?.score ?? detail?.overall_score),
        rank: detail?.rank ? `Rank #${detail.rank}` : null,
        tiles: [
            { label: 'Submissions', value: submissionCount === null ? '—' : String(submissionCount) },
            { label: 'Approved', value: approvedCount === null ? '—' : String(approvedCount) },
            { label: 'Personal Bests', value: `${pbs.length} / ${trials.length}` },
            { label: 'World Records', value: String(worldRecords.length), accent: worldRecords.length > 0 },
            { label: 'Highest Combo', value: highestCombo === null ? '—' : formatComboCountShort(highestCombo) },
        ],
        latest: mostRecent
            ? {
                  label: `${getTrialName(mostRecent)} · ${getSubmissionStatus(mostRecent)}`,
                  time: formatTime(mostRecent?.time ?? mostRecent?.time_new),
              }
            : null,
    });

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

    await interaction.editReply({
        content: '',
        embeds: [],
        files: [renderAttachment(svg, width, 'stats')],
        attachments: [],
        components,
    });
}

// Fetches one category's combo leaderboard and keeps only the players who
// actually have an approved combo. The endpoint LEFT JOINs every player so the
// unranked ones come back with a null count, and meta.total counts all players
// rather than the ranked ones — so the ranked count is derived here, the same
// way the trial leaderboard does it.
async function fetchComboLeaderboard(categorySlug, { limit = 100 } = {}) {
    const payload = await apiGet(`leaderboards/combos/${encodeURIComponent(categorySlug)}`, { limit });

    return asArray(payload).filter((item) => getComboCount(item) !== null);
}

function comboLeaderboardRows(entries) {
    return entries.map((item, index) => ({
        rank: item?.rank || index + 1,
        name: getPlayerName(item),
        stat: formatComboCount(getComboCount(item)),
    }));
}

async function handleCombosOverview(interaction) {
    const allCategories = await getComboCategories();

    if (allCategories.length === 0) {
        await interaction.editReply('No combo categories are currently active.');
        return;
    }

    const categories = allCategories.slice(0, OVERVIEW_MAX_CATEGORIES);
    const omitted = allCategories.length - categories.length;

    const boards = await Promise.all(
        categories.map(async (category) => {
            const entries = await fetchComboLeaderboard(category.slug).catch(() => null);

            return {
                label: category.label,
                // A category whose board failed to load is shown as empty rather
                // than failing the whole overview.
                total: entries === null ? null : entries.length,
                entries: comboLeaderboardRows((entries || []).slice(0, OVERVIEW_PER_CATEGORY)),
            };
        }),
    );

    const { svg, width } = renderComboOverviewCard({
        categories: boards,
        perCategory: OVERVIEW_PER_CATEGORY,
        omitted,
    });

    await interaction.editReply({
        content: '',
        embeds: [],
        files: [renderAttachment(svg, width, 'combos')],
        attachments: [],
        components: [],
    });
}

async function handleCombosCommand(interaction) {
    const categoryInput = interaction.options.getString('category');

    if (!categoryInput) {
        await handleCombosOverview(interaction);
        return;
    }

    const category = await resolveComboCategory(categoryInput);
    if (!category) {
        await interaction.editReply('Unknown combo category. Pick one from the autocomplete suggestions.');
        return;
    }

    const entries = await fetchComboLeaderboard(category.slug);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'combos',
        meta: { category: category.label, total: entries.length },
        rows: comboLeaderboardRows(entries),
        options: entries.map((item, index) => {
            const submissionUuid = getSubmissionUuid(item);
            if (!submissionUuid) return null;

            return {
                label: truncate(`#${item?.rank || index + 1} ${getPlayerName(item)}`, 100),
                value: submissionUuid,
                description: truncate(`${category.label} · ${formatComboCount(getComboCount(item))} combo`, 100),
            };
        }),
    });
}

// Combo bests list every active category, including the ones the player has no
// approved combo in, so the card reads as a checklist the way /pbs does.
function buildComboPbRows(categories, comboPbs) {
    const byCategory = new Map(
        comboPbs
            .map((pb) => [getComboCategorySlug(pb), pb])
            .filter(([slug]) => slug),
    );

    return categories.map((category) => {
        const pb = byCategory.get(category.slug) || null;

        return {
            label: category.label,
            value: pb ? formatComboCount(getComboCount(pb)) : null,
            submissionUuid: pb ? getSubmissionUuid(pb) : null,
        };
    });
}

async function handleComboPbsCommand(interaction) {
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

    const [detailPayload, categories] = await Promise.all([
        apiGet(`players/${encodeURIComponent(playerUuid)}`, { include: 'combo_pbs' }),
        getComboCategories(),
    ]);

    const detail = detailPayload?.data?.player || detailPayload?.data || null;
    const comboPbs = Array.isArray(detail?.combo_pbs) ? detail.combo_pbs : [];

    const rows = buildComboPbRows(categories, comboPbs);
    const completed = rows.filter((row) => row.value).length;

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'combopbs',
        meta: { player: getPlayerName(detail || player), completed, totalCategories: rows.length },
        rows,
        options: rows.map((row) => {
            if (!row.submissionUuid) return null;

            return {
                label: truncate(row.label, 100),
                value: row.submissionUuid,
                description: truncate(`Best · ${row.value} combo`, 100),
            };
        }),
    });
}

async function handleComboSubmissionsCommand(interaction) {
    const playerInput = interaction.options.getString('player');
    const categoryInput = interaction.options.getString('category');
    const stateInput = interaction.options.getString('state');

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

    let category = null;
    if (categoryInput) {
        category = await resolveComboCategory(categoryInput);
        if (!category) {
            await interaction.editReply('Unknown combo category. Pick one from the autocomplete suggestions.');
            return;
        }
    }

    const state = stateInput && COMBO_STATES.includes(stateInput) ? stateInput : undefined;

    const [payload, categories] = await Promise.all([
        apiGet('combo-submissions', {
            player_uuid: player ? getPlayerUuid(player) : undefined,
            category: category ? category.slug : undefined,
            state,
            limit: 100,
        }),
        getComboCategories(),
    ]);

    const submissions = asArray(payload);
    // Combo submissions carry only the category slug, so the label comes from
    // the category list; a since-disabled category falls back to its slug.
    const labelBySlug = new Map(categories.map((item) => [item.slug, item.label]));

    const filters = [category ? category.label : null, state ? getSubmissionStatus({ state }) : null].filter(Boolean);

    await sendPaginatedReply(interaction, {
        ownerId: interaction.user.id,
        kind: 'combosubmissions',
        meta: {
            player: player ? getPlayerName(player) : null,
            total: getTotal(payload),
            subtitle: filters.length > 0 ? `${filters.join(' · ')} · newest first` : 'Newest combos first',
        },
        rows: submissions.map((submission) => {
            const slug = getComboCategorySlug(submission);

            return {
                label: labelBySlug.get(slug) || slug || 'Unknown category',
                player: getPlayerName(submission),
                state: getSubmissionStatus(submission),
                value: formatComboCount(getComboCount(submission)),
            };
        }),
        options: submissions.map((submission) => {
            const submissionUuid = getSubmissionUuid(submission);
            if (!submissionUuid) return null;

            const slug = getComboCategorySlug(submission);

            return {
                label: truncate(`${labelBySlug.get(slug) || slug} • ${getPlayerName(submission)}`, 100),
                value: submissionUuid,
                description: truncate(`${formatComboCount(getComboCount(submission))} combo`, 100),
            };
        }),
    });
}

const COMBO_CATEGORY_AUTOCOMPLETE = new Set(['combos', 'combosubmissions']);

async function handleAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (interaction.commandName === 'leaderboard' && focused.name === 'trial') {
        const value = String(focused.value || '').toLowerCase();
        const choices = trials
            .filter((trialName) => trialName.toLowerCase().includes(value))
            .slice(0, 25)
            .map((trialName) => ({ name: trialName, value: trialName }));

        await interaction.respond(choices);
        return true;
    }

    if (COMBO_CATEGORY_AUTOCOMPLETE.has(interaction.commandName) && focused.name === 'category') {
        // comboCategoryChoices never rejects — it serves the cached list, then
        // the seeded slugs — so autocomplete always answers inside Discord's
        // 3 second window.
        await interaction.respond(await comboCategoryChoices(focused.value));
        return true;
    }

    return false;
}

async function handleComponentInteraction(interaction) {
    const parsed = parseComponentId(interaction.customId);
    if (!parsed) return false;

    if (parsed.action === 'url') {
        const submissionUuid = parsed.value;
        if (!submissionUuid) {
            await interaction.reply({ content: 'Submission link is unavailable.', flags: MessageFlags.Ephemeral });
            return true;
        }

        await interaction.reply({ content: resolveSubmissionUrl(submissionUuid), flags: MessageFlags.Ephemeral });
        return true;
    }

    const context = parsed.contextId ? paginationContexts.get(parsed.contextId) : null;
    if (!context) {
        // Component replies stay ephemeral: submission links and pagination guard
        // rails are answers to one clicker, not command output for the channel.
        await interaction.reply({ content: 'This interaction is no longer available.', flags: MessageFlags.Ephemeral });
        return true;
    }

    if (parsed.action === 'select' && interaction.isStringSelectMenu()) {
        const submissionUuid = interaction.values[0];
        if (!submissionUuid) {
            await interaction.reply({ content: 'Submission link is unavailable.', flags: MessageFlags.Ephemeral });
            return true;
        }

        await interaction.reply({ content: resolveSubmissionUrl(submissionUuid), flags: MessageFlags.Ephemeral });
        return true;
    }

    if (parsed.action === 'page' && interaction.isButton()) {
        if (context.ownerId && interaction.user.id !== context.ownerId) {
            await interaction.reply({
                content: 'Only the original command user can control this pagination.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const budget = reserveCardRender(interaction.user.id);
        if (!budget.allowed) {
            await interaction.reply({ content: budget.message, flags: MessageFlags.Ephemeral });
            return true;
        }

        // Rendering the next page takes long enough that acknowledging first is
        // safer than racing Discord's 3 second window.
        await interaction.deferUpdate();
        await interaction.editReply(buildPageView(parsed.contextId, context, Number(parsed.value || 0)));
        return true;
    }

    return false;
}

async function handleChatInputCommand(interaction) {
    if (!interaction.isChatInputCommand()) return false;

    const handlers = {
        leaderboard: handleLeaderboardCommand,
        submissions: handleSubmissionsCommand,
        pbs: handlePbsCommand,
        wrs: handleWrsCommand,
        stats: handleStatsCommand,
        combos: handleCombosCommand,
        combopbs: handleComboPbsCommand,
        combosubmissions: handleComboSubmissionsCommand,
    };

    const handler = handlers[interaction.commandName];
    if (!handler) return false;

    // Checked before deferring so the refusal can stay ephemeral instead of
    // turning into a public "thinking..." that resolves to an error.
    const budget = reserveCardRender(interaction.user.id);
    if (!budget.allowed) {
        await interaction.reply({ content: budget.message, flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    try {
        // Every command answers publicly, so the rendered card is visible to the
        // whole channel rather than just the person who ran it.
        await interaction.deferReply();
        await handler(interaction);
    } catch (error) {
        const message = error?.message || 'Command failed.';

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: message, embeds: [], files: [], attachments: [], components: [] }).catch(() => {});
        } else {
            await interaction.reply({ content: message }).catch(() => {});
        }

        await logger.error('Slash command failed', message, { command_name: interaction.commandName }).catch(() => {});
    }

    return true;
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
