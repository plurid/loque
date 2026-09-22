import { LoqueError, type LoqueErrorCode } from './errors';
import { appendPointer, copyJson, isArray, isObject } from './json';
import type { ExpressionIR, JsonObject, JsonValue, PredicateIR, QueryIR } from './types';

export function shape(
    value: JsonValue, keys: readonly string[], path: string, code: LoqueErrorCode = 'INVALID_QUERY',
): asserts value is JsonObject {
    if (!isObject(value)) throw new LoqueError(code, 'Expected an object', path);
    for (const key of keys) {
        if (!Object.hasOwn(value, key)) throw new LoqueError(code, `Missing ${key}`, appendPointer(path, key));
    }
    for (const key of Object.keys(value)) {
        if (!keys.includes(key)) throw new LoqueError(code, `Unsupported field ${key}`, appendPointer(path, key));
    }
}

function invalid(message: string, path: string): never {
    throw new LoqueError('INVALID_QUERY', message, path);
}

function index(value: JsonValue, path: string): void {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        invalid('Expected a non-negative safe integer index', path);
    }
}

function expression(value: JsonValue, path: string): asserts value is ExpressionIR {
    if (!isObject(value)) invalid('Expected an expression', path);
    switch (value.op) {
        case 'current':
            shape(value, ['op'], path);
            return;
        case 'literal':
            shape(value, ['op', 'value'], path);
            return;
        case 'field':
            shape(value, ['op', 'path'], path);
            if (!isArray(value.path) || value.path.length === 0) invalid('Expected a nonempty field path', `${path}/path`);
            value.path.forEach((segment, position) => {
                if (typeof segment !== 'string') index(segment, `${path}/path/${position}`);
            });
            return;
        default:
            invalid('Unknown expression operator', `${path}/op`);
    }
}

function predicate(value: JsonValue, path: string): asserts value is PredicateIR {
    if (!isObject(value)) invalid('Expected a predicate', path);
    switch (value.op) {
        case 'eq': case 'ne': case 'lt': case 'lte': case 'gt': case 'gte':
            shape(value, ['op', 'left', 'right'], path);
            expression(value.left, `${path}/left`);
            expression(value.right, `${path}/right`);
            return;
        case 'in':
            shape(value, ['op', 'value', 'values'], path);
            expression(value.value, `${path}/value`);
            if (!isArray(value.values)) invalid('Expected an array of membership values', `${path}/values`);
            return;
        case 'exists':
            shape(value, ['op', 'value'], path);
            expression(value.value, `${path}/value`);
            return;
        case 'and': case 'or':
            shape(value, ['op', 'predicates'], path);
            if (!isArray(value.predicates)) invalid('Expected an array of predicates', `${path}/predicates`);
            value.predicates.forEach((item, position) => predicate(item, `${path}/predicates/${position}`));
            return;
        case 'not':
            shape(value, ['op', 'predicate'], path);
            predicate(value.predicate, `${path}/predicate`);
            return;
        default:
            invalid('Unknown predicate operator', `${path}/op`);
    }
}

export function expressionIR(input: unknown): ExpressionIR {
    const owned = copyJson(input, 'INVALID_QUERY');
    expression(owned, '');
    return owned;
}

export function predicateIR(input: unknown): PredicateIR {
    const owned = copyJson(input, 'INVALID_QUERY');
    predicate(owned, '');
    return owned;
}

export function queryIR(input: unknown): QueryIR {
    const owned = copyJson(input, 'INVALID_QUERY');
    shape(owned, ['version', 'steps'], '');
    if (owned.version !== 1) invalid('Unsupported IR version', '/version');
    if (!isArray(owned.steps)) invalid('Expected an array of steps', '/steps');
    owned.steps.forEach((step, position) => {
        const path = `/steps/${position}`;
        if (!isObject(step)) invalid('Expected a query step', path);
        switch (step.op) {
            case 'field':
                shape(step, ['op', 'key'], path);
                if (typeof step.key !== 'string') invalid('Expected a string key', `${path}/key`);
                return;
            case 'index':
                shape(step, ['op', 'index'], path);
                index(step.index, `${path}/index`);
                return;
            case 'each':
                shape(step, ['op'], path);
                return;
            case 'where':
                shape(step, ['op', 'predicate'], path);
                predicate(step.predicate, `${path}/predicate`);
                return;
            default:
                invalid('Unknown query step', `${path}/op`);
        }
    });
    // Every discriminant, required field, and nested node has been validated.
    return owned as QueryIR;
}
