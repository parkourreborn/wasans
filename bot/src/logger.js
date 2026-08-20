import { EmbedBuilder } from 'discord.js';
import { LOGGING_CHANNEL_ID } from './config.js';
import { client } from './discordClient.js';

class Logger {
    constructor(channelId) {
        this.channelId = channelId;
    }

    static truncate(value, max = 1024) {
        if (value.length <= max) return value;
        return `${value.slice(0, max - 3)}...`;
    }

    buildEmbed(level, color, title, description, meta) {
        const embed = new EmbedBuilder().setColor(color).setTimestamp();

        embed.setTitle(title && String(title).trim() ? String(title).trim() : level);

        if (description && String(description).trim()) {
            embed.setDescription(Logger.truncate(String(description).trim(), 4096));
        }

        if (meta && typeof meta === 'object') {
            const fields = Object.entries(meta)
                .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== '')
                .slice(0, 8)
                .map(([key, value]) => ({
                    name: key.replace(/_/g, ' '),
                    value: Logger.truncate(String(value), 1024),
                    inline: true,
                }));

            if (fields.length > 0) {
                embed.addFields(fields);
            }
        }

        embed.setFooter({ text: level });
        return embed;
    }

    async send(level, color, title, description = '', meta = undefined) {
        const embed = this.buildEmbed(level, color, title, description, meta);
        const channel = await client.channels.fetch(this.channelId);
        if (channel && channel.isTextBased?.()) {
            await channel.send({ embeds: [embed] });
        }
    }

    async log(title, description = '', meta = undefined) {
        await this.send('Info', 0x4bb503, title, description, meta);
    }

    async warn(title, description = '', meta = undefined) {
        await this.send('Warning', 0xeed202, title, description, meta);
    }

    async error(title, description = '', meta = undefined) {
        await this.send('Error', 0xff2c2c, title, description, meta);
    }
}

export const logger = new Logger(LOGGING_CHANNEL_ID);
