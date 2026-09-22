import { LoqueError, within } from './errors';
import { queryIR, shape } from './ir';
import { copyJson } from './json';
import { mutationIR } from './mutation';
import type { Program, ProgramIR, ProgramOptions } from './types';

const limitKeys = ['maxMatches', 'maxEvaluations', 'maxOperations'] as const;

function invalid(message: string, path: string): never {
    throw new LoqueError('INVALID_PROGRAM', message, path);
}

/** Validate limit fields shared by programs and capabilities. */
export function limit(value: unknown, path: string, code: 'INVALID_PROGRAM' | 'INVALID_CAPABILITY'): void {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new LoqueError(code, 'Expected a non-negative safe integer', path);
    }
}

function programIR(input: unknown): ProgramIR {
    const owned = copyJson(input, 'INVALID_PROGRAM');
    shape(owned, ['version', 'query'], '', 'INVALID_PROGRAM', ['mutation', 'limits']);
    if (owned.version !== 1) invalid('Unsupported program version', '/version');
    within('/query', () => queryIR(owned.query));
    if (Object.hasOwn(owned, 'mutation')) within('/mutation', () => mutationIR(owned.mutation));
    if (Object.hasOwn(owned, 'limits')) {
        const limits = owned.limits;
        shape(limits, [], '/limits', 'INVALID_PROGRAM', limitKeys);
        for (const key of limitKeys) {
            if (Object.hasOwn(limits, key)) limit(limits[key], `/limits/${key}`, 'INVALID_PROGRAM');
        }
    }
    // Nested validators copy their input; the owned tree is already frozen JSON.
    return owned as unknown as ProgramIR;
}

export function programFromIR(input: unknown): Program {
    const ir = programIR(input);
    return Object.freeze({ toIR: () => ir });
}

/** Combine a query (builder or IR), an optional mutation, and limits into a program. */
export function program(options: ProgramOptions): Program {
    if (options === null || typeof options !== 'object') invalid('Expected program options', '');
    const { query, mutation, limits } = options;
    const queryValue = query !== null && typeof query === 'object' && typeof (query as { toIR?: unknown }).toIR === 'function'
        ? (query as { toIR(): unknown }).toIR() : query;
    return programFromIR({
        version: 1,
        query: queryValue,
        ...(mutation === undefined ? {} : { mutation }),
        ...(limits === undefined ? {} : { limits }),
    });
}

/** Revalidate structural implementations when a program is executed or checked. */
export function programOf(input: Program): ProgramIR {
    if (input === null || typeof input !== 'object' || typeof input.toIR !== 'function') {
        invalid('Expected a program; use programFromIR for serialized programs', '');
    }
    return programIR(input.toIR());
}
