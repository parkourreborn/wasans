// Read-only client for the public wasans v2 API. Extracted from
// slashCommands.js so the combo category cache can share it rather than
// growing a second copy of the fetch/parse/error handling.

import { botConfig } from './config.js';

const API_BASE_URL = 'https://wasans.tully.sh/v2/';

function parseApiResponse(rawBody) {
    if (!rawBody) return null;
    try {
        return JSON.parse(rawBody);
    } catch {
        return null;
    }
}

function apiErrorFrom(parsedBody, rawBody, status) {
    const message =
        parsedBody?.error?.message ||
        parsedBody?.error ||
        parsedBody?.message ||
        parsedBody?.detail ||
        rawBody ||
        `API request failed with status ${status}`;
    const error = new Error(message);
    error.status = status;
    return error;
}

export async function apiGet(pathname, query = undefined) {
    const url = new URL(pathname, API_BASE_URL);

    if (query && typeof query === 'object') {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }
    }

    const response = await fetch(url);
    const rawBody = await response.text();
    const parsedBody = parseApiResponse(rawBody);

    if (!response.ok) {
        throw apiErrorFrom(parsedBody, rawBody, response.status);
    }

    return parsedBody;
}

// Authenticated client for the wasans admin/bot-only v2 routes (e.g.
// admin/players/by-discord, admin/giveaways/*) -- these require
// BOT_TO_SITE_KEY as a bearer token. It is deliberately not the key the
// HTTP server checks on inbound requests (see config.js).
export async function adminApiRequest(pathname, { method = 'GET', body } = {}) {
    if (!botConfig.site_api_key) {
        const error = new Error('BOT_TO_SITE_KEY is not configured');
        error.status = 500;
        throw error;
    }

    const url = new URL(pathname, API_BASE_URL);
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${botConfig.site_api_key}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const rawBody = await response.text();
    const parsedBody = parseApiResponse(rawBody);

    if (!response.ok) {
        throw apiErrorFrom(parsedBody, rawBody, response.status);
    }

    return parsedBody;
}

// Resolves a Discord user id to their wasans player uuid via the
// Discord-login link (see admin/players/by-discord on the wasans side),
// rather than guessing at a display name and searching for it.
export async function fetchPlayerUuidByDiscordId(discordId) {
    const payload = await adminApiRequest(`admin/players/by-discord/${encodeURIComponent(discordId)}`).catch((error) => {
        if (error.status === 404) return null;
        throw error;
    });

    return payload?.data?.uuid || null;
}

// Joins a giveaway on a linked player's behalf -- used by the "Join
// Giveaway" button on the bot's embed, which has no player session to
// authenticate a normal /v2/giveaways/{uuid}/join call with.
export async function joinGiveawayAsPlayer(giveawayUuid, playerUuid) {
    return adminApiRequest(`admin/giveaways/${encodeURIComponent(giveawayUuid)}/join`, {
        method: 'POST',
        body: { player_uuid: playerUuid },
    });
}

export function asArray(payload) {
    if (Array.isArray(payload)) return payload;

    const listCandidates = [
        payload?.data,
        // Trial leaderboards nest the rows one level deeper, alongside the WR.
        payload?.data?.results,
        payload?.items,
        payload?.results,
        payload?.leaderboard,
        payload?.records,
        payload?.submissions,
        payload?.players,
    ];

    return listCandidates.find(Array.isArray) || [];
}

export function getTotal(payload) {
    const meta = payload?.meta;
    const total = meta?.total ?? meta?.count;
    return Number.isFinite(Number(total)) ? Number(total) : null;
}
