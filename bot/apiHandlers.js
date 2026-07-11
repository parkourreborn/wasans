import { client } from './discordClient.js';
import { logger } from './logging.js';

async function logAction(step, detail = '') {
    console.log(`[BOT ACTION] ${step}${detail ? ` | ${detail}` : ''}`);
    try {
        await logger.log(step, detail);
    } catch (error) {
        console.error('[BOT ACTION] Failed to write remote log:', error.message);
    }
}

async function errorAction(step, detail = '') {
    console.error(`[BOT ACTION] ${step}${detail ? ` | ${detail}` : ''}`);
    try {
        await logger.error(step, detail);
    } catch (error) {
        console.error('[BOT ACTION] Failed to write remote error log:', error.message);
    }
}

export function jsonResponse(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

export async function handleSetNick(guild, payload, res) {
    const userId = payload.user_id;
    const nick = payload.nick;

    await logAction('API action started: set nick', `guild=${guild.id}; user=${userId || 'missing'}; nick=${nick || 'missing'}`);

    if (!userId) return jsonResponse(res, 400, { error: 'user_id is required' });
    if (typeof userId !== 'string') return jsonResponse(res, 400, { error: 'user_id must be a string' });
    if (!nick) return jsonResponse(res, 400, { error: 'nick is required' });
    if (typeof nick !== 'string') return jsonResponse(res, 400, { error: 'nick must be a string' });

    const member = await guild.members.fetch(userId);
    await member.setNickname(nick);
    await logAction('Nickname updated successfully', `user=${userId}; nick=${nick}`);
    return jsonResponse(res, 200, { success: true, user_id: userId, nick });
}

export async function handleManageRole(guild, payload, res) {
    const userId = payload.user_id;
    const roleId = payload.role_id;
    const action = payload.action;

    await logAction('API action started: manage role', `guild=${guild.id}; user=${userId || 'missing'}; role=${roleId || 'missing'}; action=${action || 'missing'}`);

    if (!userId) return jsonResponse(res, 400, { error: 'user_id is required' });
    if (typeof userId !== 'string') return jsonResponse(res, 400, { error: 'user_id must be a string' });
    if (!roleId) return jsonResponse(res, 400, { error: 'role_id is required' });
    if (typeof roleId !== 'string') return jsonResponse(res, 400, { error: 'role_id must be a string' });
    if (!action || !['add', 'remove'].includes(action)) {
        return jsonResponse(res, 400, { error: 'action must be add or remove' });
    }

    const member = await guild.members.fetch(userId);
    const role = await guild.roles.fetch(roleId);
    if (!role) return jsonResponse(res, 404, { error: 'role not found' });

    if (action === 'add') {
        await member.roles.add(role);
    } else {
        await member.roles.remove(role);
    }

    await logAction('Role action completed', `user=${userId}; role=${roleId}; action=${action}`);

    return jsonResponse(res, 200, {
        success: true,
        action,
        user_id: userId,
        role_id: roleId,
    });
}

export async function handleSendMessage(guild, payload, res) {
    const channelId = payload.channel_id;
    const content = payload.content;

    await logAction('API action started: send message', `guild=${guild.id}; channel=${channelId || 'missing'}`);

    if (!channelId) return jsonResponse(res, 400, { error: 'channel_id is required' });
    if (typeof channelId !== 'string') return jsonResponse(res, 400, { error: 'channel_id must be a string' });
    if (!content) return jsonResponse(res, 400, { error: 'content is required' });
    if (typeof content !== 'string') return jsonResponse(res, 400, { error: 'content must be a string' });

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.guildId !== guild.id || !channel.isTextBased?.()) {
        return jsonResponse(res, 404, { error: 'text channel not found in guild' });
    }

    const message = await channel.send(String(content));
    await logAction('Channel message sent', `channel=${channelId}; message=${message.id}`);
    return jsonResponse(res, 200, {
        success: true,
        guild_id: guild.id,
        channel_id: channelId,
        message_id: message.id,
        content: message.content,
    });
}

export async function handleSendDM(payload, res) {
    const userId = payload.user_id;
    const content = payload.content;

    await logAction('API action started: send DM', `user=${userId || 'missing'}`);

    if (!userId) return jsonResponse(res, 400, { error: 'user_id is required' });
    if (typeof userId !== 'string') return jsonResponse(res, 400, { error: 'user_id must be a string' });
    if (!content) return jsonResponse(res, 400, { error: 'content is required' });
    if (typeof content !== 'string') return jsonResponse(res, 400, { error: 'content must be a string' });

    try {
        const user = await client.users.fetch(userId);
        const message = await user.send(String(content));
        await logAction('DM sent', `user=${userId}; message=${message.id}`);

        return jsonResponse(res, 200, {
            success: true,
            user_id: userId,
            channel_id: message.channelId,
            message_id: message.id,
            content: message.content,
        });
    } catch (error) {
        console.error('Failed to send DM:', error);
        await errorAction('Send DM failed', error.message);

        if (error?.code === 10013 || error?.message?.includes('Unknown User')) {
            return jsonResponse(res, 404, {
                error: 'user not found',
                detail: error.message,
            });
        }

        return jsonResponse(res, 500, {
            error: 'Failed to send DM',
            detail: error.message,
        });
    }
}

export async function handleCreateThread(guild, payload, res) {
    const channelId = payload.channel_id;
    const title = payload.title;
    const content = payload.content;
    const tags = payload.tags;

    await logAction('API action started: create thread', `guild=${guild.id}; channel=${channelId || 'missing'}; title=${title || 'missing'}`);

    if (!channelId) return jsonResponse(res, 400, { error: 'channel_id is required' });
    if (typeof channelId !== 'string') return jsonResponse(res, 400, { error: 'channel_id must be a string' });
    if (!title) return jsonResponse(res, 400, { error: 'title is required' });
    if (typeof title !== 'string') return jsonResponse(res, 400, { error: 'title must be a string' });
    if (!content) return jsonResponse(res, 400, { error: 'content is required' });
    if (typeof content !== 'string') return jsonResponse(res, 400, { error: 'content must be a string' });

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.guildId !== guild.id || !channel.threads?.create) {
        return jsonResponse(res, 404, { error: 'forum channel not found in guild' });
    }

    const thread = await channel.threads.create({
        name: String(title),
        message: {
            content: String(content),
        },
        autoArchiveDuration: 1440,
    });

    if (tags && Array.isArray(tags)) {
        await thread.setAppliedTags(tags);
    }

    await logAction('Thread created', `thread=${thread.id}; channel=${channelId}`);

    return jsonResponse(res, 200, {
        success: true,
        guild_id: guild.id,
        channel_id: channelId,
        thread_id: thread.id,
        thread_name: thread.name,
    });
}

export async function handleUpdateThreadTags(guild, payload, res) {
    const channelId = payload.channel_id;
    const threadId = payload.thread_id;
    const tags = payload.tags;

    await logAction('API action started: update thread tags', `guild=${guild.id}; channel=${channelId || 'missing'}; thread=${threadId || 'missing'}`);

    if (!channelId) return jsonResponse(res, 400, { error: 'channel_id is required' });
    if (typeof channelId !== 'string') return jsonResponse(res, 400, { error: 'channel_id must be a string' });
    if (!threadId) return jsonResponse(res, 400, { error: 'thread_id is required' });
    if (typeof threadId !== 'string') return jsonResponse(res, 400, { error: 'thread_id must be a string' });
    if (!tags) return jsonResponse(res, 400, { error: 'tags is required' });
    if (!Array.isArray(tags)) return jsonResponse(res, 400, { error: 'tags must be an array' });
    if (!tags.every((tag) => typeof tag === 'string')) {
        return jsonResponse(res, 400, { error: 'tags must be an array of strings' });
    }

    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || channel.guildId !== guild.id) {
            return jsonResponse(res, 404, { error: 'channel not found in guild' });
        }

        const thread = await channel.threads.fetch(threadId);
        if (!thread) {
            return jsonResponse(res, 404, { error: 'thread not found' });
        }

        await thread.setAppliedTags(tags);
        await logAction('Thread tags updated', `thread=${threadId}; tags=${JSON.stringify(tags)}`);

        return jsonResponse(res, 200, {
            success: true,
            guild_id: guild.id,
            channel_id: channelId,
            thread_id: threadId,
            applied_tags: tags,
        });
    } catch (error) {
        console.error('Failed to update thread tags:', error);
        await errorAction('Update thread tags failed', error.message);
        return jsonResponse(res, 500, {
            error: 'Failed to update thread tags',
            detail: error.message,
        });
    }
}

export async function handleUpdateThread(guild, payload, res) {
    const channelId = payload.channel_id;
    const threadId = payload.thread_id;
    const title = payload.title;
    const content = payload.content;

    await logAction('API action started: update thread', `guild=${guild.id}; channel=${channelId || 'missing'}; thread=${threadId || 'missing'}`);

    if (!channelId) return jsonResponse(res, 400, { error: 'channel_id is required' });
    if (typeof channelId !== 'string') return jsonResponse(res, 400, { error: 'channel_id must be a string' });
    if (!threadId) return jsonResponse(res, 400, { error: 'thread_id is required' });
    if (typeof threadId !== 'string') return jsonResponse(res, 400, { error: 'thread_id must be a string' });
    if (!content) return jsonResponse(res, 400, { error: 'content is required' });
    if (typeof content !== 'string') return jsonResponse(res, 400, { error: 'content must be a string' });

    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || channel.guildId !== guild.id) {
            return jsonResponse(res, 404, { error: 'channel not found in guild' });
        }

        const thread = await channel.threads.fetch(threadId);
        if (!thread) {
            return jsonResponse(res, 404, { error: 'thread not found' });
        }

        if (title) {
            await thread.setName(title);
        }

        const starterMessage = await thread.fetchStarterMessage();
        if (!starterMessage) {
            return jsonResponse(res, 404, { error: 'starter message not found' });
        }

        await starterMessage.edit({ content: String(content) });
        await logAction('Thread starter message updated', `thread=${threadId}; message=${starterMessage.id}`);

        return jsonResponse(res, 200, {
            success: true,
            guild_id: guild.id,
            channel_id: channelId,
            thread_id: threadId,
            thread_name: thread.name,
            content: starterMessage.content,
        });
    } catch (error) {
        console.error('Failed to update thread:', error);
        await errorAction('Update thread failed', error.message);
        return jsonResponse(res, 500, {
            error: 'Failed to update thread',
            detail: error.message,
        });
    }
}

export async function handleDeleteThread(guild, payload, res) {
    const channelId = payload.channel_id;
    const threadId = payload.thread_id;

    await logAction('API action started: delete thread', `guild=${guild.id}; channel=${channelId || 'missing'}; thread=${threadId || 'missing'}`);

    if (!channelId) return jsonResponse(res, 400, { error: 'channel_id is required' });
    if (typeof channelId !== 'string') return jsonResponse(res, 400, { error: 'channel_id must be a string' });
    if (!threadId) return jsonResponse(res, 400, { error: 'thread_id is required' });
    if (typeof threadId !== 'string') return jsonResponse(res, 400, { error: 'thread_id must be a string' });

    try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || channel.guildId !== guild.id) {
            return jsonResponse(res, 404, { error: 'channel not found in guild' });
        }

        const thread = await channel.threads.fetch(threadId);

        if (!thread) {
            return jsonResponse(res, 404, { error: 'thread not found' });
        }

        await thread.delete();
        await logAction('Thread deleted', `thread=${threadId}; channel=${channelId}`);

        return jsonResponse(res, 200, {
            success: true,
            guild_id: guild.id,
            channel_id: channelId,
            thread_id: threadId,
        });
    } catch (error) {
        console.error('Failed to delete thread:', error);
        await errorAction('Delete thread failed', error.message);
        return jsonResponse(res, 500, {
            error: 'Failed to delete thread',
            detail: error.message,
        });
    }
}
