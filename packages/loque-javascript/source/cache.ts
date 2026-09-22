import type { DecisionData, MemoryCache } from './types';

/** An in-process decision cache; results are keyed by evaluator, judgment, and input hash. */
export function memoryCache(): MemoryCache {
    const entries = new Map<string, DecisionData>();
    return Object.freeze({
        get: (key: string) => entries.get(key),
        set(key: string, data: DecisionData) { entries.set(key, data); },
        get size() { return entries.size; },
        clear() { entries.clear(); },
    });
}
