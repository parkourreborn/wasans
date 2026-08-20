import { assertOptionalNumber } from '../assertions.js';
import {
    validateBatchBody,
    validateDmBody,
    validateMemberSyncBody,
    validateSubmissionDeleteBody,
    validateSubmissionSyncBody as validateSubmissionSyncBodyV2,
} from '../v2/validators.js';

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
