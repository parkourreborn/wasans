import { botConfig } from '../config.js';
import { editMessageInChannel, sendMessageToChannel } from '../discord/api.js';
import { logger } from '../logger.js';
import { buildGiveawayMessage, formatWinnerMention } from './render.js';

async function announceWinners(message, body) {
    const winners = Array.isArray(body.winners) ? body.winners : [];
    if (winners.length === 0) {
        return;
    }

    const mentions = winners.map((winner) => formatWinnerMention(winner)).join(' ');

    try {
        await message.reply(`Congratulations ${mentions}! You've won ${body.title}`);
    } catch (error) {
        await logger.warn('Giveaway sync note', `Failed to announce winners: ${error.message}`, {
            giveaway_uuid: body.uuid,
        }).catch(() => {});
    }
}

// Backs /v3/giveaways/sync: the wasans site calls this after every giveaway
// mutation (create/join/close/draw/reroll/extend/claim -- see
// notifyGiveawayChanged in giveaway-notify-service.ts) so the channel always
// shows one live-updating embed per giveaway. If the site already has a
// discord_message_id for this giveaway that message is edited in place;
// otherwise (first sync, or the stored message was deleted) a new message is
// posted and its ids are returned for the site to persist. When
// announce_winners is set (only true right after a draw/reroll), a
// "Congratulations" reply to that message is also sent.
export async function executeGiveawaySync(body) {
    const channelId = body.discord_channel_id || botConfig.giveaways_channel_id;
    const message = buildGiveawayMessage(body);

    let posted;
    if (body.discord_message_id) {
        try {
            posted = await editMessageInChannel(channelId, body.discord_message_id, message);
        } catch (error) {
            await logger.warn(
                'Giveaway sync note',
                `Failed to edit existing message, posting a new one: ${error.message}`,
                { giveaway_uuid: body.uuid },
            ).catch(() => {});
        }
    }

    if (!posted) {
        posted = await sendMessageToChannel(channelId, message);
    }

    if (body.announce_winners) {
        await announceWinners(posted, body);
    }

    return { ok: true, channel_id: channelId, message_id: posted.id };
}
