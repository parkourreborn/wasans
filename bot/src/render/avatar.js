// Images are pulled in as data URIs because resvg only rasterises images that
// are already embedded in the SVG it is handed. They're cached for a while:
// the same avatars and run previews come up again and again.

const AVATAR_SIZE = 128;
const FETCH_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED = 200;
const SITE_API = 'https://wasans.tully.sh/v2/';
const ASSETS = 'https://assets.wasans.tully.sh/scores/';

const cache = new Map();

// Which image the site shows for a player (components/custom/player-avatar.tsx):
// their picked Roblox headshot, else their Discord avatar, else initials.
export function playerAvatarUrl(player) {
    if (!player) return null;
    const uuid = player.uuid || player.player_uuid;

    if (Number(player.has_roblox_avatar) && uuid) {
        return `${SITE_API}players/${encodeURIComponent(uuid)}/avatar`;
    }

    const id = String(player.discord_id || '').trim();
    if (!/^\d+$/.test(id)) return null;
    if (player.auth_provider && player.auth_provider !== 'discord') return null;

    const hash = String(player.discord_avatar || '').trim();
    if (hash) return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=${AVATAR_SIZE}`;

    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
}

export function runPreviewUrl(submissionUuid) {
    return submissionUuid ? `${ASSETS}${encodeURIComponent(submissionUuid)}-preview.jpg` : null;
}

const YOUTUBE_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/;

export function youtubeThumbnailUrl(url) {
    const match = String(url || '').match(YOUTUBE_ID);
    return match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : null;
}

const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// Returns null on any failure -- every card that embeds an image has a
// fallback, so a slow CDN can never break a command.
export async function fetchImageDataUri(url) {
    if (!url) return null;

    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    let value = null;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (response.ok) {
            const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length > 0 && SUPPORTED.has(type)) value = `data:${type};base64,${buffer.toString('base64')}`;
        }
    } catch {
        value = null;
    }

    cache.set(url, { value, expiresAt: Date.now() + (value ? CACHE_TTL_MS : 60_000) });
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);

    return value;
}

export function fetchPlayerAvatar(player) {
    return fetchImageDataUri(playerAvatarUrl(player));
}

export function nameInitials(name) {
    const value = String(name || '').trim();
    if (!value) return 'WA';

    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}
