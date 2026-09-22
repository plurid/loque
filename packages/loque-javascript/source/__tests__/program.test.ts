import { describe, expect, it } from 'vitest';
import { eq, field, literal, program, programFromIR, query, type Program } from '../index';
import { expectError, expectFrozen } from './helpers';

const pending = query().field('orders').each().where(eq(field('status'), literal('pending')));

describe('programs', () => {
    it('combines a query builder or IR, a mutation, and limits into portable JSON', () => {
        const built = program({
            query: pending, mutation: { op: 'merge', value: { review: true } }, limits: { maxMatches: 10 },
        });
        expect(built.toIR()).toEqual({
            version: 1, query: pending.toIR(), mutation: { op: 'merge', value: { review: true } }, limits: { maxMatches: 10 },
        });
        expect(programFromIR(JSON.parse(JSON.stringify(built.toIR()))).toIR()).toEqual(built.toIR());
        expect(program({ query: pending.toIR() }).toIR()).toEqual({ version: 1, query: pending.toIR() });
        expectFrozen(built.toIR());
    });

    it('owns its input', () => {
        const value = { review: true };
        const built = program({ query: pending, mutation: { op: 'merge', value } });
        value.review = false;
        expect(built.toIR().mutation).toEqual({ op: 'merge', value: { review: true } });
    });

    it.each([
        [null, 'INVALID_PROGRAM', ''],
        [{ query: { version: 1, steps: [] } }, 'INVALID_PROGRAM', '/version'],
        [{ version: 2, query: { version: 1, steps: [] } }, 'INVALID_PROGRAM', '/version'],
        [{ version: 1 }, 'INVALID_PROGRAM', '/query'],
        [{ version: 1, query: { version: 1, steps: [] }, extra: 1 }, 'INVALID_PROGRAM', '/extra'],
        [{ version: 1, query: { version: 1, steps: [{ op: 'index', index: -1 }] } }, 'INVALID_QUERY', '/query/steps/0/index'],
        [{ version: 1, query: { version: 1, steps: [] }, mutation: { op: 'move' } }, 'INVALID_MUTATION', '/mutation/op'],
        [{ version: 1, query: { version: 1, steps: [] }, mutation: { op: 'merge', value: [] } }, 'INVALID_MUTATION', '/mutation/value'],
        [{ version: 1, query: { version: 1, steps: [] }, limits: [] }, 'INVALID_PROGRAM', '/limits'],
        [{ version: 1, query: { version: 1, steps: [] }, limits: { maxCost: 1 } }, 'INVALID_PROGRAM', '/limits/maxCost'],
        [{ version: 1, query: { version: 1, steps: [] }, limits: { maxMatches: -1 } }, 'INVALID_PROGRAM', '/limits/maxMatches'],
        [{ version: 1, query: { version: 1, steps: [] }, limits: { maxOperations: 0.5 } }, 'INVALID_PROGRAM', '/limits/maxOperations'],
    ] as const)('rejects malformed programs %#', (input, code, path) => {
        expectError(() => programFromIR(input), code, path);
    });

    it('validates builder options and structural programs', () => {
        expectError(() => program(null as never), 'INVALID_PROGRAM', '');
        expectError(() => program({ query: { toIR: () => ({ version: 3, steps: [] }) } as never }), 'INVALID_QUERY', '/query/version');
        expectError(() => program({ query: pending, limits: { maxMatches: -1 } }), 'INVALID_PROGRAM', '/limits/maxMatches');
        const nested = new Error('boom');
        const throwing: Program = { toIR: () => { throw nested; } };
        expect(() => program({ query: throwing as never })).toThrow(nested);
    });
});
