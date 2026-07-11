import { resolveSubmissionUrl } from './resolvers.js';

function formatValue(value) {
    if (value === null || value === undefined) return null;
    return Number.isFinite(value) ? String(value) : String(value);
}

export function buildSubmissionTitle({ trial_name, time_new, player_name }) {
    const base = `${trial_name} | ${time_new} | ${player_name}`;
    return base.slice(0, 100);
}

export function buildSubmissionContent(body) {
    const mention = body.player_discord_id ? `<@${body.player_discord_id}>` : body.player_name;
    const lines = [];

    lines.push(`**${body.trial_name}** - ${body.time_new} by ${mention}`);

    if (body.time_old !== undefined && body.time_old !== null) {
        lines.push(`Time: ${body.time_old} -> ${body.time_new}`);
    }

    if (body.score_new !== undefined && body.score_new !== null && body.score_old !== undefined && body.score_old !== null) {
        lines.push(`Score: ${body.score_old} -> ${body.score_new}`);
    } else if (body.score_new !== undefined && body.score_new !== null) {
        lines.push(`Score: ${body.score_new}`);
    }

    if (body.is_wr && body.previous_wr && (body.previous_wr.player_name || body.previous_wr.time)) {
        const prevName = body.previous_wr.player_name || 'Unknown player';
        const prevTime = formatValue(body.previous_wr.time) || 'Unknown time';
        let previousLine = `Previous WR: ${prevName} (${prevTime})`;
        if (body.previous_wr.thread_id) {
            previousLine += ` in <#${body.previous_wr.thread_id}>`;
        }
        lines.push(previousLine);
    }

    if (body.moderator_note && body.moderator_note.trim()) {
        lines.push(`Moderator note: ${body.moderator_note.trim()}`);
    }

    lines.push(`Submission: ${resolveSubmissionUrl(body.submission_id)}`);

    return lines.join('\n');
}
