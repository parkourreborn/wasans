// /stats -- everything about one player, defaulting to whoever ran it. The
// overview mirrors the site's profile header; tabs switch to their personal
// bests, combo bests, and their trial and combo runs without re-running the
// command.

import { SlashCommandBuilder } from 'discord.js';
import { getComboCategories } from '../comboCategories.js';
import { fetchPlayerAvatar } from '../render/avatar.js';
import { formatAge, formatCount, formatDate, formatScore, formatTime, normalizeState } from '../render/card.js';
import { renderBestsCard } from '../render/templates/bests.js';
import { renderStatsCard } from '../render/templates/stats.js';
import { resolvePlayerUrl } from '../resolvers.js';
import { playerChoices, playerName, playerUuid, resolvePlayer } from '../players.js';
import { nextTier, tierForScore, trialScore } from '../scoring.js';
import { getTrials } from '../trials.js';
import { apiGet, asArray, getTotal } from '../wasansApi.js';
import { categoryLabels, getWorldRecords, toNumber } from './data.js';
import { createSession, renderSession } from './session.js';
import { countRuns, runListView } from './submissions.js';

export const definition = new SlashCommandBuilder()
    .setName('stats')
    .setDescription("A player's stats: profile, personal bests, combo bests and runs")
    .addStringOption((option) =>
        option.setName('player').setDescription('Player name, @mention, or "me" (default: you)').setAutocomplete(true).setRequired(false),
    );

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'pbs', label: 'PBs' },
    { key: 'combos', label: 'Combos' },
    { key: 'runs', label: 'Runs' },
    { key: 'comboRuns', label: 'Combo runs' },
];

function single(name, render) {
    return { name, async load() { return { page: 0, totalPages: 1, ...render() }; } };
}

function lastPbLabel(pbs) {
    const latest = Math.max(0, ...pbs.map((pb) => Number(pb.date) || 0));
    if (!latest) return null;
    const age = formatAge(latest);
    return age === 'today' ? 'today' : `${age} ago`;
}

export async function execute(interaction) {
    const { player: found, error } = await resolvePlayer(interaction, interaction.options.getString('player'), { defaultToSelf: true });
    if (!found) {
        await interaction.editReply({ content: error || 'Player not found.' });
        return;
    }

    const uuid = playerUuid(found);
    const [detailPayload, trialRuns, approvedRuns, comboPayload, records, trials, categories, labels, everyone] = await Promise.all([
        apiGet(`players/${encodeURIComponent(uuid)}`, { include: 'pbs,combo_pbs,recent_submissions', submissions_limit: 3 }),
        countRuns({ kind: 'trial', player: found }).catch(() => null),
        countRuns({ kind: 'trial', player: found, state: 'approved' }).catch(() => null),
        apiGet('combo-submissions', { player_uuid: uuid, limit: 3 }).catch(() => null),
        getWorldRecords(),
        getTrials(),
        getComboCategories(),
        categoryLabels(),
        apiGet('players', { limit: 1 }).catch(() => null),
    ]);

    const player = detailPayload?.data?.player || found;
    const name = playerName(player);
    const pbs = Array.isArray(player.pbs) ? player.pbs : [];
    const comboPbs = Array.isArray(player.combo_pbs) ? player.combo_pbs : [];
    const avatarDataUri = await fetchPlayerAvatar(player);

    const pbByTrial = new Map(pbs.map((pb) => [pb.trial_name, pb]));
    const activeTrials = trials.filter((trial) => !trial.retired);
    const wrCount = records.list.filter((record) => record.player_uuid === uuid).length;
    const bestCombo = comboPbs.reduce((best, pb) => Math.max(best, toNumber(pb.combo_count) ?? 0), 0);
    const comboRunCount = getTotal(comboPayload);
    const score = toNumber(player.score) ?? 0;

    const recent = [
        ...(player.recent_submissions || []).map((run) => ({
            state: normalizeState(run.state),
            label: run.trial_name,
            kind: 'trial',
            value: run.time,
            date: run.date,
            isWr: records.uuids.has(run.uuid),
        })),
        ...asArray(comboPayload).map((run) => ({
            state: normalizeState(run.state),
            label: labels.get(run.category_slug) || run.category_slug,
            kind: 'combo',
            value: run.combo_count,
            date: run.date,
            isWr: false,
        })),
    ]
        .sort((a, b) => Number(b.date) - Number(a.date))
        .slice(0, 3);

    const overview = single('stats', () => ({
        card: renderStatsCard({
            name,
            avatarDataUri,
            tier: tierForScore(score),
            next: nextTier(score),
            score,
            rank: player.rank,
            totalPlayers: getTotal(everyone),
            joined: player.date_joined ? formatDate(player.date_joined) : null,
            lastPb: lastPbLabel(pbs),
            tiles: [
                { label: 'World records', value: String(wrCount), color: wrCount > 0 ? '#f7c747' : undefined },
                { label: 'Personal bests', value: String(activeTrials.filter((trial) => pbByTrial.has(trial.name)).length), suffix: `/ ${activeTrials.length}` },
                {
                    label: 'Trial runs',
                    value: trialRuns === null ? '—' : formatCount(trialRuns),
                    suffix: approvedRuns === null ? null : `${formatCount(approvedRuns)} approved`,
                },
                { label: 'Best combo', value: bestCombo ? formatCount(bestCombo) : '—', suffix: comboRunCount ? `${formatCount(comboRunCount)} runs` : null },
            ],
            recent,
        }),
    }));

    // Active trials, plus any retired one they still hold a PB on.
    const pbTrials = trials.filter((trial) => !trial.retired || pbByTrial.has(trial.name));
    const pbRows = pbTrials.map((trial) => {
        const pb = pbByTrial.get(trial.name);
        const wrTime = toNumber(records.byTrial.get(trial.name)?.time);
        return {
            label: trial.name,
            value: pb ? formatTime(pb.time) : null,
            score: pb && wrTime ? formatScore(trialScore(wrTime, pb.time, trial.name)) : '—',
            isWr: Boolean(pb && records.uuids.has(pb.submission_uuid)),
            uuid: pb?.submission_uuid,
        };
    });
    const pbView = single('pbs', () => ({
        card: renderBestsCard({
            eyebrow: 'Personal bests',
            title: name,
            meta: `${activeTrials.filter((trial) => pbByTrial.has(trial.name)).length} / ${activeTrials.length} trials`,
            rows: pbRows,
        }),
        options: pbRows.filter((row) => row.uuid).map((row) => ({ label: `${row.label} · ${row.value}`, value: `t:${row.uuid}`, description: row.isWr ? 'World record' : 'Personal best' })),
    }));

    const comboByCategory = new Map(comboPbs.map((pb) => [pb.category_slug, pb]));
    const comboRows = categories.map((category) => {
        const pb = comboByCategory.get(category.slug);
        return { label: category.label, value: pb ? formatCount(pb.combo_count) : null, uuid: pb?.submission_uuid };
    });
    const comboView = single('combo-bests', () => ({
        card: renderBestsCard({
            eyebrow: 'Combo bests',
            title: name,
            meta: `${comboRows.filter((row) => row.value).length} / ${comboRows.length} categories`,
            rows: comboRows,
            withScore: false,
            firstLabel: 'Category',
            valueLabel: 'Combo',
        }),
        options: comboRows.filter((row) => row.uuid).map((row) => ({ label: `${row.label} · ${row.value}`, value: `c:${row.uuid}`, description: 'Best combo' })),
    }));

    const sessionId = createSession({
        ownerId: interaction.user.id,
        tabs: TABS,
        views: {
            overview,
            pbs: pbView,
            combos: comboView,
            runs: runListView({ kind: 'trial', player }, { showChips: false }),
            comboRuns: runListView({ kind: 'combo', player }, { showChips: false }),
        },
        links: [{ label: 'Profile on wasans', url: resolvePlayerUrl(uuid) }],
    });

    await interaction.editReply(await renderSession(sessionId));
}

export async function autocomplete(interaction, focused) {
    if (focused.name === 'player') return playerChoices(interaction, focused.value);
    return [];
}
