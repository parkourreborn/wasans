// /leaderboard -- every board the site has, from one option: overall, any
// trial, any combo category, or the combo overview. `player` opens the page
// that player is on with their row highlighted, the bot's "Jump to me".

import { SlashCommandBuilder } from 'discord.js';
import { getComboCategories } from '../comboCategories.js';
import { formatCount } from '../render/card.js';
import { renderAttachment } from '../render/png.js';
import { renderComboOverviewCard } from '../render/templates/comboOverview.js';
import { renderLeaderboardCard } from '../render/templates/leaderboard.js';
import { playerChoices, playerName, playerUuid, resolvePlayer } from '../players.js';
import { tierForScore, trialScore } from '../scoring.js';
import { apiGet, asArray, getTotal } from '../wasansApi.js';
import { getWorldRecords, resolveTarget, targetChoices, toNumber } from './data.js';
import { clampPage, createSession, pageCount, renderSession } from './session.js';

const PAGE_SIZE = 10;
const OVERVIEW_PER_CATEGORY = 3;
// One tall card gets scaled down to illegibility in Discord, and each
// category costs a request; past this many the overview points at the
// per-category boards for the rest.
const OVERVIEW_MAX_CATEGORIES = 8;

export const definition = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Overall, trial and combo leaderboards')
    .addStringOption((option) =>
        option.setName('board').setDescription('Overall (default), a trial, a combo category, or every combo category').setAutocomplete(true).setRequired(false),
    )
    .addStringOption((option) =>
        option.setName('player').setDescription('Jump to this player: name, @mention, or "me"').setAutocomplete(true).setRequired(false),
    );

const EXTRA_BOARDS = [
    { name: 'Overall', value: 'overall', match: 'overall score' },
    { name: 'Combos · every category', value: 'combos', match: 'combos all every' },
];

function rangeMeta(page, rowCount, total, noun = 'of') {
    if (total === 0 || rowCount === 0) return null;
    const first = page * PAGE_SIZE + 1;
    return `Ranks ${formatCount(first)}–${formatCount(first + rowCount - 1)} ${noun} ${formatCount(total)}`;
}

function menuOption(row, uuid, prefix, description) {
    return uuid ? { label: `#${row.rank ?? '—'} ${row.name}`, value: `${prefix}:${uuid}`, description } : null;
}

// ---- overall --------------------------------------------------------------

function overallView(highlightUuid) {
    return {
        name: 'leaderboard',
        async load(requestedPage) {
            let page = Math.max(Number(requestedPage) || 0, 0);
            const fetchPage = (index) => apiGet('players', { page: index + 1, limit: PAGE_SIZE });

            let [payload, records] = await Promise.all([fetchPage(page), getWorldRecords()]);
            const total = getTotal(payload) ?? 0;
            const totalPages = pageCount(total, PAGE_SIZE);
            if (page !== clampPage(page, totalPages)) {
                page = clampPage(page, totalPages);
                payload = await fetchPage(page);
            }

            const wrCounts = new Map();
            for (const record of records.list) wrCounts.set(record.player_uuid, (wrCounts.get(record.player_uuid) || 0) + 1);

            const rows = asArray(payload).map((player, index) => ({
                rank: player.rank ?? page * PAGE_SIZE + index + 1,
                name: playerName(player),
                tier: tierForScore(player.score),
                wrs: wrCounts.get(playerUuid(player)) || 0,
                score: player.score,
                highlighted: Boolean(highlightUuid) && playerUuid(player) === highlightUuid,
            }));

            return {
                page,
                totalPages,
                card: renderLeaderboardCard({
                    variant: 'overall',
                    eyebrow: 'Wasans · Leaderboard',
                    title: 'Overall',
                    meta: rangeMeta(page, rows.length, total),
                    rows,
                    footerRight: totalPages > 1 ? `Page ${page + 1} / ${totalPages}` : null,
                }),
            };
        },
    };
}

// ---- trial ------------------------------------------------------------------

function trialView(trial, highlightUuid) {
    return {
        name: `leaderboard-${trial.name.toLowerCase().replace(/\s+/g, '-')}`,
        async load(requestedPage) {
            let page = Math.max(Number(requestedPage) || 0, 0);
            const path = `leaderboards/trials/${encodeURIComponent(trial.name)}`;
            const fetchPage = (index) => apiGet(path, { page: index + 1, limit: PAGE_SIZE });

            let payload = await fetchPage(page);
            const total = getTotal(payload) ?? 0;
            const totalPages = pageCount(total, PAGE_SIZE);
            if (page !== clampPage(page, totalPages)) {
                page = clampPage(page, totalPages);
                payload = await fetchPage(page);
            }

            const wr = payload?.data?.wr || null;
            const wrTime = toNumber(wr?.time);
            const entries = asArray(payload).filter((entry) => toNumber(entry.time) !== null);

            const rows = entries.map((entry, index) => {
                const time = toNumber(entry.time);
                return {
                    uuid: entry.submission_uuid,
                    rank: entry.rank ?? page * PAGE_SIZE + index + 1,
                    name: playerName(entry),
                    time,
                    date: entry.date,
                    isWr: Boolean(wr?.submission_uuid && wr.submission_uuid === entry.submission_uuid),
                    gap: wrTime ? time - wrTime : null,
                    score: wrTime ? trialScore(wrTime, time, trial.name) : null,
                    highlighted: Boolean(highlightUuid) && entry.player_uuid === highlightUuid,
                };
            });

            return {
                page,
                totalPages,
                card: renderLeaderboardCard({
                    variant: 'trial',
                    eyebrow: trial.retired ? 'Wasans · Trial leaderboard · Retired' : 'Wasans · Trial leaderboard',
                    title: trial.name,
                    meta: rangeMeta(page, rows.length, total),
                    rows,
                    emptyMessage: 'No times on this trial yet.',
                    footerRight: totalPages > 1 ? `Page ${page + 1} / ${totalPages}` : null,
                }),
                options: rows.map((row) => menuOption(row, row.uuid, 't', `${trial.name} · ${row.time.toFixed(3)}`)),
            };
        },
    };
}

// ---- combo ------------------------------------------------------------------

// The endpoint ranks every player, unranked ones (null count) last, so one
// fetch of the ranked ones is the whole board; it pages locally.
async function fetchComboBoard(slug) {
    const payload = await apiGet(`leaderboards/combos/${encodeURIComponent(slug)}`, { limit: 500 });
    return asArray(payload).filter((entry) => toNumber(entry.combo_count) !== null);
}

function comboView(category, entries, highlightUuid) {
    const totalPages = pageCount(entries.length, PAGE_SIZE);
    return {
        name: `combos-${category.slug}`,
        async load(requestedPage) {
            const page = clampPage(requestedPage, totalPages);
            const rows = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry, index) => ({
                uuid: entry.submission_uuid,
                rank: entry.rank ?? page * PAGE_SIZE + index + 1,
                name: playerName(entry),
                combo: entry.combo_count,
                date: entry.date,
                highlighted: Boolean(highlightUuid) && entry.player_uuid === highlightUuid,
            }));

            return {
                page,
                totalPages,
                card: renderLeaderboardCard({
                    variant: 'combo',
                    eyebrow: 'Wasans · Combo leaderboard',
                    title: category.label,
                    meta: rangeMeta(page, rows.length, entries.length),
                    rows,
                    emptyMessage: 'No approved combos in this category yet.',
                    footerRight: totalPages > 1 ? `Page ${page + 1} / ${totalPages}` : null,
                }),
                options: rows.map((row) => menuOption(row, row.uuid, 'c', `${category.label} · ${formatCount(row.combo)}`)),
            };
        },
    };
}

async function sendComboOverview(interaction, note = '') {
    const all = await getComboCategories();
    if (all.length === 0) {
        await interaction.editReply({ content: 'No combo categories are active right now.' });
        return;
    }

    const categories = all.slice(0, OVERVIEW_MAX_CATEGORIES);
    const boards = await Promise.all(
        categories.map(async (category) => {
            const entries = await fetchComboBoard(category.slug).catch(() => null);
            return {
                label: category.label,
                total: entries === null ? null : entries.length,
                entries: (entries || []).slice(0, OVERVIEW_PER_CATEGORY).map((entry, index) => ({
                    rank: entry.rank ?? index + 1,
                    name: playerName(entry),
                    combo: entry.combo_count,
                })),
            };
        }),
    );

    const { svg, width } = renderComboOverviewCard({ categories: boards, perCategory: OVERVIEW_PER_CATEGORY, omitted: all.length - categories.length });
    await interaction.editReply({ content: note, embeds: [], files: [renderAttachment(svg, width, 'combos')], attachments: [], components: [] });
}

// ---- command ----------------------------------------------------------------

export async function execute(interaction) {
    const boardInput = String(interaction.options.getString('board') || '').trim();
    const playerInput = interaction.options.getString('player');

    let player = null;
    if (playerInput) {
        const resolved = await resolvePlayer(interaction, playerInput);
        if (!resolved.player) {
            await interaction.editReply({ content: resolved.error || 'Player not found.' });
            return;
        }
        player = resolved.player;
    }
    const highlight = player ? playerUuid(player) : null;

    let view;
    let page = 0;
    let content = '';

    if (!boardInput || boardInput.toLowerCase() === 'overall') {
        view = overallView(highlight);
        if (player) {
            // The players endpoint gives each player's place in score order,
            // which is exactly the overall board's paging.
            const detail = await apiGet(`players/${encodeURIComponent(highlight)}`).catch(() => null);
            const position = toNumber(detail?.data?.player?.position);
            if (position) page = Math.floor((position - 1) / PAGE_SIZE);
        }
    } else if (['combos', 'combo', 'all combos'].includes(boardInput.toLowerCase())) {
        await sendComboOverview(interaction, player ? 'This overview only shows the top 3 per category. Pick a category as the board to find a player on it.' : '');
        return;
    } else {
        const target = await resolveTarget(boardInput);
        if (!target) {
            await interaction.editReply({ content: `"${boardInput}" isn't a board. Pick one from the list: Overall, a trial, or a combo category.` });
            return;
        }

        if (target.kind === 'trial') {
            view = trialView(target.trial, highlight);
            if (player) {
                const mine = await apiGet(`leaderboards/trials/${encodeURIComponent(target.trial.name)}`, { page: 1, limit: 1, player: highlight }).catch(() => null);
                const position = toNumber(mine?.data?.player?.position);
                if (position) page = Math.floor((position - 1) / PAGE_SIZE);
                else content = `${playerName(player)} has no time on ${target.trial.name} yet.`;
            }
        } else {
            const entries = await fetchComboBoard(target.category.slug);
            view = comboView(target.category, entries, highlight);
            if (player) {
                const index = entries.findIndex((entry) => entry.player_uuid === highlight);
                if (index >= 0) page = Math.floor(index / PAGE_SIZE);
                else content = `${playerName(player)} has no approved combo in ${target.category.label} yet.`;
            }
        }
    }

    const sessionId = createSession({ ownerId: interaction.user.id, views: { board: view }, page });
    const message = await renderSession(sessionId);
    await interaction.editReply({ ...message, content: content || message.content });
}

export async function autocomplete(interaction, focused) {
    if (focused.name === 'board') return targetChoices(focused.value, { extra: EXTRA_BOARDS });
    if (focused.name === 'player') return playerChoices(interaction, focused.value);
    return [];
}
