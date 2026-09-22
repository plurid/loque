import { describe, expect, it, vi } from 'vitest';
import loque, { query, snapshot } from '../index';
import { expectError, expectFrozen } from './helpers';

describe('JSON snapshots', () => {
    it.each([null, true, false, 0, -0, 1.5, '', 'hello', [], {}])('supports the JSON root %j', value => {
        const state = snapshot(value);
        expect(state.value).toEqual(value);
        expect(state.select(query()).nodes()).toEqual([{ path: '', value }]);
        expect(state.select(query()).values()).toEqual([value]);
        expect(state.select(query()).count()).toBe(1);
        expect(state.select(query()).first()).toEqual({ path: '', value });
        expectFrozen(state.value);
    });

    it('owns the full tree without freezing or retaining the caller tree', () => {
        const data = { records: [{ id: '1', nested: { score: 2 } }] };
        const state = snapshot(data);
        const selection = state.select(query().field('records').each());
        data.records[0].nested.score = 99;
        data.records.push({ id: '2', nested: { score: 0 } });
        expect(state.value).toEqual({ records: [{ id: '1', nested: { score: 2 } }] });
        expect(selection.values()).toEqual([{ id: '1', nested: { score: 2 } }]);
        expect(Object.isFrozen(data)).toBe(false);
        expect(Object.isFrozen(data.records)).toBe(false);
        for (const value of [state, state.value, selection, selection.nodes(), selection.values(), selection.paths()]) {
            expectFrozen(value);
        }
        expect(() => Object.assign(selection.first()!, { path: '/other' })).toThrow(TypeError);
        expect(() => Object.assign(selection.first()!.value!, { id: 'changed' })).toThrow(TypeError);
    });

    it('treats repeated references as separate paths, including equal values', () => {
        const shared = { value: true };
        const state = snapshot({ a: shared, b: shared });
        shared.value = false;
        expect(state.select(query().each()).paths()).toEqual(['/a', '/b']);
        expect(state.select(query().each()).values()).toEqual([{ value: true }, { value: true }]);
    });

    it('accepts frozen inputs and null-prototype records', () => {
        const record = Object.create(null) as Record<string, unknown>;
        record.a = Object.freeze([Object.freeze({ b: 1 })]);
        const state = snapshot(Object.freeze(record));
        expect(state.value).toEqual({ a: [{ b: 1 }] });
        expectFrozen(state.value);
    });

    it('preserves dangerous-looking names as own data properties', () => {
        const input: unknown = JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"prototype":2}');
        const state = snapshot(input);
        expect(state.select(query().field('__proto__').field('polluted')).values()).toEqual([true]);
        expect(state.select(query().field('constructor')).values()).toEqual([1]);
        expect(state.select(query().field('toString')).count()).toBe(0);
        expect(Object.hasOwn(state.value as object, '__proto__')).toBe(true);
        expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    });

    it.each([
        undefined, NaN, Infinity, -Infinity, 1n, Symbol('value'), () => 1,
        new Date(), new Map(), new Set(), /pattern/, new Number(1),
        new (class Record { value = 1; })(),
        new (class List extends Array<number> {})(),
        Object.create({ inherited: true }),
        { nested: undefined }, [undefined], new Array(3),
        Object.assign([1], { extra: true }),
        Object.defineProperty({}, 'hidden', { value: true }),
        { [Symbol('key')]: 1 },
    ])('rejects non-JSON input %#', input => {
        expectError(() => snapshot(input), 'INVALID_JSON');
    });

    it('rejects symbol keys and non-index properties on arrays', () => {
        const symbolArray = Object.assign([1], { [Symbol('key')]: 1 });
        expectError(() => snapshot(symbolArray), 'INVALID_JSON');
        const disguisedSparse = Object.assign(new Array(1), { '01': 'not an index' });
        expectError(() => snapshot(disguisedSparse), 'INVALID_JSON', '/01');
    });

    it('reports the exact escaped path of an invalid nested value', () => {
        expectError(() => snapshot({ 'a/b': [{ '~': Infinity }] }), 'INVALID_JSON', '/a~1b/0/~0');
    });

    it('rejects cycles while allowing non-cyclic shared references', () => {
        const object: Record<string, unknown> = {};
        object.self = object;
        expectError(() => snapshot(object), 'INVALID_JSON', '/self');
        const array: unknown[] = [];
        array.push(array);
        expectError(() => snapshot(array), 'INVALID_JSON', '/0');
    });

    it('never invokes object getters, array getters, or toJSON', () => {
        const getter = vi.fn(() => 'value');
        const toJSON = vi.fn(() => ({}));
        expectError(() => snapshot(Object.defineProperty({}, 'a', { get: getter, enumerable: true })), 'INVALID_JSON', '/a');
        expectError(() => snapshot(Object.defineProperty([0], '0', { get: getter, enumerable: true })), 'INVALID_JSON', '/0');
        expectError(() => snapshot({ toJSON }), 'INVALID_JSON', '/toJSON');
        expect(getter).not.toHaveBeenCalled();
        expect(toJSON).not.toHaveBeenCalled();
    });

    it('exports the same factories through the default namespace', () => {
        expect(loque.snapshot).toBe(snapshot);
        expect(loque.query).toBe(query);
        expect(Object.isFrozen(loque)).toBe(true);
        expect(Object.hasOwn(loque, 'extract')).toBe(false);
    });
});
