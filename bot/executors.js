import { botConfig } from './botConfig.js';
import {
    addRoles,
    archiveThread,
    createSubmissionThread,
    deleteThread,
    fetchGuild,
    fetchGuildMember,
    fetchThreadById,
    removeRoles,
    sendDirectMessage,
    sendMessageToThread,
    setThreadTags,
    updateNickname,
    updateThreadName,
    updateThreadStarterMessage,
} from './discordApi.js';
import { badRequest, discordError, notFound } from './errors.js';
import { logger } from './logging.js';
import { resolveRoleScope, resolveRolesForRankingScore, resolveStateTags } from './resolvers.js';
import { buildSubmissionContent, buildSubmissionTitle } from './submissionFormatter.js';
import { deleteSubmissionThread, getThreadIdBySubmissionId, setSubmissionThread } from './submissionStore.js';

function asSet(values) {
    return new Set(values || []);
}

export async function executeSubmissionSync(body) {
    const options = body.options || {};
    const createIfMissing = options.create_if_missing === true;
    const sendWrPing = options.send_wr_ping === true;

    await logger.log('Submission sync started', `Submission ${body.submission_id}`);

    const title = buildSubmissionTitle(body);
    const content = buildSubmissionContent(body);
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
        await sendMessageToThread(thread, `<@&${botConfig.wr_ping_role_id}> New WR approved`);
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
    const member = await fetchGuildMember(guild, body.discord_user_id);
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

    const toAdd = [...desiredSet].filter((id) => !currentInScopeSet.has(id));
    const removeUnlisted = body.options?.remove_unlisted_in_scope !== false;
    const toRemove = removeUnlisted
        ? [...currentInScopeSet].filter((id) => !desiredSet.has(id))
        : [];

    await addRoles(member, toAdd);
    await removeRoles(member, toRemove);

    let nicknameUpdated = false;
    if (body.options?.update_nickname === true && typeof body.nickname === 'string' && body.nickname.trim()) {
        await updateNickname(member, body.nickname.trim());
        nicknameUpdated = true;
    }

    const unchanged = [...desiredSet].filter((id) => currentInScopeSet.has(id));
    const outOfScopeRolesPreservedCount = currentRoles.filter((id) => !scopeSet.has(id)).length;

    await logger.log('Member sync completed', `Member ${body.discord_user_id}`);

    return {
        ok: true,
        member_found: true,
        roles_added: toAdd,
        roles_removed: toRemove,
        roles_unchanged_in_scope: unchanged,
        out_of_scope_roles_preserved_count: outOfScopeRolesPreservedCount,
        nickname_updated: nicknameUpdated,
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
