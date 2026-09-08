// Combo categories are admin-configurable rows in the wasans DB, so the bot
// reads them from the API rather than hardcoding them: an admin adding,
// renaming or disabling a category shows up in Discord without a redeploy.
//
// The list is cached briefly because it backs slash command autocomplete,
// which Discord gives us 3 seconds to answer. FALLBACK_CATEGORIES is the set
// seeded by migrations/0007_combos.sql, used only when the API can't be
// reached at all — a stale picker beats a command that can't be used.

import { apiGet, asArray } from './wasansApi.js';
import { logger } from './logger.js';

export const FALLBACK_CATEGORIES = [
    { slug: 'gearless', label: 'Gearless' },
    { slug: 'yank', label: 'Yank' },
    { slug: 'swing', label: 'Swing' },
    { slug: 'mag', label: 'Mag' },
];

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null;

function normalize(rows) {
    return rows
        .map((row) => ({
            slug: String(row?.slug || '').trim(),
            label: String(row?.label || row?.slug || '').trim(),
        }))
        .filter((row) => row.slug);
}

// Resolves to the active categories in their configured sort order. Never
// rejects: a failed refresh falls back to the last good list, then to the
// seeded slugs, so no command fails purely because this lookup did.
export async function getComboCategories({ force = false } = {}) {
    if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.categories;
    }

    try {
        // The API returns only active categories unless include=all is passed,
        // already ordered by sort_order.
        const categories = normalize(asArray(await apiGet('combo-categories')));

        if (categories.length === 0) {
            throw new Error('combo-categories returned no active categories');
        }

        cache = { categories, fetchedAt: Date.now() };
        return categories;
    } catch (error) {
        if (cache) return cache.categories;

        await logger
            .warn('Combo categories unavailable', error?.message || 'Unknown error')
            .catch(() => {});

        return FALLBACK_CATEGORIES;
    }
}

// Accepts either a slug or a label so a user who types "Gearless" by hand gets
// the same result as one who picked it from autocomplete.
export async function resolveComboCategory(input) {
    const normalized = String(input || '').trim().toLowerCase();
    if (!normalized) return null;

    const categories = await getComboCategories();

    return (
        categories.find((category) => category.slug.toLowerCase() === normalized) ||
        categories.find((category) => category.label.toLowerCase() === normalized) ||
        null
    );
}

export async function comboCategoryChoices(query = '') {
    const normalized = String(query || '').trim().toLowerCase();
    const categories = await getComboCategories();

    return categories
        .filter((category) =>
            !normalized ||
            category.label.toLowerCase().includes(normalized) ||
            category.slug.toLowerCase().includes(normalized),
        )
        .slice(0, 25)
        .map((category) => ({ name: category.label, value: category.slug }));
}
