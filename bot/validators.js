import { badRequest } from './errors.js';

export function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function assertObject(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest(`${name} must be an object`);
    }
}

export function assertString(value, name) {
    if (!isNonEmptyString(value)) {
        throw badRequest(`${name} must be a non-empty string`);
    }
}

export function assertOptionalString(value, name) {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string') {
        throw badRequest(`${name} must be a string`);
    }
}

export function assertBoolean(value, name) {
    if (typeof value !== 'boolean') {
        throw badRequest(`${name} must be a boolean`);
    }
}

export function assertOptionalBoolean(value, name) {
    if (value === undefined || value === null) return;
    assertBoolean(value, name);
}

export function assertPositiveNumber(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw badRequest(`${name} must be a positive number`);
    }
}

export function assertOptionalNumber(value, name) {
    if (value === undefined || value === null) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw badRequest(`${name} must be a number`);
    }
}

export function assertArrayOfStrings(value, name) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw badRequest(`${name} must be an array of strings`);
    }
}

export function parseRequestOptions(input) {
    if (!input) return {};
    assertObject(input, 'options');
    return input;
}

export function validateSubmissionSyncBody(body) {
    assertObject(body, 'body');
    assertString(body.submission_id, 'submission_id');
    assertString(body.state, 'state');
    if (!['pending', 'approved', 'denied'].includes(body.state)) {
        throw badRequest('state must be pending, approved, or denied');
    }

    assertString(body.trial_name, 'trial_name');
    assertString(body.player_name, 'player_name');
    assertOptionalString(body.player_discord_id, 'player_discord_id');
    assertOptionalString(body.discord_avatar, 'discord_avatar');
    assertOptionalString(body.discord_avatar_discriminator, 'discord_avatar_discriminator');
    assertPositiveNumber(body.time_new, 'time_new');
    assertOptionalNumber(body.time_old, 'time_old');
    assertOptionalNumber(body.score_new, 'score_new');
    assertOptionalNumber(body.score_old, 'score_old');
    assertBoolean(body.is_wr, 'is_wr');
    assertOptionalString(body.moderator_note, 'moderator_note');
    assertOptionalString(body.thread_id, 'thread_id');

    if (body.previous_wr !== undefined && body.previous_wr !== null) {
        assertObject(body.previous_wr, 'previous_wr');
        assertOptionalString(body.previous_wr.player_name, 'previous_wr.player_name');
        assertOptionalNumber(body.previous_wr.time, 'previous_wr.time');
        assertOptionalString(body.previous_wr.thread_id, 'previous_wr.thread_id');
    }

    const options = parseRequestOptions(body.options);
    assertOptionalBoolean(options.send_wr_ping, 'options.send_wr_ping');
    assertOptionalBoolean(options.create_if_missing, 'options.create_if_missing');

    return body;
}

export function validateSubmissionDeleteBody(body) {
    assertObject(body, 'body');
    assertString(body.submission_id, 'submission_id');
    assertOptionalString(body.thread_id, 'thread_id');
    assertString(body.mode, 'mode');
    if (!['delete', 'archive'].includes(body.mode)) {
        throw badRequest('mode must be delete or archive');
    }
    return body;
}

export function validateMemberSyncBody(body) {
    assertObject(body, 'body');
    assertString(body.discord_user_id, 'discord_user_id');
    assertString(body.scope, 'scope');

    const hasDesiredRoles = body.desired_role_ids_in_scope !== undefined;
    const hasScore = body.score !== undefined && body.score !== null;

    if (!hasDesiredRoles && !hasScore) {
        throw badRequest('Provide desired_role_ids_in_scope or score');
    }

    if (hasDesiredRoles) {
        assertArrayOfStrings(body.desired_role_ids_in_scope, 'desired_role_ids_in_scope');
    }
    if (hasScore) {
        assertOptionalNumber(body.score, 'score');
    }

    const options = parseRequestOptions(body.options);
    assertOptionalBoolean(options.update_nickname, 'options.update_nickname');
    assertOptionalBoolean(options.remove_unlisted_in_scope, 'options.remove_unlisted_in_scope');
    assertOptionalString(body.nickname, 'nickname');
    return body;
}

export function validateDmBody(body) {
    assertObject(body, 'body');
    assertString(body.discord_user_id, 'discord_user_id');
    assertString(body.content, 'content');
    if (body.content.length > 2000) {
        throw badRequest('content must be 2000 characters or less');
    }

    const options = parseRequestOptions(body.options);
    assertOptionalBoolean(options.suppress_embeds, 'options.suppress_embeds');
    assertOptionalBoolean(options.fail_if_cannot_dm, 'options.fail_if_cannot_dm');

    return body;
}

export function validateBatchBody(body) {
    assertObject(body, 'body');
    if (!Array.isArray(body.requests) || body.requests.length === 0) {
        throw badRequest('requests must be a non-empty array');
    }

    const options = parseRequestOptions(body.options);
    assertOptionalBoolean(options.continue_on_error, 'options.continue_on_error');

    for (const item of body.requests) {
        assertObject(item, 'request item');
        assertString(item.id, 'request.id');
        assertString(item.route, 'request.route');
        if (item.body === undefined || item.body === null || typeof item.body !== 'object' || Array.isArray(item.body)) {
            throw badRequest('request.body must be an object');
        }
    }

    return body;
}
