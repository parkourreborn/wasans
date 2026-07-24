import { Events } from 'discord.js';
import { ALLOWED_USER_ID, BOT_TOKEN, HONEYPOT_CHANNEL_ID, PORT } from './constants.js';
import { handleAdminCommandMessage } from './botCommands.js';
import { client } from './discordClient.js';
import { ensureHoneypotWarningMessage, handleHoneypot } from './honeypot.js';
import { logger } from './logging.js';
import { server } from './server.js';
import { handleSubmissionModerationInteraction } from './submissionModeration.js';

client.once(Events.ClientReady, async () => {
    console.log('Bot ready. Listening on port', PORT);

    await logger.log('Bot is online', '');
    await ensureHoneypotWarningMessage();

    server.listen(PORT);
    await logger.log('Server started', '');
});

client.on('messageCreate', async (message) => {

    if (message.author.id === '978053871270248508' && message.content === 'yay') {
        await message.reply('yayyyyyyyyyyyyyyy');
        return;
    }

    try {
        const handled = await handleAdminCommandMessage(message, ALLOWED_USER_ID);
        if (handled) {
            return;
        }
    } catch (error) {
        console.error('Command execution error:', error);
        await logger.error('Command execution error', error.message);
    }

    if (message.channel.id === HONEYPOT_CHANNEL_ID) {
        try {
            await handleHoneypot(message);
        } catch (error) {
            console.error('Honeypot handler error:', error);
            await logger.error('Honeypot handler error', error.message);
            await message.reply(`Error: ${error.message}`).catch(() => {});
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        const handled = await handleSubmissionModerationInteraction(interaction);
        if (handled) {
            return;
        }
    } catch (error) {
        console.error('Interaction execution error:', error);
        await logger.error('Interaction execution error', error.message).catch(() => {});

        if (!interaction.isRepliable()) {
            return;
        }

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'An unexpected error occurred.' }).catch(() => {});
            return;
        }

        await interaction.reply({
            content: 'An unexpected error occurred.',
            ephemeral: true,
        }).catch(() => {});
    }
});

client.login(BOT_TOKEN);
