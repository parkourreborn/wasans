// Discord avatars are pulled in as data URIs because resvg only rasterises
// images that are already embedded in the SVG it is handed.
const AVATAR_SIZE = 128;
const FETCH_TIMEOUT_MS = 4000;

export function avatarUrl(discordId, avatarHash) {
    const id = String(discordId || '').trim();
    const hash = String(avatarHash || '').trim();

    if (/^\d+$/.test(id) && hash) {
        return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=${AVATAR_SIZE}`;
    }

    if (/^\d+$/.test(id)) {
        const index = Number((BigInt(id) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    }

    return null;
}

export function nameInitials(name) {
    const value = String(name || '').trim();
    if (!value) return 'WA';

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

// Returns null on any failure — every template that uses this falls back to
// drawing initials, so a slow CDN can never break a command.
export async function fetchAvatarDataUri(discordId, avatarHash) {
    const url = avatarUrl(discordId, avatarHash);
    if (!url) return null;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!response.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0) return null;

        return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
        return null;
    }
}
