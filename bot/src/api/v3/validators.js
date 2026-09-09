import { badRequest } from '../errors.js';
import {
    assertObject,
    assertOptionalNumber,
    assertOptionalString,
    assertPositiveNumber,
    assertString,
} from '../assertions.js';
import {
    validateBatchBody,
    validateDmBody,
    validateMemberSyncBody,
    validateSubmissionDeleteBody,
    validateSubmissionSyncBody as validateSubmissionSyncBodyV2,
} from '../v2/validators.js';

const GIVEAWAY_STATUSES = ['active', 'won', 'closed'];

export function validateGiveawaySyncBody(body) {
    assertObject(body, 'body');
    assertString(body.uuid, 'uuid');
    assertString(body.title, 'title');
    assertOptionalString(body.description, 'description');
    assertPositiveNumber(body.max_winners, 'max_winners');
    assertPositiveNumber(body.ends_at, 'ends_at');
    assertString(body.status, 'status');
    if (!GIVEAWAY_STATUSES.includes(body.status)) {
        throw badRequest(`status must be one of ${GIVEAWAY_STATUSES.join(', ')}`);
    }

    if (typeof body.entry_count !== 'number' || !Number.isFinite(body.entry_count) || body.entry_count < 0) {
        throw badRequest('entry_count must be a non-negative number');
    }

    if (!Array.isArray(body.winners)) {
        throw badRequest('winners must be an array');
    }
    for (const winner of body.winners) {
        assertObject(winner, 'winners[]');
        assertString(winner.player_name, 'winners[].player_name');
        if (typeof winner.claimed !== 'boolean') {
            throw badRequest('winners[].claimed must be a boolean');
        }
    }

    assertOptionalString(body.discord_channel_id, 'discord_channel_id');
    assertOptionalString(body.discord_message_id, 'discord_message_id');

    return body;
}

/**
 * Same as v2, plus an optional `average_score_change` (see README v3 spec).
 * It is only rendered in the thread message when the submission is a world record.
 */
export function validateSubmissionSyncBody(body) {
    const validBody = validateSubmissionSyncBodyV2(body);
    assertOptionalNumber(body.average_score_change, 'average_score_change');
    return validBody;
}

export { validateSubmissionDeleteBody, validateMemberSyncBody, validateDmBody, validateBatchBody };
