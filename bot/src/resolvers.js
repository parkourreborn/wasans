import { botConfig, sortedRankRoles } from './config.js';
import { badRequest } from './api/errors.js';

export function resolveStateTags(state, isWr) {
    const tags = [];
    const stateTag = botConfig.state_tags[state];
    if (stateTag) tags.push(stateTag);

    // WR tag remains on pending and approved WR submissions, and is removed once denied.
    if (isWr && state !== 'denied' && botConfig.state_tags.wr_tag) {
        tags.push(botConfig.state_tags.wr_tag);
    }

    return tags;
}

export function resolveRoleScope(scope) {
    const scopeRoles = botConfig.managed_role_scopes[scope];
    if (!scopeRoles) {
        throw badRequest(`Unknown scope: ${scope}`);
    }
    return scopeRoles;
}

export function resolveSubmissionUrl(submissionId) {
    return `${botConfig.submission_base_url}${encodeURIComponent(submissionId)}`;
}

export function resolveSubmissionAssetUrl(submissionId) {
    return `${botConfig.submission_assets_base_url}${encodeURIComponent(submissionId)}.mp4`;
}

export function resolvePlayerUrl(playerId) {
    return `${botConfig.player_base_url}${encodeURIComponent(playerId)}`;
}

export function resolveRolesForRankingScore(score) {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
        throw badRequest('score must be a number');
    }

    let matchedRoleId = sortedRankRoles[0]?.roleId;
    for (const item of sortedRankRoles) {
        if (score >= item.score) {
            matchedRoleId = item.roleId;
        }
    }

    const roles = [];
    if (matchedRoleId) {
        roles.push(matchedRoleId);
    }

    if (score >= 0.3 && botConfig.wasans_member_role_id) {
        roles.push(botConfig.wasans_member_role_id);
    }

    return roles;
}
