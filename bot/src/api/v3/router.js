import {
    executeDm,
    executeMemberSync,
    executeSubmissionDelete,
    executeSubmissionSync,
    prepareMemberSyncBatch,
    summarizeMemberSyncBatch,
} from '../executors.js';
import { createVersionRouter } from '../routerFactory.js';
import { executeGiveawaySync } from '../../giveaways/sync.js';
import {
    validateBatchBody,
    validateDmBody,
    validateGiveawaySyncBody,
    validateMemberSyncBody,
    validateSubmissionDeleteBody,
    validateSubmissionSyncBody,
} from './validators.js';

const routes = {
    '/v3/submissions/sync': {
        validate: validateSubmissionSyncBody,
        execute: (body) => executeSubmissionSync(body, { includeAverageScoreChange: true }),
    },
    '/v3/submissions/delete': {
        validate: validateSubmissionDeleteBody,
        execute: executeSubmissionDelete,
    },
    '/v3/members/sync': {
        validate: validateMemberSyncBody,
        execute: executeMemberSync,
        batch: { prepare: prepareMemberSyncBatch, summarize: summarizeMemberSyncBatch },
    },
    '/v3/messages/dm': {
        validate: validateDmBody,
        execute: executeDm,
    },
    '/v3/giveaways/sync': {
        validate: validateGiveawaySyncBody,
        execute: executeGiveawaySync,
    },
};

const router = createVersionRouter('/v3', routes, validateBatchBody);

export const isV3Path = router.isPath;
export const handleV3Route = router.handleRoute;
