import { executeDm, executeMemberSync, executeSubmissionDelete, executeSubmissionSync } from '../executors.js';
import { createVersionRouter } from '../routerFactory.js';
import {
    validateBatchBody,
    validateDmBody,
    validateMemberSyncBody,
    validateSubmissionDeleteBody,
    validateSubmissionSyncBody,
} from './validators.js';

const routes = {
    '/v2/submissions/sync': {
        validate: validateSubmissionSyncBody,
        execute: (body) => executeSubmissionSync(body),
    },
    '/v2/submissions/delete': {
        validate: validateSubmissionDeleteBody,
        execute: executeSubmissionDelete,
    },
    '/v2/members/sync': {
        validate: validateMemberSyncBody,
        execute: executeMemberSync,
    },
    '/v2/messages/dm': {
        validate: validateDmBody,
        execute: executeDm,
    },
};

const router = createVersionRouter('/v2', routes, validateBatchBody);

export const isV2Path = router.isPath;
export const handleV2Route = router.handleRoute;
