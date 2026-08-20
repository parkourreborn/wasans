import { resolveSubmissionUrl } from '../resolvers.js';
import { buildSubmissionModerationComponentsForSubmission } from '../commands/submissionModeration.js';

function formatFixed3(value) {
    return Number.isFinite(value) ? value.toFixed(3) : 'N/A';
}

function formatSignedFixed3(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(3)}`;
}

export function getDiscordDefaultAvatarUrl(discordId, discriminator) {
    const id = String(discordId || '').trim();
    const discriminatorValue = String(discriminator || '').trim();
    if (/^\d+$/.test(discriminatorValue) && Number(discriminatorValue) > 0) {
        const index = Number(discriminatorValue) % 5;
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    }
    if (/^\d+$/.test(id)) {
        const index = Number((BigInt(id) >> BigInt(22)) % BigInt(6));
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    }
    return '';
}

export function resolveDiscordAvatarUrl(discordId, discordAvatar, discriminator) {
    if (discordAvatar && discordId) {
        return `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.png`;
    }
    return getDiscordDefaultAvatarUrl(discordId, discriminator) || undefined;
}

export function buildSubmissionTitle({ trial_name, time_new, player_name }) {
    const base = `${trial_name} ${time_new} | ${player_name}`;
    return base.slice(0, 100);
}

/**
 * @param {object} body submission payload (see route validators)
 * @param {object} [options]
 * @param {boolean} [options.includeAverageScoreChange] v3 only: append the average
 *   score change line for world record submissions when body.average_score_change is set.
 */
export function buildSubmissionMessage(body, options = {}) {
    const { includeAverageScoreChange = false } = options;

    const oldTimeFormatted = formatFixed3(body.time_old);
    const newTimeFormatted = formatFixed3(body.time_new);
    const oldScoreFormatted = formatFixed3(body.score_old);
    const newScoreFormatted = formatFixed3(body.score_new);
    const userMention = body.player_discord_id ? `<@${body.player_discord_id}>` : body.player_name;
    const moderatorNote = body.moderator_note?.trim() || 'N/A';
    const lines = [];

    lines.push(`**${body.trial_name} ${newTimeFormatted} | ${userMention}**`);
    lines.push(`${oldTimeFormatted} -> ${newTimeFormatted}`);

    if (body.state === 'approved') {
        lines.push(`*${oldScoreFormatted}* -> *${newScoreFormatted}*`);
    }

    lines.push(`Moderator note: ${moderatorNote}`);

    if (body.is_wr && body.state === 'approved') {
        if (body.previous_wr?.thread_id) {
            lines.push(`<#${body.previous_wr.thread_id}>`);
        } else if (body.previous_wr?.time !== undefined && body.previous_wr?.player_name) {
            lines.push(`Previous WR: ${body.previous_wr.time.toFixed(3)} by ${body.previous_wr.player_name}`);
        }
    }

    if (includeAverageScoreChange && body.is_wr && Number.isFinite(body.average_score_change)) {
        lines.push(`Average score change: ${formatSignedFixed3(body.average_score_change)}`);
    }

    lines.push(resolveSubmissionUrl(body.submission_id));

    return {
        content: lines.join('\n'),
        components: buildSubmissionModerationComponentsForSubmission(body.submission_id, body.state),
    };
}
