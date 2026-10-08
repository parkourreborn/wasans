import { ApiError, errorBody, normalizeToApiError } from './errors.js';

/**
 * Builds a versioned route dispatcher. Each version gets its own route table and
 * its own batch validator so v2 and v3 can evolve independently while sharing
 * the same dispatch/batch mechanics.
 *
 * A route can also opt into batch-level handling with `batch: { prepare, summarize }`:
 * `prepare(validBodies)` runs once before a batch with every valid body for that
 * route and returns a context that is passed to `execute(body, context)` for each
 * of them; `summarize(context, outcomes)` runs once after the batch. Member sync
 * uses this to log one summary per batch instead of several embeds per member.
 *
 * @param {string} prefix e.g. '/v2'
 * @param {Record<string, {validate: Function, execute: Function, batch?: {prepare: Function, summarize: Function}}>} routes keyed by full pathname
 * @param {Function} validateBatchBody
 */
export function createVersionRouter(prefix, routes, validateBatchBody) {
    const batchPath = `${prefix}/batch`;

    function isPath(pathname) {
        return pathname.startsWith(`${prefix}/`);
    }

    async function executeRoute(routePath, body, batchContext) {
        const route = routes[routePath];
        if (!route) {
            throw new ApiError(404, 'not_found', `Route not found: ${routePath}`);
        }

        const validBody = route.validate(body);
        return batchContext === undefined ? route.execute(validBody) : route.execute(validBody, batchContext);
    }

    // Builds one context per batch-aware route present in the batch. Invalid
    // bodies are left out here; they still fail normally in the main loop.
    async function prepareBatchContexts(requests) {
        const bodiesByRoute = new Map();
        for (const request of requests) {
            const route = routes[request.route];
            if (!route?.batch) continue;

            try {
                const validBody = route.validate(request.body);
                if (!bodiesByRoute.has(request.route)) bodiesByRoute.set(request.route, []);
                bodiesByRoute.get(request.route).push(validBody);
            } catch {
                // reported by the main loop
            }
        }

        const contexts = new Map();
        for (const [routePath, bodies] of bodiesByRoute) {
            try {
                contexts.set(routePath, await routes[routePath].batch.prepare(bodies));
            } catch (error) {
                console.error(`Batch prepare failed for ${routePath}:`, error);
            }
        }
        return contexts;
    }

    async function executeBatch(body) {
        const validBody = validateBatchBody(body);
        const continueOnError = validBody.options?.continue_on_error !== false;

        const results = [];
        let failedCount = 0;
        const batchContexts = await prepareBatchContexts(validBody.requests);
        const outcomesByRoute = new Map([...batchContexts.keys()].map((routePath) => [routePath, []]));

        for (const request of validBody.requests) {
            const outcomes = outcomesByRoute.get(request.route);
            try {
                const resultBody = await executeRoute(request.route, request.body, batchContexts.get(request.route));
                results.push({ id: request.id, ok: true, status: 200, body: resultBody });
                outcomes?.push({ body: request.body, ok: true, result: resultBody });
            } catch (error) {
                const apiError = normalizeToApiError(error);
                failedCount += 1;
                outcomes?.push({ body: request.body, ok: false, error: apiError });

                results.push({
                    id: request.id,
                    ok: false,
                    status: apiError.status,
                    body: errorBody(apiError.code, apiError.message),
                });

                if (!continueOnError) break;
            }
        }

        for (const [routePath, context] of batchContexts) {
            try {
                await routes[routePath].batch.summarize(context, outcomesByRoute.get(routePath));
            } catch (error) {
                console.error(`Batch summary failed for ${routePath}:`, error);
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
