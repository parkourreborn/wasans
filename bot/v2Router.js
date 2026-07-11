import { executeDm, executeMemberSync, executeSubmissionDelete, executeSubmissionSync } from './executors.js';
import { ApiError, errorBody } from './errors.js';
import {
    validateBatchBody,
    validateDmBody,
    validateMemberSyncBody,
    validateSubmissionDeleteBody,
    validateSubmissionSyncBody,
} from './validators.js';

const V2_ROUTE_HANDLERS = {
    '/v2/submissions/sync': {
        validate: validateSubmissionSyncBody,
        execute: executeSubmissionSync,
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

export function isV2Path(pathname) {
    return pathname.startsWith('/v2/');
}

export async function handleV2Route(pathname, body) {
    if (pathname === '/v2/batch') {
        return await executeBatch(body);
    }

    const route = V2_ROUTE_HANDLERS[pathname];
    if (!route) {
        throw new ApiError(404, 'not_found', 'Route not found');
    }

    const validBody = route.validate(body);
    return await route.execute(validBody);
}

async function executeBatch(body) {
    const validBody = validateBatchBody(body);
    const continueOnError = validBody.options?.continue_on_error !== false;

    const results = [];
    let failedCount = 0;

    for (const request of validBody.requests) {
        try {
            const resultBody = await executeBatchItem(request.route, request.body);
            results.push({
                id: request.id,
                ok: true,
                status: 200,
                body: resultBody,
            });
        } catch (error) {
            const apiError = normalizeToApiError(error);
            failedCount += 1;

            results.push({
                id: request.id,
                ok: false,
                status: apiError.status,
                body: errorBody(apiError.code, apiError.message),
            });

            if (!continueOnError) {
                break;
            }
        }
    }

    return {
        ok: failedCount === 0,
        results,
        failed_count: failedCount,
    };
}

async function executeBatchItem(routePath, body) {
    const route = V2_ROUTE_HANDLERS[routePath];
    if (!route) {
        throw new ApiError(404, 'not_found', `Unknown batch route: ${routePath}`);
    }

    const validBody = route.validate(body);
    return await route.execute(validBody);
}

export function normalizeToApiError(error) {
    if (error instanceof ApiError) {
        return error;
    }

    return new ApiError(500, 'discord_error', error?.message || 'Unexpected error');
}
