import { logger } from './logging.js';

export async function handleAdminCommandMessage(message, allowedUserId) {
    if (!message.content.startsWith('!') || message.author.id !== allowedUserId) {
        return false;
    }

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) {
        await logger.warn('Command ignored', 'No command was provided');
        return false;
    }

    if (commandName === 'status') {
        await logger.log('Command completed', 'Status replied with Online');
        await message.reply('Online');
        return true;
    }

    if (commandName === 'say') {
        const text = args.join(' ');
        if (!text) {
            await logger.warn('Command ignored', 'Say had no text to send');
            return true;
        }

        if (message.reference?.messageId) {
            try {
                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                await referencedMessage.reply(text);
            } catch {
                await message.channel.send(text);
            }
        } else {
            await message.channel.send(text);
        }

        await message.delete().catch(() => {});
        await logger.log('Command completed', 'Message sent and command message removed');
        return true;
    }

    if (commandName === 'delete') {
        if (message.reference?.messageId) {
            try {
                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                await referencedMessage.delete();
            } catch (error) {
                console.error('Could not fetch or delete the referenced message:', error);
                await logger.error('Delete command failed', error.message);
            }
        }

        await message.delete().catch(() => {});
        await logger.log('Command completed', 'Message deleted and command message removed');
        return true;
    }

    await logger.warn('Command ignored', 'Unknown command');

    return false;
}
