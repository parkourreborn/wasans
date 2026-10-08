// Trial scores and tiers, ported from the site (src/lib/calc-score.ts,
// src/lib/trials.ts and src/lib/tiers.ts). The Pi only checks out bot/, so
// the bot can't import them; keep the thresholds here in step with the site's
// when a trial is added or rebalanced. A trial missing from these tables just
// shows no score rather than a wrong one.

const PLATINUM = {
    Crystal: 10.5, Genesis: 12.5, Glass: 12.5, Riser: 10.75, Solar: 18, Vestibule: 10.5,
    Celsius: 12, Circulation: 14, Flow: 16.5, Martyr: 12.5, 'Neon Bold': 25, Sawdust: 16.5,
    Ascension: 12, Faith: 15, Gale: 8.25, Grip: 17, Thread: 14, Umbrel: 23,
    Depot: 19.5, Flame: 13.5, Ironsing: 17.5, Monoxide: 14.5, 'Rust Belt': 18.5, Wisp: 13,
};

const BRONZE = {
    Crystal: 25, Genesis: 70, Glass: 30, Riser: 25, Solar: 40, Vestibule: 24,
    Celsius: 25, Circulation: 35, Flow: 32, Martyr: 35, 'Neon Bold': 40, Sawdust: 40,
    Ascension: 25, Faith: 30, Gale: 15, Grip: 35, Thread: 25, Umbrel: 35,
    Depot: 50, Flame: 30, Ironsing: 29, Monoxide: 27, 'Rust Belt': 35, Wisp: 22,
};

export function trialScore(wrTime, time, trialName) {
    const wr = Number(wrTime);
    const t = Number(time);
    const plat = PLATINUM[trialName];
    const bronze = BRONZE[trialName];
    if (!(wr > 0) || !(t > 0) || plat === undefined || bronze === undefined) return null;

    if ((wr / t) ** 3 > 1) return 1;
    if (t > bronze) return 0;
    if (t > plat) return 0.3 * ((bronze - t) / (bronze - plat));

    return 0.3 + 0.7 * (((wr / t) ** 3 - (wr / plat) ** 3) / (1 - (wr / plat) ** 3));
}

// Lowest first; a player is in the highest tier whose min they have reached.
// Colors are the site's --tier-* tokens.
export const TIERS = [
    { name: 'Unranked', min: 0, color: '#9e9e9e' },
    { name: 'Platinum', min: 0.3, color: '#61d5c0' },
    { name: 'Diamond', min: 0.4, color: '#69c1fc' },
    { name: 'Master III', min: 0.5, color: '#bf9bfc' },
    { name: 'Master II', min: 0.6, color: '#bf9bfc' },
    { name: 'Master I', min: 0.7, color: '#bf9bfc' },
    { name: 'Elite', min: 0.8, color: '#ff8880' },
    { name: 'Router', min: 0.9, color: '#ff8ccd' },
];

export function tierForScore(score) {
    const value = Number(score) || 0;
    let match = TIERS[0];
    for (const tier of TIERS) {
        if (value >= tier.min) match = tier;
        else break;
    }
    return match;
}

export function nextTier(score) {
    const value = Number(score) || 0;
    const next = TIERS.find((tier) => tier.min > value);
    return next ? { tier: next, needed: Number((next.min - value).toFixed(3)) } : null;
}
