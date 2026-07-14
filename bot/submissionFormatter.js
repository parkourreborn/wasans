import { resolveSubmissionUrl } from './resolvers.js';

function formatValue(value) {
    if (value === null || value === undefined) return null;
    return Number.isFinite(value) ? String(value) : String(value);
}

export function buildSubmissionTitle({ trial_name, time_new, player_name }) {
    const base = `${trial_name} ${time_new} | ${player_name}`;
    return base.slice(0, 100);
}

export function buildSubmissionContent(body) {
    const mention = body.player_discord_id ? `<@${body.player_discord_id}>` : body.player_name;
    const lines = [];

    lines.push(`**${body.trial_name} ${body.time_new} | ${mention}**`);

    if (body.time_old !== undefined && body.time_old !== null) {
        lines.push(`${body.time_old} -> ${body.time_new}`);
    } else {
        lines.push(`N/A -> ${body.time_new}`);
    }

    if (
        body.score_old !== undefined &&
        body.score_old !== null &&
        body.score_new !== undefined &&
        body.score_new !== null &&
        body.state === 'approved'
    ) {
        lines.push(`*${body.score_old}* -> *${body.score_new}*`);
    }

    if (body.is_wr && body.previous_wr && (body.previous_wr.player_name || body.previous_wr.time)) {
        const prevName = body.previous_wr.player_name || 'Unknown';
        const prevTime = formatValue(body.previous_wr.time) || 'Unknown';
        if (body.previous_wr.thread_id) {
            lines.push(`Previous WR: <#${body.previous_wr.thread_id}>`);
        } else {
            lines.push(`Previous WR: ${prevTime} by ${prevName}`)
        }
    }

    if (body.moderator_note && body.moderator_note.trim()) {
        lines.push(`Moderator note: ${body.moderator_note.trim()}`);
    }

    lines.push(`${resolveSubmissionUrl(body.submission_id)}`);

    return lines.join('\n');
}
