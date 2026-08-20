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
