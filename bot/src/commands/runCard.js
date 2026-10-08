// One submission as its own card -- what /submissions answers with when it's
// pointed at a single run, and what the "Open a run" menus open.

import { fetchImageDataUri, fetchPlayerAvatar, runPreviewUrl, youtubeThumbnailUrl } from '../render/avatar.js';
import { formatCount, formatDate, formatDelta, formatScore, formatTime, normalizeState } from '../render/card.js';
import { renderAttachment } from '../render/png.js';
import { renderSubmissionCard } from '../render/templates/submission.js';
import { theme } from '../render/theme.js';
import { resolveSubmissionUrl } from '../resolvers.js';
import { tierForScore, trialScore } from '../scoring.js';
import { apiGet } from '../wasansApi.js';
import { categoryLabels, getWorldRecords, toNumber } from './data.js';
import { componentId, linkRow } from './session.js';

const UUID = /^[A-Za-z0-9_-]{6,64}$/;

// Accepts "t:<uuid>" / "c:<uuid>" (autocomplete and menu values), a pasted
// site link, or a bare id. Resolves to { kind: 'trial' | 'combo' | null, uuid } or null.
export function parseRunRef(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    const prefixed = raw.match(/^([tc]):(.+)$/);
    if (prefixed && UUID.test(prefixed[2])) return { kind: prefixed[1] === 't' ? 'trial' : 'combo', uuid: prefixed[2] };

    const linked = raw.match(/\/submissions\/([A-Za-z0-9_-]{6,64})/);
    if (linked) return { kind: null, uuid: linked[1] };

    return UUID.test(raw) ? { kind: null, uuid: raw } : null;
}

async function fetchRun(kind, uuid) {
    const path = kind === 'trial' ? 'submissions' : 'combo-submissions';
    const payload = await apiGet(`${path}/${encodeURIComponent(uuid)}`).catch(() => null);
    return payload?.data?.results?.[0] || null;
}

// Finds the run, trying trial runs first when the kind isn't known.
async function findRun(ref) {
    if (ref.kind) {
        const run = await fetchRun(ref.kind, ref.uuid);
        return run ? { kind: ref.kind, run } : null;
    }

    const [trial, combo] = await Promise.all([fetchRun('trial', ref.uuid), fetchRun('combo', ref.uuid)]);
    if (trial) return { kind: 'trial', run: trial };
    if (combo) return { kind: 'combo', run: combo };
    return null;
}

function formatDateTime(unixSeconds) {
    const seconds = Number(unixSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const date = new Date(seconds * 1000);
    const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
    return `${formatDate(seconds)}, ${time}`;
}

const VIDEO_PLACEHOLDER = { processing: 'Video processing', failed: 'Video failed' };

async function trialCard(run) {
    const time = toNumber(run.time);
    const [records, playerPayload, preview] = await Promise.all([
        getWorldRecords(),
        apiGet(`players/${encodeURIComponent(run.player_uuid)}`, { include: 'pbs' }).catch(() => null),
        run.video_status && run.video_status !== 'ready' ? null : fetchImageDataUri(runPreviewUrl(run.uuid)),
    ]);

    const player = playerPayload?.data?.player || null;
    const avatarDataUri = await fetchPlayerAvatar(player);
    const wr = records.byTrial.get(run.trial_name) || null;
    const wrTime = toNumber(wr?.time);
    const pb = (player?.pbs || []).find((entry) => entry.trial_name === run.trial_name) || null;
    const isWr = Boolean(wr && wr.submission_uuid === run.uuid);
    const isPb = Boolean(pb && pb.submission_uuid === run.uuid);
    const score = wrTime && time ? trialScore(wrTime, time, run.trial_name) : null;

    const facts = [{ label: 'Trial score', value: formatScore(score), strong: true }];

    if (isWr) facts.push({ label: 'World record', value: 'This run', color: theme.gold });
    else if (wrTime) facts.push({ label: 'World record', value: `${formatTime(wrTime)}  ${formatDelta(time - wrTime)}` });

    if (isPb && pb.rank) facts.push({ label: 'Trial rank', value: pb.holders ? `#${pb.rank} of ${pb.holders}` : `#${pb.rank}` });
    else if (pb) facts.push({ label: 'Their PB', value: `${formatTime(pb.time)}  ${formatDelta(time - Number(pb.time))}` });

    facts.push({ label: 'Submitted', value: formatDateTime(run.date), mono: false });
    if (run.moderator_username) facts.push({ label: 'Reviewed by', value: run.moderator_username, mono: false });

    const card = renderSubmissionCard({
        eyebrow: 'Trial run',
        meta: formatDate(run.date),
        label: run.trial_name,
        value: formatTime(time),
        state: normalizeState(run.state),
        isWr,
        isPb,
        player: { name: run.player_name || player?.player_name, tier: player ? tierForScore(player.score) : null, avatarDataUri },
        preview: { dataUri: preview, placeholder: VIDEO_PLACEHOLDER[run.video_status] || 'No preview' },
        facts,
        note: run.moderator_note ? { text: run.moderator_note, by: run.moderator_username } : null,
    });

    const ready = !run.video_status || run.video_status === 'ready';
    return {
        card,
        links: [
            { label: 'Open on wasans', url: resolveSubmissionUrl(run.uuid) },
            ready ? { label: 'Play video here', customId: componentId('watch', 'x', `t:${run.uuid}`) } : null,
        ],
    };
}

async function comboCard(run) {
    const [labels, playerPayload, board, preview] = await Promise.all([
        categoryLabels(),
        apiGet(`players/${encodeURIComponent(run.player_uuid)}`, { include: 'combo_pbs' }).catch(() => null),
        apiGet(`leaderboards/combos/${encodeURIComponent(run.category_slug)}`, { limit: 500 }).catch(() => null),
        fetchImageDataUri(youtubeThumbnailUrl(run.youtube_url)),
    ]);

    const player = playerPayload?.data?.player || null;
    const avatarDataUri = await fetchPlayerAvatar(player);
    const label = labels.get(run.category_slug) || run.category_slug;
    const pb = (player?.combo_pbs || []).find((entry) => entry.category_slug === run.category_slug) || null;
    const isPb = Boolean(pb && pb.submission_uuid === run.uuid);
    const ranked = (board?.data?.results || []).filter((row) => row.combo_count !== null && row.combo_count !== undefined);
    const position = ranked.findIndex((row) => row.player_uuid === run.player_uuid);
    const isTop = isPb && position === 0;

    const facts = [{ label: 'Combo', value: formatCount(run.combo_count), strong: true }];
    if (isPb && position >= 0) facts.push({ label: 'Category rank', value: `#${position + 1} of ${ranked.length}`, color: isTop ? theme.gold : undefined });
    else if (pb) facts.push({ label: 'Their best', value: formatCount(pb.combo_count) });
    if (ranked[0] && !isTop) facts.push({ label: 'Top combo', value: formatCount(ranked[0].combo_count) });
    facts.push({ label: 'Submitted', value: formatDateTime(run.date), mono: false });
    if (run.moderator_username) facts.push({ label: 'Reviewed by', value: run.moderator_username, mono: false });

    const card = renderSubmissionCard({
        eyebrow: 'Combo',
        meta: formatDate(run.date),
        label,
        value: formatCount(run.combo_count),
        state: normalizeState(run.state),
        isWr: false,
        isPb,
        player: { name: run.player_name || player?.player_name, tier: player ? tierForScore(player.score) : null, avatarDataUri },
        preview: { dataUri: preview, placeholder: 'No preview' },
        facts,
        note: run.moderator_note ? { text: run.moderator_note, by: run.moderator_username } : null,
    });

    return {
        card,
        links: [
            { label: 'Open on wasans', url: resolveSubmissionUrl(run.uuid) },
            run.youtube_url && /^https?:\/\//.test(run.youtube_url) ? { label: 'Watch on YouTube', url: run.youtube_url } : null,
        ],
    };
}

// Resolves to a message payload, or { error } when the run can't be found.
export async function buildRunMessage(refInput) {
    const ref = typeof refInput === 'string' ? parseRunRef(refInput) : refInput;
    if (!ref) return { error: "That doesn't look like a submission. Pick one from the list, or paste its link." };

    const found = await findRun(ref);
    if (!found) return { error: 'No submission with that id was found. It may have been deleted.' };

    const { card, links } = found.kind === 'trial' ? await trialCard(found.run) : await comboCard(found.run);
    const row = linkRow(links);

    return {
        content: '',
        embeds: [],
        files: [renderAttachment(card.svg, card.width, `run-${found.run.uuid}`)],
        attachments: [],
        components: row ? [row] : [],
    };
}
