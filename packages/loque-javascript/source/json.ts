import { LoqueError, type LoqueErrorCode } from './errors';
import type { JsonArray, JsonObject, JsonValue, PathSegment } from './types';

export function appendPointer(path: string, key: PathSegment): string {
    return `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/** Only called with pointers produced by appendPointer. */
export function pointerSegments(path: string): string[] {
    return path === '' ? [] : path.slice(1).split('/').map(
        token => token.replaceAll('~1', '/').replaceAll('~0', '~'),
    );
}

export function isArray(value: JsonValue): value is JsonArray {
    return Array.isArray(value);
}

export function isObject(value: JsonValue): value is JsonObject {
    return value !== null && typeof value === 'object' && !isArray(value);
}

/** Define own data properties, including __proto__, without invoking setters. */
export function defineValue(object: object, key: string, value: JsonValue): void {
    Object.defineProperty(object, key, {
        value, enumerable: true, writable: true, configurable: true,
    });
}

/** Validate before reading properties; never invoke accessors or toJSON. */
export function copyJson(input: unknown, code: LoqueErrorCode = 'INVALID_JSON', freeze = true): JsonValue {
    const ancestors = new Set<object>();

    function copy(value: unknown, path: string): JsonValue {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value !== 'object' || value === null) {
            throw new LoqueError(code, 'Expected a JSON value', path);
        }
        if (ancestors.has(value)) throw new LoqueError(code, 'Cyclic data is not JSON', path);

        const array = Array.isArray(value);
        const prototype: unknown = Object.getPrototypeOf(value);
        if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
            throw new LoqueError(code, 'Expected a plain object or array', path);
        }

        ancestors.add(value);
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        const result: JsonValue[] | Record<string, JsonValue> = array ? [] : {};

        if (array && keys.length !== value.length + 1) {
            throw new LoqueError(code, 'Expected a dense array without extra properties', path);
        }
        for (const key of keys) {
            if (array && key === 'length') continue;
            if (typeof key !== 'string') throw new LoqueError(code, 'Symbol keys are not JSON', path);
            const descriptor = descriptors[key];
            const childPath = appendPointer(path, key);
            if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
                throw new LoqueError(code, 'Expected an enumerable data property', childPath);
            }
            if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
                throw new LoqueError(code, 'Unexpected array property', childPath);
            }
            defineValue(result, key, copy(descriptor.value, childPath));
        }
        ancestors.delete(value);
        return freeze ? Object.freeze(result) : result;
    }

    return copy(input, '');
}

/** Freeze an already validated tree after applying generated operations. */
export function freezeJson(value: JsonValue): JsonValue {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeJson(child);
        Object.freeze(value);
    }
    return value;
}

export const MISSING = Symbol('missing');
export type Resolved = JsonValue | typeof MISSING;

/** Query navigation distinguishes an object key "0" from array index 0. */
export function child(value: Resolved, segment: PathSegment): Resolved {
    if (value === MISSING) return MISSING;
    if (typeof segment === 'number') {
        return isArray(value) && segment < value.length ? value[segment] : MISSING;
    }
    return isObject(value) && Object.hasOwn(value, segment) ? value[segment] : MISSING;
}

export function equal(left: JsonValue, right: JsonValue): boolean {
    if (left === right) return true;
    if (isArray(left)) {
        return isArray(right) && left.length === right.length
            && left.every((value, index) => equal(value, right[index]));
    }
    if (isObject(left) && isObject(right)) {
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length
            && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
    }
    return false;
}
