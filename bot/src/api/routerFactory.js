import { ApiError, errorBody, normalizeToApiError } from './errors.js';

/**
 * Builds a versioned route dispatcher. Each version gets its own route table and
 * its own batch validator so v2 and v3 can evolve independently while sharing
 * the same dispatch/batch mechanics.
 *
 * @param {string} prefix e.g. '/v2'
 * @param {Record<string, {validate: Function, execute: Function}>} routes keyed by full pathname
 * @param {Function} validateBatchBody
 */
export function createVersionRouter(prefix, routes, validateBatchBody) {
    const batchPath = `${prefix}/batch`;

    function isPath(pathname) {
        return pathname.startsWith(`${prefix}/`);
    }

    async function executeRoute(routePath, body) {
        const route = routes[routePath];
        if (!route) {
            throw new ApiError(404, 'not_found', `Route not found: ${routePath}`);
        }

        const validBody = route.validate(body);
        return route.execute(validBody);
    }

    async function executeBatch(body) {
        const validBody = validateBatchBody(body);
        const continueOnError = validBody.options?.continue_on_error !== false;

        const results = [];
        let failedCount = 0;

        for (const request of validBody.requests) {
            try {
                const resultBody = await executeRoute(request.route, request.body);
                results.push({ id: request.id, ok: true, status: 200, body: resultBody });
            } catch (error) {
                const apiError = normalizeToApiError(error);
                failedCount += 1;

                results.push({
                    id: request.id,
                    ok: false,
                    status: apiError.status,
                    body: errorBody(apiError.code, apiError.message),
                });

                if (!continueOnError) break;
            }
        }

        return { ok: failedCount === 0, results, failed_count: failedCount };
    }

    async function handleRoute(pathname, body) {
        if (pathname === batchPath) {
            return executeBatch(body);
        }

        return executeRoute(pathname, body);
    }

    return { isPath, handleRoute };
}
