import { describe, expect, it } from 'vitest';
import {
    and, current, eq, exists, field, gt, gte, isIn, literal, lt, lte, ne, not, or, query, snapshot,
    type PredicateIR,
} from '../index';

const records = query().field('records').each();

describe('selection traversal', () => {
    it('extracts nested collections through successive filters', () => {
        const state = snapshot({ records: [
            { id: '1', children: [{ id: 1, name: 'one' }, { id: 2, name: 'two' }] },
            { id: '2', children: [{ id: 2, name: 'other' }] },
        ] });
        const result = state.select(records.where(eq(field('id'), literal('1')))
            .field('children').each().where(eq(field('id'), literal(2))).field('name'));
        expect(result.nodes()).toEqual([{ path: '/records/0/children/1/name', value: 'two' }]);
        expect(result.count()).toBe(1);
        expect(state.select(records.field('children').index(0).field('name')).values()).toEqual(['one', 'other']);
    });

    it('enumerates arrays in order and objects in ECMAScript own key order', () => {
        const state = snapshot({ z: 'last created first', 10: 'ten', 2: 'two', a: 'last' });
        expect(state.select(query().each()).paths()).toEqual(['/2', '/10', '/z', '/a']);
        expect(snapshot([3, 1, 3]).select(query().each()).values()).toEqual([3, 1, 3]);
        expect(snapshot({ a: [1, 2], b: [3] }).select(query().each().each()).values()).toEqual([1, 2, 3]);
    });

    it('distinguishes numeric object keys and array indices without parsing dot paths', () => {
        const state = snapshot({ '0': 'object zero', 'a.b': { '': [null] }, array: ['array zero'] });
        expect(state.select(query().field('0')).values()).toEqual(['object zero']);
        expect(state.select(query().index(0)).count()).toBe(0);
        expect(state.select(query().field('array').field('0')).count()).toBe(0);
        expect(state.select(query().field('array').index(0)).values()).toEqual(['array zero']);
        expect(state.select(query().field('a.b').field('').index(0)).paths()).toEqual(['/a.b//0']);
    });

    it('emits RFC 6901 pointers including the root, empty keys, slash and tilde', () => {
        const state = snapshot({ '': 0, 'a/b': 1, 'm~n': 2, '~1': 3, '🧭': 4 });
        expect(state.select(query()).paths()).toEqual(['']);
        expect(state.select(query().each()).paths()).toEqual(['/', '/a~1b', '/m~0n', '/~01', '/🧭']);
    });

    it('returns empty selections for missing fields and incompatible containers', () => {
        const state = snapshot({ records: [{ a: [1] }, { a: null }, 2, false, { b: [] }] });
        const result = state.select(records.field('a').index(10));
        expect(result.nodes()).toEqual([]);
        expect(result.values()).toEqual([]);
        expect(result.paths()).toEqual([]);
        expect(result.first()).toBeUndefined();
        expect(result.count()).toBe(0);
        expect(state.select(records.field('a').each()).values()).toEqual([1]);
        expect(state.select(query().field('absent').each().field('deeper')).count()).toBe(0);
        expect(snapshot(null).select(query().each()).count()).toBe(0);
    });

    it('does not duplicate a node that satisfies several OR branches', () => {
        const state = snapshot({ records: [{ id: 1 }, { id: 1 }] });
        const predicate = eq(field('id'), literal(1));
        expect(state.select(records.where(or(predicate, predicate))).paths()).toEqual(['/records/0', '/records/1']);
    });
});

describe('predicates', () => {
    const select = (data: unknown, predicate: PredicateIR) => snapshot(data).select(query().each().where(predicate)).values();

    it('uses typed scalar equality without coercion', () => {
        const data = [1, '1', true, false, null, 0, ''];
        expect(select(data, eq(current(), literal(1)))).toEqual([1]);
        expect(select(data, eq(current(), literal(null)))).toEqual([null]);
        expect(select(data, ne(current(), literal(1)))).toEqual(['1', true, false, null, 0, '']);
    });

    it('uses structural equality, ignores object key order, and preserves array order', () => {
        const wanted = { a: [1, { b: null }], c: true };
        const equivalent = { c: true, a: [1, { b: null }] };
        const different = { a: [1, { b: false }], c: true };
        expect(select([equivalent, different], eq(current(), literal(wanted)))).toEqual([equivalent]);
        expect(select([[1, 2], [2, 1], [1], { 0: 1, 1: 2 }, null], eq(current(), literal([1, 2])))).toEqual([[1, 2]]);
        expect(select([{ a: 1 }, { b: 1 }, { a: 1, b: 1 }, []], eq(current(), literal({ a: 1 })))).toEqual([{ a: 1 }]);
    });

    it.each([
        [lt, [1]], [lte, [1, 2]], [gt, [3]], [gte, [2, 3]],
    ] as const)('orders numbers with %s', (compare, expected) => {
        expect(select([1, 2, 3, '2', null, true, [], {}], compare(current(), literal(2)))).toEqual(expected);
    });

    it.each([
        [lt, ['a']], [lte, ['a', 'b']], [gt, ['c']], [gte, ['b', 'c']],
    ] as const)('orders strings with %s', (compare, expected) => {
        expect(select(['a', 'b', 'c', 2], compare(current(), literal('b')))).toEqual(expected);
    });

    it('does not order booleans, null, objects, or arrays', () => {
        for (const value of [true, null, {}, []]) {
            expect(select([value], lte(current(), literal(value)))).toEqual([]);
        }
    });

    it('distinguishes missing from null and keeps every missing comparison false', () => {
        const data = [{}, { a: null }, { a: 1 }];
        expect(select(data, exists(field('a')))).toEqual([{ a: null }, { a: 1 }]);
        expect(select(data, not(exists(field('a'))))).toEqual([{}]);
        expect(select(data, eq(field('a'), literal(null)))).toEqual([{ a: null }]);
        expect(select(data, not(eq(field('a'), literal(null))))).toEqual([{}, { a: 1 }]);
        for (const compare of [eq, ne, lt, lte, gt, gte]) {
            expect(select(data, compare(field('missing'), literal(1)))).toEqual([]);
            expect(select(data, compare(literal(1), field('missing')))).toEqual([]);
        }
        expect(select(data, eq(field('missing'), field('missing')))).toEqual([]);
    });

    it('resolves nested relative paths, including array indices and empty keys', () => {
        const data = [{ a: [{ '': 2 }] }, { a: [] }, { a: null }, {}];
        expect(select(data, eq(field('a', 0, ''), literal(2)))).toEqual([data[0]]);
        expect(select(data, exists(field('a', 0, 'missing', 'deeper')))).toEqual([]);
        expect(select([null, false], exists(current()))).toEqual([null, false]);
    });

    it('supports membership by structural equality and treats missing as absent', () => {
        expect(select([1, '1', { a: true }, 2], isIn(current(), [1, { a: true }]))).toEqual([1, { a: true }]);
        expect(select([1], isIn(current(), []))).toEqual([]);
        expect(select([{}], isIn(field('missing'), [null]))).toEqual([]);
    });

    it('combines filters with conventional booleans, including empty identities', () => {
        const data = [1, 2, 3, 4];
        expect(select(data, and(gt(current(), literal(1)), lt(current(), literal(4))))).toEqual([2, 3]);
        expect(select(data, or(eq(current(), literal(1)), eq(current(), literal(4))))).toEqual([1, 4]);
        expect(select(data, not(isIn(current(), [2, 3])))).toEqual([1, 4]);
        expect(select(data, and())).toEqual(data);
        expect(select(data, or())).toEqual([]);
        expect(snapshot(data).select(query().each().where(gte(current(), literal(2))).where(lte(current(), literal(3)))).values()).toEqual([2, 3]);
    });
});
