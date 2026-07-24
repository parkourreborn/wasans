import { EmbedBuilder } from 'discord.js';
import { resolvePlayerUrl, resolveSubmissionUrl } from './resolvers.js';
import { buildSubmissionModerationComponentsForSubmission } from './submissionModeration.js';

function formatValue(value) {
    if (value === null || value === undefined) return 'N/A';
    return Number.isFinite(value) ? String(value) : String(value);
}

function formatScoreValue(score) {
    const value = formatValue(score);
    return value === 'N/A' ? value : `*${value}*`;
}

function formatBeforeAfterValue(time, score, state) {
    const timeValue = formatValue(time);
    if (state !== 'approved') {
        return timeValue;
    }

    const scoreValue = formatScoreValue(score);
    if (scoreValue === 'N/A' || timeValue === 'N/A') {
        return timeValue;
    }

    return `${timeValue}\n${scoreValue}`;
}

function resolveModeratorValue(body) {
    if (typeof body.moderator_name === 'string' && body.moderator_name.trim()) {
        return body.moderator_name.trim();
    }

    if (typeof body.moderator_discord_id === 'string' && body.moderator_discord_id.trim()) {
        return `<@${body.moderator_discord_id.trim()}>`;
    }

    return 'N/A';
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

function resolveDiscordAvatarUrl(discordId, discordAvatar, discriminator) {
    if (discordAvatar && discordId) {
        return `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.png`;
    }
    return getDiscordDefaultAvatarUrl(discordId, discriminator) || undefined;
}

export function buildSubmissionTitle({ trial_name, time_new, player_name }) {
    const base = `${trial_name} ${time_new} | ${player_name}`;
    return base.slice(0, 100);
}

export function buildSubmissionMessage(body) {
    const submissionUrl = resolveSubmissionUrl(body.submission_id);
    const playerId = body.player_id || body.player_uuid;
    const authorName = `${body.player_name} (${formatValue(body.score_new)})`;
    const embedTitle = `${body.trial_name} ${body.time_new}`.slice(0, 256);
    const avatarUrl = resolveDiscordAvatarUrl(
        body.player_discord_id,
        body.discord_avatar,
        body.discord_avatar_discriminator,
    );
    const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setURL(submissionUrl)
        .setAuthor({
            name: authorName,
            ...(playerId ? { url: resolvePlayerUrl(playerId) } : {}),
            ...(avatarUrl ? { iconURL: avatarUrl } : {}),
        })
        .addFields(
            {
                name: 'Score',
                value: formatScoreValue(body.score_new),
                inline: true,
            },
            {
                name: 'Before',
                value: formatBeforeAfterValue(body.time_old, body.score_old, body.state),
                inline: true,
            },
            {
                name: 'After',
                value: formatBeforeAfterValue(body.time_new, body.score_new, body.state),
                inline: true,
            },
            {
                name: 'Moderator',
                value: resolveModeratorValue(body),
                inline: true,
            },
            {
                name: 'Moderator Note',
                value: body.moderator_note?.trim() || 'N/A',
                inline: false,
            },
        );
    embed.data.description = '';

    const assetUrl = `https://assets.wasans.tully.sh/scores/${encodeURIComponent(body.submission_id)}.mp4`;

    return {
        content: `${assetUrl}\n`,
        embeds: [embed],
        components: buildSubmissionModerationComponentsForSubmission(body.submission_id, body.state),
    };
}
