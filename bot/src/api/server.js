import { createHash, timingSafeEqual } from 'crypto';
import http from 'http';
import { SITE_TO_BOT_KEY } from '../config.js';
import { logger } from '../logger.js';
import { errorBody, normalizeToApiError, unauthorized } from './errors.js';
import { getAuthHeader, jsonResponse, parseJsonBody } from './http.js';
import { handleV2Route, isV2Path } from './v2/router.js';
import { handleV3Route, isV3Path } from './v3/router.js';

// Hashing both sides first gives timingSafeEqual equal-length inputs, so the
// comparison takes the same time however much of the key a guess got right.
function digest(value) {
    return createHash('sha256').update(value).digest();
}

function isAuthorized(authHeader) {
    if (!SITE_TO_BOT_KEY || typeof authHeader !== 'string') return false;
    return timingSafeEqual(digest(authHeader), digest(`Bearer ${SITE_TO_BOT_KEY}`));
}

function logLocally(level, line) {
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

async function logApiEvent(level, title, description = '', meta = undefined) {
    logLocally(level, `${title}${description ? `: ${description}` : ''}`);

    try {
        await logger[level](title, description, meta);
    } catch (error) {
        console.error('Failed to write remote log:', error.message);
    }
}

export const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const method = req.method || 'UNKNOWN';
    // A fixed base, not the caller's Host header: a malformed Host would make
    // the URL constructor throw outside the try below.
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    // Only requests that carry the key are mirrored to the Discord logging
    // channel. Anything else is a stranger, and posting each of their
    // requests would let anyone who finds the bot spam that channel.
    let authenticated = false;

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log';
        const summary = `${method} ${pathname} finished with ${res.statusCode} in ${durationMs}ms`;
        if (!authenticated) {
            logLocally(level, `Unauthenticated request: ${summary}`);
            return;
        }
        void logApiEvent(level, 'Request completed', summary, {
            path: pathname,
            status: res.statusCode,
            duration_ms: durationMs,
        });
    });

    if (req.method !== 'POST') {
        return jsonResponse(res, 405, errorBody('bad_request', 'Only POST is supported'));
    }

    if (!SITE_TO_BOT_KEY) {
        logLocally('error', 'Request failed: SITE_TO_BOT_KEY is not configured');
        return jsonResponse(res, 500, errorBody('discord_error', 'API secret is not configured'));
    }

    if (!isAuthorized(getAuthHeader(req))) {
        const error = unauthorized();
        return jsonResponse(res, error.status, errorBody(error.code, error.message));
    }

    authenticated = true;
    await logApiEvent('log', 'Request received', `${method} ${pathname}`, { method, path: pathname });

    try {
        const payload = await parseJsonBody(req);

        let result;
        if (isV2Path(pathname)) {
            result = await handleV2Route(pathname, payload);
        } else if (isV3Path(pathname)) {
            result = await handleV3Route(pathname, payload);
        } else {
            await logApiEvent('warn', 'Request rejected', 'Unknown route');
            return jsonResponse(res, 404, errorBody('not_found', 'Route not found'));
        }

        return jsonResponse(res, 200, result);
    } catch (error) {
        const apiError = normalizeToApiError(error);
        const level = apiError.status >= 500 ? 'error' : 'warn';
        await logApiEvent(level, 'Request failed', apiError.message, {
            code: apiError.code,
            path: pathname,
        });
        return jsonResponse(res, apiError.status, errorBody(apiError.code, apiError.message));
    }
});
