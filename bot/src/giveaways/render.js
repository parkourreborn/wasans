// Builds the Discord embed + button for a giveaway from the payload the
// wasans site sends to /v3/giveaways/sync (see syncGiveawayToDiscord in
// notifications.ts). Kept separate from sync.js/commands/giveaways.js so both
// the initial post and the join-button interaction can reuse the exact same
// rendering.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

const CUSTOM_ID_PREFIX = 'wasans-giveaway';
const ACTION_JOIN = 'join';

const COLOR_BY_STATUS = {
    active: 0x57f287,
    won: 0xfee75c,
    closed: 0x99aaab,
};

export function buildGiveawayJoinCustomId(giveawayUuid) {
    return `${CUSTOM_ID_PREFIX}:${ACTION_JOIN}:${giveawayUuid}`;
}

export function parseGiveawayCustomId(customId) {
    if (typeof customId !== 'string' || !customId.startsWith(`${CUSTOM_ID_PREFIX}:`)) {
        return null;
    }

    const [, action, ...uuidParts] = customId.split(':');
    const giveawayUuid = uuidParts.join(':');
    if (!action || !giveawayUuid) {
        return null;
    }

    return { action, giveawayUuid };
}

// Falls back to the player's wasans name on the rare winner with no linked
// Discord account (see getDiscordIdsForPlayers in giveaway-notify-service.ts)
// rather than dropping them from the list.
export function formatWinnerMention(winner) {
    return winner.discord_user_id ? `<@${winner.discord_user_id}>` : winner.player_name;
}

export function buildGiveawayEmbed(giveaway) {
    const embed = new EmbedBuilder()
        .setTitle(giveaway.title)
        .setColor(COLOR_BY_STATUS[giveaway.status] ?? COLOR_BY_STATUS.active);

    if (giveaway.description) {
        embed.setDescription(giveaway.description);
    }

    const endsTimestamp = Math.floor(Number(giveaway.ends_at) || 0);
    const fields = [
        { name: 'Entries', value: String(giveaway.entry_count ?? 0), inline: true },
        { name: 'Winner slots', value: String(giveaway.max_winners ?? 1), inline: true },
        {
            name: giveaway.status === 'active' ? 'Ends' : 'Ended',
            value: endsTimestamp ? `<t:${endsTimestamp}:R>` : 'Unknown',
            inline: true,
        },
    ];

    const winners = Array.isArray(giveaway.winners) ? giveaway.winners : [];
    if (winners.length > 0) {
        fields.push({
            name: 'Winners',
            value: winners
                .map((winner) => `${winner.claimed ? '✅' : '⏳'} ${formatWinnerMention(winner)}`)
                .join('\n'),
            inline: false,
        });
    }

    embed.addFields(fields);
    embed.setFooter({ text: 'wasans giveaway • wasans.tully.sh/prizes' });

    return embed;
}

function buildJoinButtonLabel(status) {
    if (status === 'won') return '🏆 Winners drawn';
    if (status === 'closed') return '🔒 Giveaway closed';
    return '🎉 Join Giveaway';
}

export function buildGiveawayComponents(giveaway) {
    const button = new ButtonBuilder()
        .setCustomId(buildGiveawayJoinCustomId(giveaway.uuid))
        .setLabel(buildJoinButtonLabel(giveaway.status))
        .setStyle(giveaway.status === 'active' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(giveaway.status !== 'active');

    return [new ActionRowBuilder().addComponents(button)];
}

export function buildGiveawayMessage(giveaway) {
    return {
        content: "<@&1398513332603850752>",
        embeds: [buildGiveawayEmbed(giveaway)],
        components: buildGiveawayComponents(giveaway),
    };
}
