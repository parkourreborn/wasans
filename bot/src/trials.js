// The trial list and its display order are admin-configurable on the site
// (/v2/trials), so the bot reads them from there, the same way
// comboCategories.js reads combo categories. FALLBACK_TRIALS is only used when
// the API can't be reached at all.

import { apiGet, asArray } from './wasansApi.js';

export const FALLBACK_TRIALS = [
    'Crystal', 'Genesis', 'Glass', 'Riser', 'Solar', 'Vestibule', 'Celsius', 'Circulation',
    'Flow', 'Martyr', 'Neon Bold', 'Sawdust', 'Ascension', 'Faith', 'Gale', 'Grip',
    'Thread', 'Umbrel', 'Depot', 'Flame', 'Ironsing', 'Monoxide', 'Rust Belt', 'Wisp',
];

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null;

// Resolves to [{ name, retired }] in the site's order. Never rejects.
export async function getTrials() {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.trials;

    try {
        const rows = asArray(await apiGet('trials', undefined, { ttlMs: 0 }));
        const trials = rows
            .filter((row) => row?.name)
            .map((row) => ({ name: String(row.name), retired: row.status === 'removed' }));

        if (trials.length === 0) throw new Error('trials returned nothing');

        cache = { trials, fetchedAt: Date.now() };
        return trials;
    } catch {
        if (cache) return cache.trials;
        return FALLBACK_TRIALS.map((name) => ({ name, retired: false }));
    }
}

// Trials that count toward a score right now.
export async function getActiveTrials() {
    return (await getTrials()).filter((trial) => !trial.retired);
}

export async function resolveTrial(input) {
    const normalized = String(input || '').trim().toLowerCase();
    if (!normalized) return null;

    const trials = await getTrials();
    return trials.find((trial) => trial.name.toLowerCase() === normalized) || null;
}
