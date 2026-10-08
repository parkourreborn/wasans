// Lookups several commands share: world records, and turning a free-form
// "trial or combo category" option into one or the other.

import { getComboCategories, resolveComboCategory } from '../comboCategories.js';
import { getTrials, resolveTrial } from '../trials.js';
import { apiGet, asArray } from '../wasansApi.js';

export async function getWorldRecords() {
    const list = asArray(await apiGet('records/world').catch(() => null));
    return {
        list,
        byTrial: new Map(list.map((record) => [record.trial_name, record])),
        uuids: new Set(list.map((record) => record.submission_uuid).filter(Boolean)),
    };
}

export function toNumber(value) {
    const num = Number(value);
    return value !== null && value !== undefined && value !== '' && Number.isFinite(num) ? num : null;
}

// Autocomplete values are prefixed so a trial and a category can never be
// confused: "t:Crystal", "c:gearless". Typed text is matched by name.
// Resolves to { kind: 'trial', trial } | { kind: 'combo', category } | null.
export async function resolveTarget(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    if (raw.startsWith('t:')) {
        const trial = await resolveTrial(raw.slice(2));
        return trial ? { kind: 'trial', trial } : null;
    }
    if (raw.startsWith('c:')) {
        const category = await resolveComboCategory(raw.slice(2));
        return category ? { kind: 'combo', category } : null;
    }

    const trial = await resolveTrial(raw);
    if (trial) return { kind: 'trial', trial };
    const category = await resolveComboCategory(raw);
    return category ? { kind: 'combo', category } : null;
}

// Trials and combo categories in one list, for the `on` / `board` options.
export async function targetChoices(typed, { extra = [] } = {}) {
    const query = String(typed || '').trim().toLowerCase();
    const [trials, categories] = await Promise.all([getTrials(), getComboCategories()]);

    const all = [
        ...extra,
        ...categories.map((category) => ({ name: `${category.label} · combo`, value: `c:${category.slug}`, match: `${category.label} ${category.slug}` })),
        ...trials.map((trial) => ({ name: trial.retired ? `${trial.name} · retired` : trial.name, value: `t:${trial.name}`, match: trial.name })),
    ];

    return all
        .filter((choice) => !query || String(choice.match || choice.name).toLowerCase().includes(query))
        .slice(0, 25)
        .map(({ name, value }) => ({ name, value }));
}

export async function trialChoices(typed) {
    const query = String(typed || '').trim().toLowerCase();
    const trials = await getTrials();
    return trials
        .filter((trial) => !query || trial.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((trial) => ({ name: trial.retired ? `${trial.name} · retired` : trial.name, value: trial.name }));
}

export async function categoryLabels() {
    const categories = await getComboCategories();
    return new Map(categories.map((category) => [category.slug, category.label]));
}
