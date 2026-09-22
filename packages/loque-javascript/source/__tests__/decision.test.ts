import { describe, expect, it, vi } from 'vitest';
import {
    booleanDecision, choiceDecision, scoreDecision, snapshot,
    type DecisionData, type DecisionProvenance,
} from '../index';
import { expectError, expectFrozen } from './helpers';

const provenance: DecisionProvenance = {
    evaluator: 'test',
    evaluatorVersion: '1',
    model: 'test-model-v1',
    judgment: 'review',
    judgmentVersion: '2',
    inputHash: 'test-input-hash',
    timestamp: '2026-09-22T12:00:00.000Z',
};

function binary(probability = 0.75) {
    return {
        distribution: [
            { value: false, probability: 1 - probability },
            { value: true, probability },
        ],
        provenance: { ...provenance },
    };
}

describe('decision definitions and results', () => {
    it('keeps boolean probabilities visible and owns the result data', () => {
        const definition = booleanDecision();
        const input = binary();
        const result = definition.parse(input);
        input.distribution[0].probability = 1;
        input.provenance.model = 'changed';
        expect(definition.kind).toBe('boolean');
        expect(definition.outcomes).toEqual([false, true]);
        expect(result.value).toBe(true);
        expect(result.probability(true)).toBe(0.75);
        expect(result.probability(false)).toBe(0.25);
        expect(result.provenance).toEqual(provenance);
        expectFrozen(definition);
        expectFrozen(result);
        expectFrozen(result.toJSON());
        expect(() => Object.assign(result.distribution[0], { probability: 1 })).toThrow(TypeError);
    });

    it.each([0, 1])('accepts certain and impossible outcomes at probability %j', probability => {
        const result = booleanDecision().parse(binary(probability));
        expect(result.value).toBe(probability === 1);
        expect(result.probability(true)).toBe(probability);
    });

    it('uses definition order for distributions and ties, including false before true', () => {
        const input = binary(0.5);
        input.distribution.reverse();
        const result = booleanDecision().parse(input);
        expect(result.value).toBe(false);
        expect(result.distribution.map(entry => entry.value)).toEqual([false, true]);

        const choices = ['refund', 'replace'];
        const definition = choiceDecision(choices);
        choices.reverse();
        choices.push('other');
        const choice = definition.parse({
            distribution: [{ value: 'replace', probability: 0.5 }, { value: 'refund', probability: 0.5 }],
            provenance,
        });
        expect(definition.kind).toBe('choice');
        expect(definition.outcomes).toEqual(['refund', 'replace']);
        expect(choice.value).toBe('refund');
        expect(choice.distribution.map(entry => entry.value)).toEqual(['refund', 'replace']);
        expectFrozen(definition);
    });

    it('treats special object-property names as ordinary choice labels', () => {
        const result = choiceDecision(['__proto__', 'constructor', 'toString']).parse({
            distribution: [
                { value: 'toString', probability: 0 },
                { value: 'constructor', probability: 0.25 },
                { value: '__proto__', probability: 0.75 },
            ],
            provenance,
        });
        expect(result.value).toBe('__proto__');
        expect(result.probability('constructor')).toBe(0.25);
        expect(result.probability('toString')).toBe(0);
    });

    it('supports a singleton choice space', () => {
        const result = choiceDecision(['only']).parse({ distribution: [{ value: 'only', probability: 1 }], provenance });
        expect(result.value).toBe('only');
        expect(result.probability('only')).toBe(1);
    });

    it('distinguishes the most probable score from its expected value', () => {
        const scores = [-2, 0, 4];
        const definition = scoreDecision(scores);
        scores[2] = 100;
        const result = definition.parse({
            distribution: [
                { value: 4, probability: 0.5 },
                { value: -2, probability: 0.25 },
                { value: 0, probability: 0.25 },
            ],
            provenance,
        });
        expect(definition.kind).toBe('score');
        expect(definition.outcomes).toEqual([-2, 0, 4]);
        expect(result.value).toBe(4);
        expect(result.expected).toBe(1.5);
        expect(result.probability(-2)).toBe(0.25);
        expectFrozen(definition);
        expectFrozen(result);
    });

    it.each([0, 0.5, -3, Number.MAX_VALUE, Number.MIN_VALUE])('supports a singleton numeric score %j', value => {
        const result = scoreDecision([value]).parse({ distribution: [{ value, probability: 1 }], provenance });
        expect(result.expected).toBe(value);
        expect(result.value).toBe(value);
    });

    it('avoids overflow in expectations for large finite scores', () => {
        const result = scoreDecision([-Number.MAX_VALUE, Number.MAX_VALUE]).parse({
            distribution: [
                { value: -Number.MAX_VALUE, probability: 0.5 },
                { value: Number.MAX_VALUE, probability: 0.5 },
            ],
            provenance,
        });
        expect(result.value).toBe(-Number.MAX_VALUE);
        expect(result.expected).toBe(0);
    });

    it.each([
        [Number.MIN_VALUE, Number.MAX_VALUE],
        [1e-200, 1e200],
        [-1e200, -1e-200],
    ])('preserves a certain score even across a very wide numeric range %#', (lower, upper) => {
        const definition = scoreDecision([lower, upper]);
        for (const value of [lower, upper]) {
            const result = definition.parse({
                distribution: [
                    { value: lower, probability: value === lower ? 1 : 0 },
                    { value: upper, probability: value === upper ? 1 : 0 },
                ],
                provenance,
            });
            expect(result.expected).toBe(value);
        }
    });

    it('averages subnormal scores while ignoring an impossible extreme score', () => {
        const result = scoreDecision([Number.MIN_VALUE, 2 * Number.MIN_VALUE, Number.MAX_VALUE]).parse({
            distribution: [
                { value: Number.MIN_VALUE, probability: 0.5 },
                { value: 2 * Number.MIN_VALUE, probability: 0.5 },
                { value: Number.MAX_VALUE, probability: 0 },
            ],
            provenance,
        });
        expect(result.expected).toBe(2 * Number.MIN_VALUE);
    });

    it('preserves reported probabilities within the documented rounding tolerance', () => {
        const probability = 0.5000000001;
        const result = scoreDecision([2, 4]).parse({
            distribution: [{ value: 2, probability: 0.5 }, { value: 4, probability }],
            provenance,
        });
        expect(result.probability(4)).toBe(probability);
        expect(result.distribution[0].probability).toBe(0.5);
        expect(result.expected).toBeCloseTo((2 * 0.5 + 4 * probability) / (0.5 + probability), 14);
    });

    it('round-trips portable data and lets snapshots own it without methods', () => {
        const definition = scoreDecision([1, 2, 3]);
        const result = definition.parse({
            distribution: [{ value: 1, probability: 0 }, { value: 2, probability: 0.5 }, { value: 3, probability: 0.5 }],
            provenance,
        });
        const data: DecisionData<1 | 2 | 3> = result.toJSON();
        const serialized = JSON.stringify(result);
        const restored = definition.parse(JSON.parse(serialized));
        expect(JSON.parse(serialized)).toEqual(data);
        expect(Object.keys(data)).toEqual(['distribution', 'provenance']);
        expect(restored.value).toBe(2);
        expect(restored.expected).toBe(2.5);
        expect(restored.distribution).toEqual(result.distribution);
        expect(restored.provenance).toEqual(provenance);
        expect(snapshot(data).value).toEqual(data);
    });

    it.each([
        [null, ''], [{}, ''], [[], ''], [[''], '/0'], [['   '], '/0'],
        [['a', 'a'], '/1'], [[false], '/0'], [[1], '/0'],
    ])('rejects invalid choice definitions %#', (input, path) => {
        expectError(() => choiceDecision(input as never), 'INVALID_DECISION', path as string);
    });

    it.each([
        [[], ''], [null, ''], [['1'], '/0'], [[true], '/0'],
        [[2, 1], '/1'], [[1, 1], '/1'], [[0, -0], '/1'],
        [[NaN], '/0'], [[Infinity], '/0'], [[-Infinity], '/0'],
    ])('rejects invalid score definitions %#', (input, path) => {
        expectError(() => scoreDecision(input as never), 'INVALID_DECISION', path as string);
    });

    it.each([
        [null, ''], [{}, '/distribution'],
        [{ ...binary(), extra: true }, '/extra'],
        [{ ...binary(), distribution: {} }, '/distribution'],
        [{ ...binary(), distribution: [] }, '/distribution'],
        [{ ...binary(), distribution: [binary().distribution[0]] }, '/distribution'],
        [{ ...binary(), distribution: [null, {}] }, '/distribution/0'],
        [{ ...binary(), distribution: [{ value: false }, {}] }, '/distribution/0/probability'],
        [{ ...binary(), distribution: [{ value: false, probability: 0.25, extra: true }, {}] }, '/distribution/0/extra'],
        [{ ...binary(), distribution: [{ value: 'false', probability: 0.25 }, {}] }, '/distribution/0/value'],
        [{ ...binary(), distribution: [{ value: false, probability: 0.5 }, { value: false, probability: 0.5 }] }, '/distribution/1/value'],
    ])('rejects malformed or incomplete distributions %#', (input, path) => {
        expectError(() => booleanDecision().parse(input), 'INVALID_DECISION', path as string);
    });

    it.each([-0.1, 1.1, NaN, Infinity, -Infinity, '0.5', null, undefined])('rejects invalid probabilities %j', probability => {
        const input = binary();
        expectError(() => booleanDecision().parse({
            ...input, distribution: [{ value: false, probability }, input.distribution[1]],
        }), 'INVALID_DECISION', '/distribution/0/probability');
    });

    it.each([0, 0.499, 0.500001, 1])('rejects distributions that do not sum to one %#', probability => {
        expectError(() => booleanDecision().parse({
            ...binary(), distribution: [{ value: false, probability }, { value: true, probability }],
        }), 'INVALID_DECISION', '/distribution');
    });

    it('validates provenance fields and timestamps instead of inventing them', () => {
        for (const key of Object.keys(provenance)) {
            const missing: Record<string, unknown> = { ...provenance };
            delete missing[key];
            expectError(() => booleanDecision().parse({ ...binary(), provenance: missing }), 'INVALID_DECISION', `/provenance/${key}`);
            for (const value of [null, 1, '', '   ']) {
                expectError(() => booleanDecision().parse({ ...binary(), provenance: { ...provenance, [key]: value } }),
                    'INVALID_DECISION', `/provenance/${key}`);
            }
        }
        expectError(() => booleanDecision().parse({ ...binary(), provenance: null }), 'INVALID_DECISION', '/provenance');
        expectError(() => booleanDecision().parse({ ...binary(), provenance: { ...provenance, extra: true } }),
            'INVALID_DECISION', '/provenance/extra');
        for (const timestamp of ['not-a-date', '2026-09-22', '2026-09-22T12:00:00Z', '2026-02-30T12:00:00.000Z']) {
            expectError(() => booleanDecision().parse({ ...binary(), provenance: { ...provenance, timestamp } }),
                'INVALID_DECISION', '/provenance/timestamp');
        }
    });

    it('rejects out-of-domain probability lookups without coercing outcomes', () => {
        const result = booleanDecision().parse(binary());
        expectError(() => result.probability('true' as never), 'INVALID_DECISION', '');
        expectError(() => result.probability(1 as never), 'INVALID_DECISION', '');
        const choice = choiceDecision(['only']).parse({ distribution: [{ value: 'only', probability: 1 }], provenance });
        expectError(() => choice.probability('missing' as never), 'INVALID_DECISION', '');
        expectError(() => scoreDecision([1]).parse({ distribution: [{ value: '1', probability: 1 }], provenance }),
            'INVALID_DECISION', '/distribution/0/value');
    });

    it('rejects getters, non-JSON contents, and cycles without executing user code', () => {
        const getter = vi.fn(() => binary().distribution);
        const input = Object.defineProperty({ provenance }, 'distribution', { enumerable: true, get: getter });
        expectError(() => booleanDecision().parse(input), 'INVALID_DECISION', '/distribution');
        const labels = ['a'];
        Object.defineProperty(labels, '0', { enumerable: true, get: getter });
        expectError(() => choiceDecision(labels), 'INVALID_DECISION', '/0');
        const cyclic: Record<string, unknown> = { ...binary() };
        cyclic.self = cyclic;
        expectError(() => booleanDecision().parse(cyclic), 'INVALID_DECISION', '/self');
        expect(getter).not.toHaveBeenCalled();
    });
});
