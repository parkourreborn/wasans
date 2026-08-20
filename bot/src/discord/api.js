import { ChannelType, MessageFlags } from 'discord.js';
import { botConfig } from '../config.js';
import { client } from '../discordClient.js';
import { discordError, notFound } from '../api/errors.js';

function normalizeMessagePayload(content) {
    if (typeof content === 'string') {
        return { content };
    }

    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw discordError('Message payload must be a string or object');
    }

    return content;
}

export async function fetchGuild() {
    if (!botConfig.guild_id) {
        throw discordError('Guild is not configured');
    }

    try {
        return await client.guilds.fetch(botConfig.guild_id);
    } catch (error) {
        throw discordError(`Failed to fetch guild: ${error.message}`);
    }
}

export async function fetchForumChannel(channelId = botConfig.submissions_forum_channel_id) {
    if (!channelId) {
        throw discordError('Submissions forum channel is not configured');
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
        throw notFound('Submissions forum channel not found');
    }

    if (channel.type !== ChannelType.GuildForum || !channel.threads?.create) {
        throw discordError('Configured submissions channel is not a forum channel');
    }

    return channel;
}

export async function fetchThreadById(threadId) {
    try {
        const thread = await client.channels.fetch(threadId);
        if (!thread || !thread.isThread?.()) {
            throw new Error('Thread not found');
        }
        return thread;
    } catch {
        throw notFound('Thread not found');
    }
}

export async function createSubmissionThread({ title, content, forumChannelId }) {
    const forum = await fetchForumChannel(forumChannelId);
    try {
        return await forum.threads.create({
            name: title,
            message: normalizeMessagePayload(content),
            autoArchiveDuration: 1440,
        });
    } catch (error) {
        throw discordError(`Failed to create thread: ${error.message}`);
    }
}

export async function updateThreadStarterMessage(thread, content) {
    try {
        const starterMessage = await thread.fetchStarterMessage();
        if (!starterMessage) {
            throw new Error('Starter message not found');
        }
        await starterMessage.edit(normalizeMessagePayload(content));
        return starterMessage;
    } catch (error) {
        throw discordError(`Failed to update thread content: ${error.message}`);
    }
}

export async function updateThreadName(thread, name) {
    try {
        await thread.setName(name);
    } catch (error) {
        throw discordError(`Failed to update thread title: ${error.message}`);
    }
}

export async function setThreadTags(thread, tags) {
    try {
        await thread.setAppliedTags(tags);
    } catch (error) {
        throw discordError(`Failed to apply tags: ${error.message}`);
    }
}

export async function sendMessageToThread(thread, content) {
    try {
        return await thread.send(content);
    } catch (error) {
        throw discordError(`Failed to send thread message: ${error.message}`);
    }
}

export async function sendMessageToChannel(channelId, content) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || typeof channel.send !== 'function') {
            throw new Error('Channel not found or is not text-based');
        }
        return await channel.send(content);
    } catch (error) {
        throw discordError(`Failed to send channel message: ${error.message}`);
    }
}

export async function deleteThread(thread) {
    try {
        await thread.delete();
    } catch (error) {
        throw discordError(`Failed to delete thread: ${error.message}`);
    }
}

export async function archiveThread(thread) {
    try {
        await thread.setArchived(true);
        await thread.setLocked(true);
    } catch (error) {
        throw discordError(`Failed to archive thread: ${error.message}`);
    }
}

export async function addRoles(member, roleIds) {
    if (roleIds.length === 0) return;
    try {
        await member.roles.add(roleIds);
    } catch (error) {
        throw discordError(`Failed to add roles: ${error.message}`);
    }
}

export async function removeRoles(member, roleIds) {
    if (roleIds.length === 0) return;
    try {
        await member.roles.remove(roleIds);
    } catch (error) {
        throw discordError(`Failed to remove roles: ${error.message}`);
    }
}

export async function updateNickname(member, nickname) {
    try {
        await member.setNickname(nickname);
    } catch (error) {
        throw discordError(`Failed to update nickname: ${error.message}`);
    }
}

export async function sendDirectMessage(userId, content, options = {}) {
    try {
        const user = await client.users.fetch(userId);
        const payload = { content };
        if (options.suppress_embeds) {
            payload.flags = MessageFlags.SuppressEmbeds;
        }

        const message = await user.send(payload);
        return { delivered: true, message_id: message.id };
    } catch (error) {
        return {
            delivered: false,
            message_id: null,
            error,
        };
    }
}
