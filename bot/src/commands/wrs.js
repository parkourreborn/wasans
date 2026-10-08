// /wrs -- every trial's current world record, or one trial's whole chain of
// records (the site's WR history tab).

import { SlashCommandBuilder } from 'discord.js';
import { formatTime } from '../render/card.js';
import { renderWrHistoryCard, renderWrsCard } from '../render/templates/wrs.js';
import { playerName } from '../players.js';
import { getTrials, resolveTrial } from '../trials.js';
import { apiGet, asArray } from '../wasansApi.js';
import { getWorldRecords, trialChoices } from './data.js';
import { clampPage, createSession, pageCount, renderSession } from './session.js';

const PAGE_SIZE = 12;
const DAY = 86400;

export const definition = new SlashCommandBuilder()
    .setName('wrs')
    .setDescription("World records, or one trial's world record history")
    .addStringOption((option) =>
        option.setName('trial').setDescription("Show this trial's world record history").setAutocomplete(true).setRequired(false),
    );

function pagedView(name, rows, render) {
    const totalPages = pageCount(rows.length, PAGE_SIZE);
    return {
        name,
        async load(requestedPage) {
            const page = clampPage(requestedPage, totalPages);
            const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            return {
                page,
                totalPages,
                card: render(slice, totalPages > 1 ? `Page ${page + 1} / ${totalPages}` : null),
                options: slice
                    .filter((row) => row.uuid)
                    .map((row) => ({ label: `${row.trial} · ${formatTime(row.time)}`, value: `t:${row.uuid}`, description: row.holder })),
            };
        },
    };
}

async function allRecordsView() {
    const [records, trials] = await Promise.all([getWorldRecords(), getTrials()]);
    const order = new Map(trials.map((trial, index) => [trial.name, index]));
    const retired = new Set(trials.filter((trial) => trial.retired).map((trial) => trial.name));

    const rows = [...records.list]
        .sort((a, b) => (order.get(a.trial_name) ?? 999) - (order.get(b.trial_name) ?? 999))
        .map((record) => ({
            uuid: record.submission_uuid,
            trial: record.trial_name,
            holder: playerName(record),
            time: record.time,
            date: record.date,
            retired: retired.has(record.trial_name),
        }));

    return pagedView('wrs', rows, (slice, footerRight) => renderWrsCard({ rows: slice, meta: `${rows.length} trials`, footerRight }));
}

async function historyView(trial) {
    const [payload, records] = await Promise.all([apiGet(`records/world/history/${encodeURIComponent(trial.name)}`), getWorldRecords()]);
    const chain = asArray(payload);
    const currentUuid = records.byTrial.get(trial.name)?.submission_uuid || null;
    const now = Date.now() / 1000;

    const rows = chain
        .map((run, index) => {
            const previous = index > 0 ? chain[index - 1] : null;
            const next = index < chain.length - 1 ? chain[index + 1] : null;
            return {
                uuid: run.uuid,
                trial: trial.name,
                holder: playerName(run),
                time: run.time,
                date: run.date,
                improvement: previous ? Number(run.time) - Number(previous.time) : null,
                stoodDays: Math.max(0, Math.floor(((next ? next.date : now) - run.date) / DAY)),
                // After a trial version bump the newest link may not be the
                // record that counts, so "current" follows the real WR.
                current: currentUuid ? run.uuid === currentUuid : !next,
            };
        })
        .reverse();

    return pagedView(`wr-history-${trial.name.toLowerCase().replace(/\s+/g, '-')}`, rows, (slice, footerRight) =>
        renderWrHistoryCard({ trial: trial.name, rows: slice, meta: `${rows.length} record${rows.length === 1 ? '' : 's'}`, footerRight }),
    );
}

export async function execute(interaction) {
    const trialInput = interaction.options.getString('trial');
    let view;

    if (trialInput) {
        const trial = await resolveTrial(trialInput);
        if (!trial) {
            await interaction.editReply({ content: `"${trialInput}" isn't a trial. Pick one from the list.` });
            return;
        }
        view = await historyView(trial);
    } else {
        view = await allRecordsView();
    }

    const sessionId = createSession({ ownerId: interaction.user.id, views: { list: view } });
    await interaction.editReply(await renderSession(sessionId));
}

export async function autocomplete(interaction, focused) {
    if (focused.name === 'trial') return trialChoices(focused.value);
    return [];
}
