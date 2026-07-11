import http from 'http';
import { API_SECRET, DEFAULT_GUILD_ID } from './constants.js';
import { client } from './discordClient.js';
import { logger } from './logging.js';
import {
    handleCreateThread,
    handleDeleteThread,
    handleManageRole,
    handleSendDM,
    handleSendMessage,
    handleSetNick,
    handleUpdateThread,
    handleUpdateThreadTags,
    jsonResponse,
} from './apiHandlers.js';

async function logApiEvent(level, title, description = '') {
    const line = `${title}${description ? `: ${description}` : ''}`;
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }

    try {
        if (level === 'error') {
            await logger.error(title, description);
            return;
        }
        if (level === 'warn') {
            await logger.warn(title, description);
            return;
        }
        await logger.log(title, description);
    } catch (error) {
        console.error('Failed to write remote log:', error.message);
    }
}

async function parseJsonBody(req) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('Content-Type must be application/json');
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks).toString('utf8').trim();
    if (!body) return {};

    try {
        return JSON.parse(body);
    } catch (error) {
        throw new Error('Invalid JSON body');
    }
}

function getAuthHeader(req) {
    const header = req.headers.authorization || req.headers.Authorization;
    return typeof header === 'string' ? header.trim() : undefined;
}

export const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const method = req.method || 'UNKNOWN';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname;

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log';
        const summary = `${method} ${pathname} finished with ${res.statusCode} in ${durationMs}ms`;
        void logApiEvent(level, 'Request completed', summary);
    });

    await logApiEvent('log', 'Request received', `${method} ${pathname}`);

    if (req.method !== 'POST') {
        await logApiEvent('warn', 'Request rejected', 'Only POST is supported');
        return jsonResponse(res, 405, { error: 'Only POST is supported' });
    }

    if (!API_SECRET) {
        await logApiEvent('error', 'Request failed', 'API secret is not configured');
        return jsonResponse(res, 500, { error: 'API_SECRET is not configured' });
    }

    const authHeader = getAuthHeader(req);
    if (authHeader !== `Bearer ${API_SECRET}`) {
        await logApiEvent('warn', 'Request rejected', 'Unauthorized');
        return jsonResponse(res, 401, { error: 'Unauthorized' });
    }

    let payload;

    try {
        payload = await parseJsonBody(req);
    } catch (error) {
        await logApiEvent('warn', 'Request rejected', error.message);
        return jsonResponse(res, 400, { error: error.message });
    }

    if (pathname === '/send-dm') {
        return await handleSendDM(payload, res);
    }

    const guildId = payload.guild_id || DEFAULT_GUILD_ID;
    if (!guildId) {
        await logApiEvent('warn', 'Request rejected', 'No guild was provided');
        return jsonResponse(res, 400, {
            error: 'guild_id is required or set GUILD_ID in the environment',
        });
    }
    if (typeof guildId !== 'string') {
        await logApiEvent('warn', 'Request rejected', 'Guild must be a string');
        return jsonResponse(res, 400, { error: 'guild_id must be a string' });
    }

    try {
        const guild = await client.guilds.fetch(guildId);

        if (pathname === '/set-nick') {
            return await handleSetNick(guild, payload, res);
        }

        if (pathname === '/manage-role') {
            return await handleManageRole(guild, payload, res);
        }

        if (pathname === '/send-message') {
            return await handleSendMessage(guild, payload, res);
        }

        if (pathname === '/create-thread') {
            return await handleCreateThread(guild, payload, res);
        }

        if (pathname === '/update-thread') {
            return await handleUpdateThread(guild, payload, res);
        }

        if (pathname === '/update-thread-tags') {
            return await handleUpdateThreadTags(guild, payload, res);
        }

        if (pathname === '/delete-thread') {
            return await handleDeleteThread(guild, payload, res);
        }

        await logApiEvent('warn', 'Request rejected', 'Unknown route');

        return jsonResponse(res, 404, { error: 'Route not found' });
    } catch (error) {
        await logApiEvent('error', 'Request failed', error.message);
        return jsonResponse(res, 500, {
            error: 'Internal server error',
            detail: error.message,
        });
    }
});