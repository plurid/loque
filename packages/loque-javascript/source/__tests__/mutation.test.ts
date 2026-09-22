import { describe, expect, it } from 'vitest';
import { current, eq, field, isIn, literal, query, snapshot, type Mutation } from '../index';
import { planOperations } from '../mutation';
import { expectError, expectFrozen } from './helpers';

describe('mutation plans', () => {
    it('plans shallow merges with add/replace and applies only after inspection', () => {
        const original = { records: [
            { id: '1', meta: { a: 1, b: 2 }, nullable: 'old' },
            { id: '2', meta: { a: 3 } },
        ] };
        const state = snapshot(original);
        const selected = state.select(query().field('records').each().where(eq(field('id'), literal('1'))));
        const payload = { meta: { a: 9 }, nullable: null, reviewed: true };
        const plan = selected.plan({ op: 'merge', value: payload });
        expect(plan.matchCount).toBe(1);
        expect(plan.operations).toEqual([
            { op: 'replace', path: '/records/0/meta', value: { a: 9 } },
            { op: 'replace', path: '/records/0/nullable', value: null },
            { op: 'add', path: '/records/0/reviewed', value: true },
        ]);
        expect(state.value).toEqual(original);
        payload.meta.a = 100;
        const next = plan.apply();
        expect(next.value).toEqual({ records: [
            { id: '1', meta: { a: 9 }, nullable: null, reviewed: true },
            { id: '2', meta: { a: 3 } },
        ] });
        expect(state.value).toEqual(original);
        expect(selected.values()).toEqual([original.records[0]]);
        expect(plan.apply().value).toEqual(next.value);
        expect(next.select(query().field('records').each().field('reviewed')).values()).toEqual([true]);
        expectFrozen(plan);
        expectFrozen(next.value);
    });

    it.each([null, true, 4, 'replaced', [1, 2], { nested: [false] }])('replaces selected values with %j', value => {
        const state = snapshot([0, 1, 2]);
        const plan = state.select(query().each().where(isIn(current(), [0, 2]))).plan({ op: 'replace', value });
        expect(plan.matchCount).toBe(2);
        expect(plan.operations).toEqual([
            { op: 'replace', path: '/0', value }, { op: 'replace', path: '/2', value },
        ]);
        expect(plan.apply().value).toEqual([value, 1, value]);
        expect(state.value).toEqual([0, 1, 2]);
    });

    it('owns replacement payloads and makes operations immutable', () => {
        const payload = { nested: [1] };
        const plan = snapshot([0]).select(query().index(0)).plan({ op: 'replace', value: payload });
        payload.nested[0] = 9;
        expect(plan.apply().value).toEqual([{ nested: [1] }]);
        expectFrozen(plan.operations);
        expect(() => Object.assign(plan.operations[0], { path: '/99' })).toThrow(TypeError);
        expect(() => Object.assign(plan.operations, { 1: { op: 'remove', path: '' } })).toThrow(TypeError);
    });

    it('supports root replacement and root object merge', () => {
        const state = snapshot(null);
        const replaced = state.select(query()).plan({ op: 'replace', value: { a: [1] } });
        expect(replaced.operations).toEqual([{ op: 'replace', path: '', value: { a: [1] } }]);
        expectFrozen(replaced.apply().value);
        expect(replaced.apply().value).toEqual({ a: [1] });
        expect(snapshot({ a: 1 }).select(query()).plan({ op: 'merge', value: { b: 2 } }).apply().value).toEqual({ a: 1, b: 2 });
        expectError(() => state.select(query()).plan({ op: 'remove' }), 'INVALID_MUTATION', '');
    });

    it('removes array siblings in descending numeric order, including indices above nine', () => {
        const source = Array.from({ length: 13 }, (_, i) => i);
        const state = snapshot({ items: source });
        const selected = state.select(query().field('items').each().where(isIn(current(), [0, 2, 10, 12])));
        const plan = selected.plan({ op: 'remove' });
        expect(selected.paths()).toEqual(['/items/0', '/items/2', '/items/10', '/items/12']);
        expect(plan.operations).toEqual([12, 10, 2, 0].map(i => ({ op: 'remove', path: `/items/${i}` })));
        const expected = { items: [1, 3, 4, 5, 6, 7, 8, 9, 11] };
        expect(plan.apply().value).toEqual(expected);
        expect(plan.apply().value).toEqual(expected);
        expect(state.value).toEqual({ items: source });
        expect(plan.matchCount).toBe(4);
    });

    it('removes nodes from several arrays and objects without confusing numeric keys', () => {
        const state = snapshot({ a: [1, 2, 3], b: [2, 3], c: { 0: 2, x: 1, 10: 3 } });
        const plan = state.select(query().each().each().where(isIn(current(), [2, 3]))).plan({ op: 'remove' });
        expect(plan.operations.map(op => op.path)).toEqual(['/a/2', '/a/1', '/b/1', '/b/0', '/c/0', '/c/10']);
        expect(plan.apply().value).toEqual({ a: [1], b: [], c: { x: 1 } });
    });

    it('removes all array elements or object properties', () => {
        expect(snapshot([1, 2, 3]).select(query().each()).plan({ op: 'remove' }).apply().value).toEqual([]);
        expect(snapshot({ a: 1, b: 2 }).select(query().each()).plan({ op: 'remove' }).apply().value).toEqual({});
    });

    it('applies escaped pointers correctly for merge, replace, and remove', () => {
        const original = { 'a/b': { '~1': 1, '': 2, '~': 3 } };
        const state = snapshot(original);
        const plan = state.select(query().field('a/b')).plan({ op: 'merge', value: { '~1': 10, 'x/y': 4 } });
        expect(plan.operations).toEqual([
            { op: 'replace', path: '/a~1b/~01', value: 10 },
            { op: 'add', path: '/a~1b/x~1y', value: 4 },
        ]);
        expect(plan.apply().value).toEqual({ 'a/b': { '~1': 10, '': 2, '~': 3, 'x/y': 4 } });
        expect(state.select(query().field('a/b').field('')).plan({ op: 'remove' }).apply().value).toEqual({ 'a/b': { '~1': 1, '~': 3 } });
        expect(state.select(query().field('a/b').field('~')).plan({ op: 'replace', value: 0 }).apply().value).toEqual({ 'a/b': { '~1': 1, '': 2, '~': 0 } });
    });

    it('handles __proto__ and constructor as data throughout patch application', () => {
        const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":true}}}');
        const added = snapshot({}).select(query()).plan({ op: 'merge', value: payload }).apply();
        expect(added.value).toEqual(payload);
        expect(Object.getPrototypeOf(added.value)).toBe(Object.prototype);
        const replaced = added.select(query().field('__proto__')).plan({ op: 'merge', value: { polluted: false } }).apply();
        expect(replaced.select(query().field('__proto__').field('polluted')).values()).toEqual([false]);
        const removed = replaced.select(query().field('__proto__')).plan({ op: 'remove' }).apply();
        expect(Object.hasOwn(removed.value as object, '__proto__')).toBe(false);
        expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
        expect(Object.hasOwn(Object.prototype, 'bad')).toBe(false);
    });

    it('fails the whole plan when any merge target is incompatible', () => {
        const state = snapshot([{ ok: true }, null, 1, []]);
        expectError(() => state.select(query().each()).plan({ op: 'merge', value: { added: true } }), 'INVALID_MUTATION', '/1');
        expect(state.value).toEqual([{ ok: true }, null, 1, []]);
        expectError(() => snapshot([]).select(query()).plan({ op: 'merge', value: {} }), 'INVALID_MUTATION', '');
    });

    it.each([
        { op: 'remove' }, { op: 'replace', value: 1 }, { op: 'merge', value: { a: 1 } },
    ] as const)('returns an empty plan for empty selections: $op', mutation => {
        const state = snapshot({ a: 1 });
        const plan = state.select(query().field('missing')).plan(mutation);
        expect(plan.matchCount).toBe(0);
        expect(plan.operations).toEqual([]);
        const next = plan.apply();
        expect(next).not.toBe(state);
        expect(next.value).toEqual(state.value);
        expectFrozen(next.value);
    });

    it('counts matches for an empty merge without emitting operations', () => {
        const plan = snapshot([{}, {}]).select(query().each()).plan({ op: 'merge', value: {} });
        expect(plan.matchCount).toBe(2);
        expect(plan.operations).toEqual([]);
    });

    it.each([
        [null, ''], [[], ''], [{ op: 'move' }, '/op'],
        [{ op: 'remove', value: 1 }, '/value'], [{ op: 'replace' }, '/value'],
        [{ op: 'merge', value: null }, '/value'], [{ op: 'merge', value: [] }, '/value'],
        [{ op: 'replace', value: undefined }, '/value'],
        [{ op: 'replace', value: { a: NaN } }, '/value/a'],
    ])('rejects invalid mutations even on empty selections %#', (mutation, path) => {
        expectError(() => snapshot({}).select(query().field('missing')).plan(mutation as Mutation), 'INVALID_MUTATION', path as string);
    });
});

describe('mutation compiler conflict checks', () => {
    // Current downward-only queries cannot overlap. Exercise the compiler boundary
    // directly so a future traversal extension cannot silently corrupt patches.
    it('rejects duplicate, ancestor, and root-overlapping targets in either order', () => {
        const state = snapshot({ a: { b: 1 } });
        const root = state.select(query()).first()!;
        const parent = state.select(query().field('a')).first()!;
        const child = state.select(query().field('a').field('b')).first()!;
        for (const nodes of [[parent, parent], [parent, child], [child, parent], [child, root]]) {
            expectError(() => planOperations(state.value, nodes, { op: 'replace', value: null }), 'INVALID_MUTATION');
        }
    });

    it('does not mistake a shared string prefix for ancestry', () => {
        const state = snapshot({ a: 1, ab: 2, 'a/b': 3 });
        expect(planOperations(state.value, state.select(query().each()).nodes(), { op: 'replace', value: null })).toHaveLength(3);
    });
});
