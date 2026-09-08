// Read-only client for the public wasans v2 API. Extracted from
// slashCommands.js so the combo category cache can share it rather than
// growing a second copy of the fetch/parse/error handling.

const API_BASE_URL = 'https://wasans.tully.sh/v2/';

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

    let parsedBody = null;
    if (rawBody) {
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            parsedBody = null;
        }
    }

    if (!response.ok) {
        const message =
            parsedBody?.error?.message ||
            parsedBody?.error ||
            parsedBody?.message ||
            parsedBody?.detail ||
            rawBody ||
            `API request failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return parsedBody;
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
