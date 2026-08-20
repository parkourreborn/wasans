import http from 'http';
import { API_SECRET } from '../config.js';
import { logger } from '../logger.js';
import { errorBody, normalizeToApiError, unauthorized } from './errors.js';
import { getAuthHeader, jsonResponse, parseJsonBody } from './http.js';
import { handleV2Route, isV2Path } from './v2/router.js';
import { handleV3Route, isV3Path } from './v3/router.js';

async function logApiEvent(level, title, description = '', meta = undefined) {
    const line = `${title}${description ? `: ${description}` : ''}`;
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }

    try {
        await logger[level](title, description, meta);
    } catch (error) {
        console.error('Failed to write remote log:', error.message);
    }
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
        void logApiEvent(level, 'Request completed', summary, {
            path: pathname,
            status: res.statusCode,
            duration_ms: durationMs,
        });
    });

    await logApiEvent('log', 'Request received', `${method} ${pathname}`, { method, path: pathname });

    if (req.method !== 'POST') {
        await logApiEvent('warn', 'Request rejected', 'Only POST is supported');
        return jsonResponse(res, 405, errorBody('bad_request', 'Only POST is supported'));
    }

    if (!API_SECRET) {
        await logApiEvent('error', 'Request failed', 'API secret is not configured');
        return jsonResponse(res, 500, errorBody('discord_error', 'API secret is not configured'));
    }

    const authHeader = getAuthHeader(req);
    if (authHeader !== `Bearer ${API_SECRET}`) {
        const error = unauthorized();
        await logApiEvent('warn', 'Request rejected', error.message);
        return jsonResponse(res, error.status, errorBody(error.code, error.message));
    }

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
