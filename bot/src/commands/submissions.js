// /submissions -- the site's Submissions pages in Discord. Filter by player,
// trial or combo category, and status; the `run` option's autocomplete lists
// the actual runs matching those filters, so finding one specific
// submission is: fill in what you know, then pick it. Pointed at a single
// run (or filters that only match one), it answers with that run's card
// instead of a list.

import { SlashCommandBuilder } from 'discord.js';
import { formatCount, formatDate, formatTime, normalizeState } from '../render/card.js';
import { renderSubmissionsCard } from '../render/templates/submissions.js';
import { playerChoices, playerName, playerUuid, resolvePlayer } from '../players.js';
import { apiGet, asArray, getTotal } from '../wasansApi.js';
import { categoryLabels, getWorldRecords, resolveTarget, targetChoices } from './data.js';
import { buildRunMessage, parseRunRef } from './runCard.js';
import { clampPage, createSession, pageCount, renderSession } from './session.js';

const PAGE_SIZE = 10;
const STATES = ['approved', 'pending', 'denied'];

export const definition = new SlashCommandBuilder()
    .setName('submissions')
    .setDescription('Browse runs, or open one: filter by player, trial or combo category, and status')
    .addStringOption((option) =>
        option.setName('player').setDescription('Player name, @mention, or "me"').setAutocomplete(true).setRequired(false),
    )
    .addStringOption((option) =>
        option.setName('on').setDescription('A trial or a combo category').setAutocomplete(true).setRequired(false),
    )
    .addStringOption((option) =>
        option
            .setName('status')
            .setDescription('Only runs in this state')
            .addChoices({ name: 'Approved', value: 'approved' }, { name: 'Pending', value: 'pending' }, { name: 'Denied', value: 'denied' })
            .setRequired(false),
    )
    .addStringOption((option) =>
        option
            .setName('run')
            .setDescription('Open one run: pick from the runs matching your filters, or paste its link')
            .setAutocomplete(true)
            .setRequired(false),
    );

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function queryFor({ kind, player, target, state }, page, limit) {
    if (kind === 'combo') {
        return {
            path: 'combo-submissions',
            query: { player_uuid: player ? playerUuid(player) : undefined, category: target?.category?.slug, state, page: page + 1, limit },
        };
    }

    return {
        path: 'submissions',
        query: { player_uuid: player ? playerUuid(player) : undefined, trial_search: target?.trial?.name.toLowerCase(), state, page: page + 1, limit },
    };
}

// Trial search is a substring match on the API side; keep only exact trial
// matches so "Flow" never pulls in some future "Overflow".
function exactTrial(rows, target) {
    return target?.trial ? rows.filter((row) => row.trial_name === target.trial.name) : rows;
}

export async function countRuns(filters) {
    const { path, query } = queryFor(filters, 0, 1);
    return getTotal(await apiGet(path, query)) ?? 0;
}

// A list of runs as a session view. `filters`: { kind, player, target, state }.
export function runListView(filters, { title = null, showChips = true } = {}) {
    const { kind, player, target, state } = filters;

    return {
        name: kind === 'combo' ? 'combo-runs' : 'runs',
        async load(requestedPage) {
            let page = Math.max(Number(requestedPage) || 0, 0);
            const fetchPage = async (index) => {
                const { path, query } = queryFor(filters, index, PAGE_SIZE);
                return apiGet(path, query);
            };

            let payload = await fetchPage(page);
            const total = getTotal(payload) ?? 0;
            const totalPages = pageCount(total, PAGE_SIZE);
            if (page !== clampPage(page, totalPages)) {
                page = clampPage(page, totalPages);
                payload = await fetchPage(page);
            }

            const [records, labels] = await Promise.all([kind === 'trial' ? getWorldRecords() : null, kind === 'combo' ? categoryLabels() : null]);
            const runs = exactTrial(asArray(payload), target);

            const rows = runs.map((run) =>
                kind === 'combo'
                    ? {
                          uuid: run.uuid,
                          state: normalizeState(run.state),
                          label: labels.get(run.category_slug) || run.category_slug,
                          player: playerName(run),
                          date: run.date,
                          value: run.combo_count,
                          isWr: false,
                      }
                    : {
                          uuid: run.uuid,
                          state: normalizeState(run.state),
                          label: run.trial_name,
                          player: playerName(run),
                          date: run.date,
                          value: run.time,
                          isWr: records.uuids.has(run.uuid),
                      },
            );

            const chips = [];
            if (showChips) {
                // The title already names the player when there is one.
                if (target) chips.push({ label: kind === 'combo' ? 'Category' : 'Trial', value: kind === 'combo' ? target.category.label : target.trial.name });
                if (state) chips.push({ label: 'Status', value: capitalize(state) });
            }

            const noun = kind === 'combo' ? 'combo' : 'run';
            const card = renderSubmissionsCard({
                kind,
                eyebrow: 'Wasans · Submissions',
                title: title || (player ? `${playerName(player)}'s ${noun}s` : kind === 'combo' ? 'Combo runs' : 'Trial runs'),
                meta: `${formatCount(total)} ${noun}${total === 1 ? '' : 's'}`,
                chips,
                rows,
                showPlayer: !player,
                emptyMessage: kind === 'combo' ? 'No combos match these filters.' : 'No runs match these filters.',
                footerRight: totalPages > 1 ? `Page ${page + 1} / ${totalPages}` : null,
            });

            return {
                card,
                page,
                totalPages,
                total,
                options: rows.map((row) => ({
                    label: `${row.label} · ${kind === 'combo' ? formatCount(row.value) : formatTime(row.value)}`,
                    description: `${row.player} · ${capitalize(row.state)} · ${formatDate(row.date)}`,
                    value: `${kind === 'combo' ? 'c' : 't'}:${row.uuid}`,
                })),
                single: total === 1 && rows[0] ? { kind, uuid: rows[0].uuid } : null,
            };
        },
    };
}

// `lenient` (autocomplete) skips a filter that doesn't resolve yet -- the
// user may still be typing it -- instead of failing.
async function readFilters(interaction, { lenient = false } = {}) {
    const playerInput = interaction.options.getString('player');
    const targetInput = interaction.options.getString('on');
    const stateInput = interaction.options.getString('status');

    let player = null;
    if (playerInput) {
        const resolved = await resolvePlayer(interaction, playerInput);
        if (!resolved.player && !lenient) return { error: resolved.error || 'Player not found.' };
        player = resolved.player;
    }

    let target = null;
    if (targetInput) {
        target = await resolveTarget(targetInput);
        if (!target && !lenient) return { error: `"${targetInput}" isn't a trial or a combo category. Pick one from the list.` };
    }

    return { player, target, state: STATES.includes(stateInput) ? stateInput : undefined };
}

export async function execute(interaction) {
    const runInput = interaction.options.getString('run');
    if (runInput) {
        const message = await buildRunMessage(runInput);
        await interaction.editReply(message.error ? { content: message.error } : message);
        return;
    }

    const filters = await readFilters(interaction);
    if (filters.error) {
        await interaction.editReply({ content: filters.error });
        return;
    }

    const { player, target, state } = filters;

    // A trial or category picks the kind; with neither, both kinds get a tab.
    if (target) {
        const view = runListView({ kind: target.kind, player, target, state });
        const first = await view.load(0);
        if (first.single) {
            await interaction.editReply(await buildRunMessage(first.single));
            return;
        }

        const sessionId = createSession({ ownerId: interaction.user.id, views: { list: view } });
        await interaction.editReply(await renderSession(sessionId));
        return;
    }

    const views = {
        trial: runListView({ kind: 'trial', player, state }),
        combo: runListView({ kind: 'combo', player, state }),
    };
    const [trialTotal, comboTotal] = await Promise.all([countRuns({ kind: 'trial', player, state }), countRuns({ kind: 'combo', player, state })]);

    if (trialTotal + comboTotal === 1) {
        const only = await views[trialTotal === 1 ? 'trial' : 'combo'].load(0);
        if (only.single) {
            await interaction.editReply(await buildRunMessage(only.single));
            return;
        }
    }

    const sessionId = createSession({
        ownerId: interaction.user.id,
        views,
        tab: trialTotal === 0 && comboTotal > 0 ? 'combo' : 'trial',
        tabs: [
            { key: 'trial', label: `Trial runs (${formatCount(trialTotal)})` },
            { key: 'combo', label: `Combos (${formatCount(comboTotal)})` },
        ],
    });
    await interaction.editReply(await renderSession(sessionId));
}

// ---- autocomplete --------------------------------------------------------

function runChoice(kind, run, labels) {
    const parts = kind === 'combo'
        ? [labels.get(run.category_slug) || run.category_slug, formatCount(run.combo_count)]
        : [run.trial_name, formatTime(run.time)];
    parts.push(capitalize(normalizeState(run.state)), playerName(run), formatDate(run.date));
    return { name: parts.join(' · ').slice(0, 100), value: `${kind === 'combo' ? 'c' : 't'}:${run.uuid}` };
}

async function runChoices(interaction, typed) {
    const text = String(typed || '').trim();
    const pasted = parseRunRef(text);
    if (pasted && (text.includes('/') || /^[tc]:/.test(text) || /^[A-Za-z0-9_-]{20,}$/.test(text))) {
        const prefix = pasted.kind ? `${pasted.kind === 'combo' ? 'c' : 't'}:` : '';
        return [{ name: 'Open this submission', value: `${prefix}${pasted.uuid}` }];
    }

    const filters = await readFilters(interaction, { lenient: true });

    const { player, target, state } = filters;
    const kind = target?.kind || 'trial';
    const narrowed = Boolean(player || target);
    const { path, query } = queryFor({ kind, player, target, state }, 0, narrowed ? 100 : 25);
    // With nothing else to go on, the typed text searches trial and player
    // names the way the site's search box does.
    if (!narrowed && text) query.search = text.toLowerCase();

    const [payload, labels] = await Promise.all([apiGet(path, query), categoryLabels()]);
    const choices = exactTrial(asArray(payload), target).map((run) => runChoice(kind, run, labels));

    const needle = text.toLowerCase();
    return (narrowed && needle ? choices.filter((choice) => choice.name.toLowerCase().includes(needle)) : choices).slice(0, 25);
}

export async function autocomplete(interaction, focused) {
    if (focused.name === 'player') return playerChoices(interaction, focused.value);
    if (focused.name === 'on') return targetChoices(focused.value);
    if (focused.name === 'run') return runChoices(interaction, focused.value);
    return [];
}
