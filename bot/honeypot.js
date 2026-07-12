import { HONEYPOT_CHANNEL_ID, HONEYPOT_WARNING_MESSAGE, ALLOWED_USER_ID } from './constants.js';
import { client } from './discordClient.js';
import { logger } from './logging.js';

export async function handleHoneypot(message) {
    // if the message is from a bot, ignore it
    if (message.author.bot) return;
    if (message.author.id === ALLOWED_USER_ID) return;

    await logger.warn('Honeypot triggered', `User ${message.author.id} posted in the honeypot channel`);

    const channel = message.channel;
    const messageHistory = await message.channel.messages.fetch({ limit: 50 });
    const lastBotMessage = messageHistory.find(msg => msg.author.bot && msg.content.includes(HONEYPOT_WARNING_MESSAGE));


    // find and delete the last honeypot warning message (if it exists)
    if (lastBotMessage) {
        lastBotMessage.delete().catch(err => console.error('Failed to delete honeypot message:', err));
    }

    await channel.send(HONEYPOT_WARNING_MESSAGE);

    try {
        await message.guild.members.ban(message.author.id, {
            reason: `Honeypot ban (sending scam message)`,
            deleteMessageSeconds: 604800,
        });
        await logger.log('Honeypot action completed', 'User was banned');
    } catch (error) {
        await logger.error(`Failed to ban user ${message.author.id}`, error.message);
        throw new Error(`Failed to ban user ${message.author.id}: ${error.message}`);
    }
}

export async function ensureHoneypotWarningMessage() {
    try {
        
        const channel = await client.channels.fetch(HONEYPOT_CHANNEL_ID);

        if (!channel || !channel.isTextBased?.()) {
            await logger.error('Honeypot channel not found or not text-based', '');
            throw new Error('Honeypot channel not found or not text-based');
        }

        const messageHistory = await channel.messages.fetch({ limit: 50 });
        const existingBotWarning = messageHistory.find(msg =>
            msg.author.id === client.user.id && msg.content.includes(HONEYPOT_WARNING_MESSAGE)
        );

        if (!existingBotWarning) {
            await channel.send(HONEYPOT_WARNING_MESSAGE);
            await logger.log('Honeypot ready', 'Warning message created');
        } else {
            await existingBotWarning.guild.members.unban(ALLOWED_USER_ID).catch(err => console.error('Failed to unban allowed user:', err));
            await logger.log('Honeypot ready', 'Warning message already exists');
        }
    } catch (error) {
        await logger.error('Failed to ensure honeypot warning message', error.message);
        throw new Error(`Failed to ensure honeypot warning message: ${error.message}`);
    }
}