import { botConfig } from '../config.js';
import {
    addRoles,
    archiveThread,
    createSubmissionThread,
    deleteThread,
    fetchGuild,
    fetchThreadById,
    removeRoles,
    sendDirectMessage,
    sendMessageToChannel,
    sendMessageToThread,
    setThreadTags,
    updateNickname,
    updateThreadName,
    updateThreadStarterMessage,
} from '../discord/api.js';
import { badRequest, discordError, notFound } from './errors.js';
import { logger } from '../logger.js';
import { resolveRoleScope, resolveRolesForRankingScore, resolveStateTags } from '../resolvers.js';
import { buildSubmissionMessage, buildSubmissionTitle } from '../submissions/formatter.js';
import { deleteSubmissionThread, getThreadIdBySubmissionId, setSubmissionThread } from '../submissions/store.js';

function asSet(values) {
    return new Set(values || []);
}

function getCurrentRankingRoleId(roleIds) {
    for (const roleId of roleIds) {
        if (botConfig.role_names[roleId]) {
            return roleId;
        }
    }
    return null;
}

function getRankRoleScore(roleId) {
    if (!roleId) return null;

    for (const [score, configuredRoleId] of Object.entries(botConfig.role_ranks)) {
        if (configuredRoleId === roleId) {
            return Number(score);
        }
    }

    return null;
}

/**
 * @param {object} body validated submissions/sync request body
 * @param {object} [options]
 * @param {boolean} [options.includeAverageScoreChange] v3 only — see formatter.buildSubmissionMessage
 */
export async function executeSubmissionSync(body, options = {}) {
    const { includeAverageScoreChange = false } = options;
    const syncOptions = body.options || {};
    const createIfMissing = syncOptions.create_if_missing === true;
    const sendWrPing = syncOptions.send_wr_ping === true;

    await logger.log('Submission sync started', `Submission ${body.submission_id}`);

    const title = buildSubmissionTitle(body);
    const content = buildSubmissionMessage(body, { includeAverageScoreChange });
    const tags = resolveStateTags(body.state, body.is_wr);

    let threadId = body.thread_id || getThreadIdBySubmissionId(body.submission_id);
    let thread;
    let created = false;

    if (!threadId) {
        if (!createIfMissing) {
            throw notFound('Thread not found and create_if_missing is false');
        }

        thread = await createSubmissionThread({
            title,
            content,
            forumChannelId: botConfig.submissions_forum_channel_id,
        });
        threadId = thread.id;
        created = true;
    } else {
        thread = await fetchThreadById(threadId);
    }

    await updateThreadName(thread, title);

    let updated = false;
    if (!created) {
        await updateThreadStarterMessage(thread, content);
        updated = true;
    }

    await setThreadTags(thread, tags);

    let wrPingSent = false;
    if (sendWrPing && body.is_wr && body.state === 'approved' && botConfig.wr_ping_role_id) {
        await sendMessageToThread(thread, `<@&${botConfig.wr_ping_role_id}>`);
        wrPingSent = true;
    }

    setSubmissionThread(body.submission_id, threadId);

    await logger.log('Submission sync completed', `Submission ${body.submission_id}`);

    return {
        ok: true,
        submission_id: body.submission_id,
        thread: {
            id: threadId,
            created,
            updated,
            tags_applied: tags,
        },
        wr_ping_sent: wrPingSent,
    };
}

export async function executeSubmissionDelete(body) {
    await logger.log('Submission delete started', `Submission ${body.submission_id}`);

    if (!body.thread_id || !String(body.thread_id).trim()) {
        await logger.log('Submission delete completed', 'Skipped because no thread id was provided');
        return {
            ok: true,
            submission_id: body.submission_id,
            thread_deleted: false,
            thread_archived: false,
            skipped: true,
        };
    }

    const thread = await fetchThreadById(body.thread_id);
    let threadDeleted = false;
    let threadArchived = false;

    if (body.mode === 'delete') {
        await deleteThread(thread);
        threadDeleted = true;
    } else if (body.mode === 'archive') {
        await archiveThread(thread);
        threadArchived = true;
    } else {
        throw badRequest('mode must be delete or archive');
    }

    deleteSubmissionThread(body.submission_id);

    await logger.log('Submission delete completed', `Submission ${body.submission_id}`);

    return {
        ok: true,
        submission_id: body.submission_id,
        thread_deleted: threadDeleted,
        thread_archived: threadArchived,
        skipped: false,
    };
}

export async function executeMemberSync(body) {
    await logger.log('Member sync started', `Member ${body.discord_user_id}`);

    const guild = await fetchGuild();
    const member = await guild.members.fetch(body.discord_user_id).catch(() => null);
    if (!member) {
        await logger.warn('Member sync completed', 'Member not found');
        return {
            ok: true,
            member_found: false,
            roles_added: [],
            roles_removed: [],
            roles_unchanged_in_scope: [],
            out_of_scope_roles_preserved_count: 0,
            nickname_updated: false,
        };
    }

    const scopeRoles = resolveRoleScope(body.scope);
    const scopeSet = asSet(scopeRoles);

    let desiredRolesInScope = body.desired_role_ids_in_scope || [];
    if (body.scope === 'ranking' && body.score !== undefined && body.score !== null) {
        desiredRolesInScope = resolveRolesForRankingScore(body.score);
        await logger.log('Member sync note', `Resolved ranking roles from score ${body.score}`);
    }

    if (!Array.isArray(desiredRolesInScope) || desiredRolesInScope.length === 0) {
        throw badRequest('No desired roles resolved for this member sync request');
    }

    for (const roleId of desiredRolesInScope) {
        if (!scopeSet.has(roleId)) {
            throw badRequest(`Role ${roleId} is not allowed in scope ${body.scope}`);
        }
    }

    const currentRoles = member.roles.cache.map((role) => role.id);
    const currentInScope = currentRoles.filter((id) => scopeSet.has(id));
    const desiredSet = asSet(desiredRolesInScope);
    const currentInScopeSet = asSet(currentInScope);

    const previousRankingRoleId = body.scope === 'ranking' ? getCurrentRankingRoleId(currentInScope) : null;
    const nextRankingRoleId = body.scope === 'ranking' ? getCurrentRankingRoleId(desiredRolesInScope) : null;

    const toAdd = [...desiredSet].filter((id) => !currentInScopeSet.has(id));
    const removeUnlisted = body.options?.remove_unlisted_in_scope !== false;
    const toRemove = removeUnlisted ? [...currentInScopeSet].filter((id) => !desiredSet.has(id)) : [];

    await addRoles(member, toAdd);
    await removeRoles(member, toRemove);

    let nicknameUpdated = false;
    if (body.options?.update_nickname === true && typeof body.nickname === 'string' && body.nickname.trim()) {
        await updateNickname(member, body.nickname.trim());
        nicknameUpdated = true;
    }

    const unchanged = [...desiredSet].filter((id) => currentInScopeSet.has(id));
    const outOfScopeRolesPreservedCount = currentRoles.filter((id) => !scopeSet.has(id)).length;

    let rank_milestone_message_sent = false;
    if (body.scope === 'ranking' && body.score !== undefined && body.score !== null) {
        const previousScore = getRankRoleScore(previousRankingRoleId);
        const nextScore = getRankRoleScore(nextRankingRoleId);
        const previousRankName = previousRankingRoleId ? botConfig.role_names[previousRankingRoleId] : null;
        const nextRankName = nextRankingRoleId ? botConfig.role_names[nextRankingRoleId] : null;

        if (
            previousRankingRoleId &&
            nextRankingRoleId &&
            previousRankingRoleId !== nextRankingRoleId &&
            Number.isFinite(previousScore) &&
            Number.isFinite(nextScore) &&
            previousRankName &&
            nextRankName
        ) {
            const isPromotion = nextScore > previousScore;
            const emoji = isPromotion ? ':tada:' : ':sob:';
            const direction = isPromotion ? 'promoted' : 'demoted';
            const announcement = `${emoji} <@${body.discord_user_id}> has been ${direction} from ${previousRankName} to ${nextRankName}!`;

            if (botConfig.rank_milestones_channel_id) {
                try {
                    await sendMessageToChannel(botConfig.rank_milestones_channel_id, announcement);
                    rank_milestone_message_sent = true;
                } catch (error) {
                    await logger.warn('Member sync note', `Failed to send rank milestone message: ${error.message}`);
                }
            }
        }
    }

    await logger.log('Member sync completed', `Member ${body.discord_user_id}`);

    return {
        ok: true,
        member_found: true,
        roles_added: toAdd,
        roles_removed: toRemove,
        roles_unchanged_in_scope: unchanged,
        out_of_scope_roles_preserved_count: outOfScopeRolesPreservedCount,
        nickname_updated: nicknameUpdated,
        rank_milestone_message_sent,
    };
}

export async function executeDm(body) {
    await logger.log('DM started', `User ${body.discord_user_id}`);

    const failIfCannotDm = body.options?.fail_if_cannot_dm !== false;
    const result = await sendDirectMessage(body.discord_user_id, body.content, {
        suppress_embeds: body.options?.suppress_embeds === true,
    });

    if (!result.delivered) {
        const message = result.error?.message || 'Cannot send DM to this user';
        if (failIfCannotDm) {
            throw discordError(message);
        }

        await logger.warn('DM completed', 'Message was not delivered');
        return {
            ok: true,
            delivered: false,
            message_id: null,
        };
    }

    await logger.log('DM completed', `Message sent to ${body.discord_user_id}`);

    return {
        ok: true,
        delivered: true,
        message_id: result.message_id,
    };
}
