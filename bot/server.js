import http from 'http';
import { randomUUID } from 'crypto';
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

function truncate(value, maxLength = 600) {
    if (typeof value !== 'string') return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
}

async function logApiEvent(level, requestId, title, description = '') {
    const line = `[API][${requestId}] ${title}${description ? ` | ${description}` : ''}`;
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }

    try {
        if (level === 'error') {
            await logger.error(`[API:${requestId}] ${title}`, description);
            return;
        }
        if (level === 'warn') {
            await logger.warn(`[API:${requestId}] ${title}`, description);
            return;
        }
        await logger.log(`[API:${requestId}] ${title}`, description);
    } catch (error) {
        console.error(`[API][${requestId}] Failed to write remote log:`, error.message);
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
    const requestId = randomUUID().slice(0, 8);
    const startedAt = Date.now();
    const method = req.method || 'UNKNOWN';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname;
    const sourceIp = req.socket?.remoteAddress || 'unknown';

    let responseBody = '';
    const originalEnd = res.end.bind(res);
    res.end = ((chunk, ...args) => {
        if (typeof chunk === 'string') {
            responseBody = chunk;
        } else if (Buffer.isBuffer(chunk)) {
            responseBody = chunk.toString('utf8');
        }
        return originalEnd(chunk, ...args);
    });

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log';
        const summary = `${method} ${pathname} -> ${res.statusCode} in ${durationMs}ms`;
        const detail = `ip=${sourceIp}; response=${truncate(responseBody)}`;
        void logApiEvent(level, requestId, 'Request completed', `${summary}; ${detail}`);
    });

    await logApiEvent('log', requestId, 'Request received', `method=${method}; path=${pathname}; ip=${sourceIp}`);

    if (req.method !== 'POST') {
        await logApiEvent('warn', requestId, 'Rejected request', 'Only POST is supported');
        return jsonResponse(res, 405, { error: 'Only POST is supported' });
    }

    if (!API_SECRET) {
        await logApiEvent('error', requestId, 'Server misconfiguration', 'API_SECRET is not configured');
        return jsonResponse(res, 500, { error: 'API_SECRET is not configured' });
    }

    const authHeader = getAuthHeader(req);
    if (authHeader !== `Bearer ${API_SECRET}`) {
        await logApiEvent('warn', requestId, 'Unauthorized request', 'Authorization header did not match');
        return jsonResponse(res, 401, { error: 'Unauthorized' });
    }

    let payload;

    try {
        payload = await parseJsonBody(req);
    } catch (error) {
        await logApiEvent('warn', requestId, 'Invalid request body', error.message);
        return jsonResponse(res, 400, { error: error.message });
    }

    if (pathname === '/send-dm') {
        return await handleSendDM(payload, res);
    }

    const guildId = payload.guild_id || DEFAULT_GUILD_ID;
    if (!guildId) {
        await logApiEvent('warn', requestId, 'Missing guild_id', 'No guild_id in payload and no DEFAULT_GUILD_ID configured');
        return jsonResponse(res, 400, {
            error: 'guild_id is required or set GUILD_ID in the environment',
        });
    }
    if (typeof guildId !== 'string') {
        await logApiEvent('warn', requestId, 'Invalid guild_id', 'guild_id must be a string');
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

        await logApiEvent('warn', requestId, 'Unknown route', `path=${pathname}`);

        return jsonResponse(res, 404, { error: 'Route not found' });
    } catch (error) {
        await logApiEvent('error', requestId, 'Unhandled API error', error.message);
        return jsonResponse(res, 500, {
            error: 'Internal server error',
            detail: error.message,
        });
    }
});