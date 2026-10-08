// Turning whatever someone typed into a `player` option into a wasans player.
//
// Accepted forms, in the order they're checked:
//   (empty) / "me"      -> whoever ran the command (via their linked Discord)
//   <@id> / <@!id>      -> a Discord mention, resolved through the account link
//   p:<uuid>            -> a pick from the autocomplete list
//   @name               -> a Discord member search, then their account link
//   anything else       -> a wasans player name (exact, then prefix, then substring)
//
// Mentions are resolved by Discord id through the linked oauth record
// (admin/players/by-discord) rather than by guessing at a nickname and
// name-searching for it, which could silently match the wrong player.

import { apiGet, asArray, fetchPlayerUuidByDiscordId } from './wasansApi.js';

const MENTION = /^<@!?(\d{15,25})>$/;
const SNOWFLAKE = /^\d{15,25}$/;
const PICKED = /^p:([A-Za-z0-9_-]{6,64})$/;

export function playerName(item) {
    return item?.player_name || item?.name || 'Unknown player';
}

export function playerUuid(item) {
    return item?.uuid || item?.player_uuid || null;
}

async function playerByUuid(uuid) {
    const payload = await apiGet(`players/${encodeURIComponent(uuid)}`).catch(() => null);
    return payload?.data?.player || null;
}

async function searchPlayers(term, limit = 25) {
    return asArray(await apiGet('players', { search: term, limit }));
}

async function playerByName(term) {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) return null;

    const players = await searchPlayers(normalized);
    const named = (player) => playerName(player).toLowerCase();

    return (
        players.find((player) => named(player) === normalized) ||
        players.find((player) => named(player).startsWith(normalized)) ||
        players.find((player) => named(player).includes(normalized)) ||
        null
    );
}

async function playerByDiscordId(discordId, { self = false } = {}) {
    let uuid;
    try {
        uuid = await fetchPlayerUuidByDiscordId(discordId);
    } catch (error) {
        console.error('Failed to resolve player by Discord id:', error);
        return { player: null, error: 'Failed to look up that player. Please try again.' };
    }

    if (!uuid) {
        return {
            player: null,
            error: self
                ? "Your Discord account isn't linked to a wasans account. Log in at https://wasans.tully.sh with Discord, or name a player."
                : `<@${discordId}> hasn't linked their Discord account to a wasans account.`,
        };
    }

    const player = await playerByUuid(uuid);
    return { player, error: player ? null : 'Player not found.' };
}

async function searchGuildMembers(guild, query, limit = 10) {
    if (!guild || !query) return [];
    const members = await Promise.race([
        guild.members.search({ query, limit }).catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return members ? [...members.values()] : [];
}

// Resolves to { player, error }; `player` is the API's player row (uuid,
// player_name, score, discord fields, ...), `error` a message fit to show.
export async function resolvePlayer(interaction, input, { defaultToSelf = false } = {}) {
    const raw = String(input ?? '').trim();

    if (!raw) {
        if (!defaultToSelf) return { player: null, error: null };
        return playerByDiscordId(interaction.user.id, { self: true });
    }

    if (raw.toLowerCase() === 'me') return playerByDiscordId(interaction.user.id, { self: true });

    const mention = raw.match(MENTION) || (SNOWFLAKE.test(raw) ? [raw, raw] : null);
    if (mention) return playerByDiscordId(mention[1], { self: mention[1] === interaction.user.id });

    const picked = raw.match(PICKED);
    if (picked) {
        const player = await playerByUuid(picked[1]);
        return { player, error: player ? null : 'Player not found.' };
    }

    if (raw.startsWith('@')) {
        const [member] = await searchGuildMembers(interaction.guild, raw.slice(1), 1);
        if (member) return playerByDiscordId(member.id, { self: member.id === interaction.user.id });
    }

    const player = await playerByName(raw.replace(/^@/, ''));
    return { player, error: player ? null : `No player called "${raw}" was found.` };
}

function formatScore(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(3) : null;
}

function describe(player) {
    const parts = [playerName(player)];
    if (player?.rank) parts.push(`#${player.rank}`);
    const score = formatScore(player?.score ?? player?.overall_score);
    if (score) parts.push(score);
    return parts.join(' · ').slice(0, 100);
}

// Autocomplete choices for a `player` option. Typing "@" searches the
// server's members so a mention still works from inside an autocomplete box;
// anything else searches wasans names.
export async function playerChoices(interaction, typed) {
    const raw = String(typed ?? '').trim();
    const you = { name: 'Me (your linked account)', value: 'me' };

    try {
        const mention = raw.match(MENTION);
        if (mention) {
            return [{ name: `Mentioned user (${mention[1]})`, value: `<@${mention[1]}>` }];
        }

        if (raw.startsWith('@')) {
            const members = await searchGuildMembers(interaction.guild, raw.slice(1));
            return members.slice(0, 25).map((member) => ({
                name: `@${member.displayName}${member.user?.username && member.user.username !== member.displayName ? ` (${member.user.username})` : ''}`.slice(0, 100),
                value: `<@${member.id}>`,
            }));
        }

        const players = raw ? await searchPlayers(raw, 24) : asArray(await apiGet('players', { limit: 24 }));
        const choices = players
            .filter((player) => playerUuid(player))
            .map((player) => ({ name: describe(player), value: `p:${playerUuid(player)}` }));

        if (!raw || 'me'.startsWith(raw.toLowerCase())) choices.unshift(you);
        return choices.slice(0, 25);
    } catch {
        return raw ? [] : [you];
    }
}
