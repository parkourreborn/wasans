import { client } from './discordClient.js';
import { LOGGING_CHANNEL_ID } from './constants.js';
import { EmbedBuilder } from 'discord.js';

class Logger {
    constructor(channelId) {
        this.channelId = channelId;
    }

    async log(title, description) {
        const embed = new EmbedBuilder()
            .setColor(0x4bb503)
        if (title) {
            embed.setTitle(title);
        }
        if (description) {
            embed.setDescription(description);
        }

        const channel = await client.channels.fetch(this.channelId);
        if (channel && channel.isTextBased?.()) {
            await channel.send({ embeds: [embed] });
        }
    }
    async warn(title, description) {
        const embed = new EmbedBuilder()
            .setColor(0xeed202)
        if (title) {
            embed.setTitle(title);
        }
        if (description) {
            embed.setDescription(description);
        }

        const channel = await client.channels.fetch(this.channelId);
        if (channel && channel.isTextBased?.()) {
            await channel.send({ embeds: [embed] });
        }
    }
    async error(title, description) {
        const embed = new EmbedBuilder()
            .setColor(0xff2c2c)
        if (title) {
            embed.setTitle(title);
        }
        if (description) {
            embed.setDescription(description);
        }

        const channel = await client.channels.fetch(this.channelId);
        if (channel && channel.isTextBased?.()) {
            await channel.send({ embeds: [embed] });
        }
    }

}


export const logger = new Logger(LOGGING_CHANNEL_ID);
