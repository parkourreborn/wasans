// Slash command registration and dispatch. Each command lives in its own
// module exporting { definition, execute, autocomplete }; this file only
// routes interactions to them and owns the shared button/menu handling.
//
//   /leaderboard [board] [player]           overall, trial and combo boards
//   /submissions [player] [on] [status] [run]  browse runs, or open one
//   /stats [player]                          everything about one player
//   /wrs [trial]                             world records, or a trial's WR history

import { MessageFlags } from 'discord.js';
import { botConfig } from '../config.js';
import { logger } from '../logger.js';
import { resolveSubmissionAssetUrl } from '../resolvers.js';
import * as leaderboard from './leaderboard.js';
import { buildRunMessage, parseRunRef } from './runCard.js';
import { getSession, parseComponentId, renderSession } from './session.js';
import * as stats from './stats.js';
import * as submissions from './submissions.js';
import * as wrs from './wrs.js';

const commands = new Map([leaderboard, submissions, stats, wrs].map((command) => [command.definition.name, command]));

function ephemeral(content) {
    return { content, flags: MessageFlags.Ephemeral };
}

async function handleAutocomplete(interaction) {
    const command = commands.get(interaction.commandName);
    if (!command) return false;

    let choices = [];
    try {
        choices = await command.autocomplete(interaction, interaction.options.getFocused(true));
    } catch (error) {
        console.error('Autocomplete failed:', error);
    }

    await interaction.respond((choices || []).slice(0, 25)).catch(() => {});
    return true;
}

// Re-renders a session after its state changed, in place.
async function updateSession(interaction, sessionId, mutate) {
    const session = getSession(sessionId);
    if (!session) {
        await interaction.reply(ephemeral('This message has expired. Run the command again.'));
        return;
    }

    if (session.ownerId && interaction.user.id !== session.ownerId) {
        await interaction.reply(ephemeral('Only the person who ran this command can flip through it. Run it yourself to browse.'));
        return;
    }

    await interaction.deferUpdate();
    mutate(session);

    try {
        await interaction.editReply(await renderSession(sessionId));
    } catch (error) {
        await interaction.followUp(ephemeral(error?.message || "Couldn't load that page.")).catch(() => {});
    }
}

async function handleComponent(interaction) {
    const parsed = parseComponentId(interaction.customId);
    if (!parsed) return false;

    if (parsed.action === 'open' && interaction.isStringSelectMenu()) {
        // Opened runs go to whoever picked one, so a menu under a public card
        // doesn't fill the channel with everyone's clicks.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const message = await buildRunMessage(interaction.values[0]);
        await interaction.editReply(message.error ? { content: message.error } : message);
        return true;
    }

    if (parsed.action === 'watch' && interaction.isButton()) {
        const ref = parseRunRef(parsed.value);
        // A bare video link: Discord embeds it as a player.
        await interaction.reply(ephemeral(ref ? resolveSubmissionAssetUrl(ref.uuid) : 'That video is unavailable.'));
        return true;
    }

    if (parsed.action === 'page' && interaction.isButton()) {
        await updateSession(interaction, parsed.sessionId, (session) => {
            session.page = Math.max(parseInt(parsed.value, 10) || 0, 0);
        });
        return true;
    }

    if (parsed.action === 'tab' && interaction.isButton()) {
        await updateSession(interaction, parsed.sessionId, (session) => {
            if (session.views[parsed.value]) {
                session.tab = parsed.value;
                session.page = 0;
            }
        });
        return true;
    }

    if (parsed.action === 'noop') {
        await interaction.deferUpdate().catch(() => {});
        return true;
    }

    // Buttons and menus from before this version of the bot.
    await interaction.reply(ephemeral('This message is from an older version of the bot. Run the command again.'));
    return true;
}

async function handleChatInput(interaction) {
    const command = commands.get(interaction.commandName);
    if (!command) return false;

    try {
        // Every command answers publicly, so the card is visible to the
        // whole channel rather than just the person who ran it.
        await interaction.deferReply();
        await command.execute(interaction);
    } catch (error) {
        const message = error?.message || 'Command failed.';
        const reply = { content: message, embeds: [], files: [], attachments: [], components: [] };

        if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
        else await interaction.reply({ content: message }).catch(() => {});

        await logger.error('Slash command failed', message, { command_name: interaction.commandName }).catch(() => {});
    }

    return true;
}

export async function registerSlashCommands(client) {
    const definitions = [...commands.values()].map((command) => command.definition.toJSON());

    try {
        if (!client.application) return;

        // set() replaces the whole list, so commands this version dropped
        // (/pbs, /combos, ...) disappear from Discord's picker.
        if (botConfig.guild_id) {
            const guild = await client.guilds.fetch(botConfig.guild_id).catch(() => null);
            if (guild) {
                await guild.commands.set(definitions);
                await logger.log('Slash commands registered', `Guild: ${botConfig.guild_id}`);
                return;
            }
        }

        await client.application.commands.set(definitions);
        await logger.log('Slash commands registered', 'Global scope');
    } catch (error) {
        await logger.error('Slash command registration failed', error?.message || 'Unknown error').catch(() => {});
    }
}

export async function handleSlashCommandInteraction(interaction) {
    if (interaction.isAutocomplete()) return handleAutocomplete(interaction);
    if (interaction.isButton() || interaction.isStringSelectMenu()) return handleComponent(interaction);
    if (interaction.isChatInputCommand()) return handleChatInput(interaction);
    return false;
}
