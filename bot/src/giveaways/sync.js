import { botConfig } from '../config.js';
import { editMessageInChannel, sendMessageToChannel } from '../discord/api.js';
import { logger } from '../logger.js';
import { buildGiveawayMessage } from './render.js';

// Backs /v3/giveaways/sync: the wasans site calls this after every giveaway
// mutation (create/join/close/draw/reroll/extend/claim -- see
// notifyGiveawayChanged in giveaway-notify-service.ts) so the channel always
// shows one live-updating embed per giveaway. If the site already has a
// discord_message_id for this giveaway that message is edited in place;
// otherwise (first sync, or the stored message was deleted) a new message is
// posted and its ids are returned for the site to persist.
export async function executeGiveawaySync(body) {
    const channelId = body.discord_channel_id || botConfig.giveaways_channel_id;
    const message = buildGiveawayMessage(body);

    if (body.discord_message_id) {
        try {
            const edited = await editMessageInChannel(channelId, body.discord_message_id, message);
            return { ok: true, channel_id: channelId, message_id: edited.id };
        } catch (error) {
            await logger.warn(
                'Giveaway sync note',
                `Failed to edit existing message, posting a new one: ${error.message}`,
                { giveaway_uuid: body.uuid },
            ).catch(() => {});
        }
    }

    const posted = await sendMessageToChannel(channelId, message);
    return { ok: true, channel_id: channelId, message_id: posted.id };
}
