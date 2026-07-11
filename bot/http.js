import { badRequest } from './errors.js';

export function jsonResponse(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

export async function parseJsonBody(req) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        throw badRequest('Content-Type must be application/json');
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks).toString('utf8').trim();
    if (!body) return {};

    try {
        return JSON.parse(body);
    } catch {
        throw badRequest('Invalid JSON body');
    }
}

export function getAuthHeader(req) {
    const header = req.headers.authorization || req.headers.Authorization;
    return typeof header === 'string' ? header.trim() : undefined;
}
