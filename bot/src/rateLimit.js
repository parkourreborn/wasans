// Sliding-window rate limiter: each key keeps the timestamps of its recent
// hits, and a hit is allowed while fewer than `limit` of them still fall inside
// the window.

const SWEEP_THRESHOLD = 500;

export function createRateLimiter({ limit, windowMs }) {
    if (!Number.isFinite(limit) || limit < 1) {
        throw new TypeError('rate limiter needs a positive limit');
    }

    if (!Number.isFinite(windowMs) || windowMs < 1) {
        throw new TypeError('rate limiter needs a positive windowMs');
    }

    const hits = new Map();

    // Drops the expired timestamps for one key and returns what is left, or
    // null once the key has nothing inside the window (so idle keys don't
    // accumulate).
    function live(key, now) {
        const timestamps = hits.get(key);
        if (!timestamps) return null;

        const cutoff = now - windowMs;
        let expired = 0;
        // Timestamps are appended in order, so the expired ones are a prefix.
        while (expired < timestamps.length && timestamps[expired] <= cutoff) expired += 1;
        if (expired > 0) timestamps.splice(0, expired);

        if (timestamps.length === 0) {
            hits.delete(key);
            return null;
        }

        return timestamps;
    }

    return {
        // Records a hit and returns { allowed: true }, or refuses with the wait
        // until the oldest hit falls out of the window and frees a slot.
        tryConsume(key, now = Date.now()) {
            const timestamps = live(key, now);

            if (timestamps && timestamps.length >= limit) {
                return { allowed: false, retryAfterMs: Math.max(timestamps[0] + windowMs - now, 0) };
            }

            const updated = timestamps || [];
            updated.push(now);
            hits.set(key, updated);

            if (hits.size > SWEEP_THRESHOLD) {
                for (const staleKey of [...hits.keys()]) live(staleKey, now);
            }

            return { allowed: true, retryAfterMs: 0 };
        },

        get size() {
            return hits.size;
        },
    };
}
