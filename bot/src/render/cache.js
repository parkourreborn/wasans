// Paging back and forth would otherwise re-rasterise cards the bot has already
// drawn. A pagination context's rows are snapshotted when the command runs and
// never change, so a cache hit is byte-identical to a fresh render.
//
// Bounded by entry count rather than bytes: cards are all roughly the same
// size, so 64 of them is on the order of 10 MB.
const MAX_ENTRIES = 64;

const entries = new Map();

export function cachedRender(key, render) {
    const hit = entries.get(key);
    if (hit) {
        // Re-insert to mark it as most recently used.
        entries.delete(key);
        entries.set(key, hit);
        return hit;
    }

    const png = render();
    entries.set(key, png);

    while (entries.size > MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        entries.delete(oldest);
    }

    return png;
}

export function clearRenderCache() {
    entries.clear();
}

export function renderCacheSize() {
    return entries.size;
}
