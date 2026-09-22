import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import {
    and, current, decision, eq, exists, expected, field, gt, isIn, literal, not, or, probability, program,
    programFromIR, programSchema, query, querySchema,
} from '../index';
import { invalidIndices, invalidPredicates, invalidQueries, invalidSteps } from './fixtures';

const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
const validProgram = ajv.compile(programSchema);
const validQuery = ajv.compile(querySchema);
const wrap = (steps: unknown[]) => ({ version: 1, query: { version: 1, steps } });
const accepts = (input: unknown) => {
    try {
        programFromIR(input);
        return true;
    } catch {
        return false;
    }
};

describe('program schema', () => {
    it('is frozen JSON for a root object', () => {
        expect(programSchema.type).toBe('object');
        expect(Object.isFrozen(programSchema)).toBe(true);
        expect(JSON.parse(JSON.stringify(programSchema))).toEqual(programSchema);
    });

    it('accepts every program the validator accepts', () => {
        const built = query().field('orders').each()
            .where(and(
                or(eq(field('status'), literal('open')), not(exists(field('closedAt')))),
                gt(probability('fraud', true, field('order')), literal(0.9)),
                isIn(decision('intent'), ['refund', { any: [1] }]),
                gt(expected('urgency'), literal(3)),
                eq(current(), literal(null)),
            ))
            .field('items').index(0).sort(field('rank', 0), 'desc').skip(1).limit(2);
        const samples = [
            program({ query: built }),
            program({ query: built, mutation: { op: 'merge', value: { review: true } }, limits: { maxMatches: 0 } }),
            program({ query: query(), mutation: { op: 'replace', value: null }, limits: {} }),
            program({ query: query().each(), mutation: { op: 'remove' } }),
        ];
        for (const sample of samples) {
            expect(validProgram(sample.toIR()), JSON.stringify(validProgram.errors)).toBe(true);
            expect(validQuery(sample.toIR().query)).toBe(true);
        }
    });

    it('rejects every malformed program the validator rejects', () => {
        const cases: unknown[] = [
            ...invalidQueries.map(([input]) => ({ version: 1, query: input })),
            ...invalidIndices.map(index => wrap([{ op: 'index', index }])),
            ...invalidPredicates.map(([predicate]) => wrap([{ op: 'where', predicate }])),
            ...invalidSteps.map(([step]) => wrap([step])),
            { version: 2, query: { version: 1, steps: [] } },
            { version: 1, query: { version: 1, steps: [] }, mutation: { op: 'merge', value: [] } },
            { version: 1, query: { version: 1, steps: [] }, mutation: { op: 'remove', value: 1 } },
            { version: 1, query: { version: 1, steps: [] }, limits: { maxMatches: -1 } },
            { version: 1, query: { version: 1, steps: [] }, limits: { other: 1 } },
            wrap([{ op: 'field', key: 'a', extra: 1 }]),
            wrap([{ op: 'where', predicate: { op: 'exists', value: { op: 'field', path: [-1] } } }]),
        ];
        for (const input of cases) {
            expect(accepts(input), JSON.stringify(input)).toBe(false);
            expect(validProgram(input), JSON.stringify(input)).toBe(false);
        }
    });
});
