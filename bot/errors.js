export class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

export function badRequest(message) {
    return new ApiError(400, 'bad_request', message);
}

export function unauthorized(message = 'Unauthorized') {
    return new ApiError(401, 'unauthorized', message);
}

export function notFound(message) {
    return new ApiError(404, 'not_found', message);
}

export function discordError(message) {
    return new ApiError(500, 'discord_error', message);
}

export function errorBody(code, message) {
    return {
        ok: false,
        error: {
            code,
            message,
        },
    };
}
