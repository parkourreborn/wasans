import { Client, GatewayIntentBits } from 'discord.js';

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    // Messages carry player-chosen names, so by default only user mentions
    // ping. A message that needs more opts in itself (the WR announcement
    // allows its role, !say allows everything).
    allowedMentions: { parse: ['users'], repliedUser: true },
});
