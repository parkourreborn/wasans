import { Events } from 'discord.js';
import { server } from './src/api/server.js';
import { handleAdminCommandMessage } from './src/commands/adminCommands.js';
import { handleSlashCommandInteraction, registerSlashCommands } from './src/commands/slashCommands.js';
import { handleSubmissionModerationInteraction } from './src/commands/submissionModeration.js';
import { ALLOWED_USER_ID, BOT_TOKEN, PORT } from './src/config.js';
import { client } from './src/discordClient.js';
import { logger } from './src/logger.js';

client.once(Events.ClientReady, async () => {
    console.log('Bot ready. Listening on port', PORT);

    await logger.log('Bot is online', '');
    await registerSlashCommands(client);

    server.listen(PORT);
    await logger.log('Server started', '');
});

client.on('messageCreate', async (message) => {
    if (message.author.id === '978053871270248508' && message.content === 'yay') {
        await message.reply('yayyyyyyyyyyyyyyy');
        return;
    }

    try {
        await handleAdminCommandMessage(message, ALLOWED_USER_ID);
    } catch (error) {
        console.error('Command execution error:', error);
        await logger.error('Command execution error', error.message);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        const handled = await handleSubmissionModerationInteraction(interaction);
        if (handled) {
            return;
        }

        const slashHandled = await handleSlashCommandInteraction(interaction);
        if (slashHandled) {
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
