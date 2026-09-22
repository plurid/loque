import { describe, expect, it, vi } from 'vitest';
import {
    and, current, decision, eq, exists, expected, field, fromIR, gt, isIn, literal, not, or, probability, query, snapshot,
    type JsonValue, type PredicateIR, type Query,
} from '../index';
import { expectError, expectFrozen } from './helpers';

describe('portable builders and IR', () => {
    it('round-trips a complete query as ordinary JSON', () => {
        const built = query().field('records').each()
            .where(and(exists(field('name')), not(or(eq(field('id'), literal('skip')), isIn(current(), [])))))
            .field('children').index(0);
        const serialized = JSON.stringify(built.toIR());
        const restored = fromIR(JSON.parse(serialized));
        const state = snapshot({ records: [
            { name: 'yes', id: 'keep', children: [1, 2] },
            { name: null, id: 'skip', children: [3] },
        ] });
        expect(restored.toIR()).toEqual(built.toIR());
        expect(state.select(restored).nodes()).toEqual([{ path: '/records/0/children/0', value: 1 }]);
        expect(state.select(built).nodes()).toEqual(state.select(restored).nodes());
        expectFrozen(restored.toIR());
    });

    it('builds branches without modifying prior queries', () => {
        const base = query().field('records');
        const first = base.index(0);
        const all = base.each();
        expect(base.toIR()).toEqual({ version: 1, steps: [{ op: 'field', key: 'records' }] });
        expect(first.toIR().steps).toHaveLength(2);
        expect(all.toIR().steps).toHaveLength(2);
        expect(Object.isFrozen(base)).toBe(true);
        expect(() => Object.assign(base.toIR(), { version: 2 })).toThrow(TypeError);
    });

    it('owns imported IR, literals, membership values, and raw predicates', () => {
        const ir = { version: 1, steps: [{ op: 'field', key: 'a' }] };
        const imported = fromIR(ir);
        ir.steps[0].key = 'b';
        expect(snapshot({ a: 1, b: 2 }).select(imported).values()).toEqual([1]);

        const value = { a: [1] };
        const values = [value];
        const expression = literal(value);
        const predicate = isIn(current(), values);
        const raw: PredicateIR = { op: 'eq', left: current(), right: { op: 'literal', value } };
        const built = query().each().where(raw);
        value.a[0] = 2;
        values.push({ a: [3] });
        const state = snapshot([{ a: [1] }, { a: [2] }, { a: [3] }]);
        expect(state.select(query().each().where(eq(current(), expression))).values()).toEqual([{ a: [1] }]);
        expect(state.select(query().each().where(predicate)).values()).toEqual([{ a: [1] }]);
        expect(state.select(built).values()).toEqual([{ a: [1] }]);
        expectFrozen(expression);
        expectFrozen(predicate);
    });

    it.each([
        [null, ''], [[], ''], [{}, '/version'],
        [{ version: 2, steps: [] }, '/version'],
        [{ version: 1, steps: {} }, '/steps'],
        [{ version: 1, steps: [], extra: true }, '/extra'],
        [{ version: 1, steps: [null] }, '/steps/0'],
        [{ version: 1, steps: [{ op: 'unknown' }] }, '/steps/0/op'],
        [{ version: 1, steps: [{ op: 'field' }] }, '/steps/0/key'],
        [{ version: 1, steps: [{ op: 'field', key: 1 }] }, '/steps/0/key'],
        [{ version: 1, steps: [{ op: 'each', extra: true }] }, '/steps/0/extra'],
    ])('rejects malformed top-level or traversal IR %#', (input, path) => {
        expectError(() => fromIR(input), 'INVALID_QUERY', path as string);
    });

    it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null, true])('rejects invalid indices %j', index => {
        expectError(() => fromIR({ version: 1, steps: [{ op: 'index', index }] }), 'INVALID_QUERY', '/steps/0/index');
        if (typeof index !== 'string') {
            expectError(() => field('a', index as number), 'INVALID_QUERY', '/path/1');
        }
    });

    it.each([
        [null, ''], [{ op: 'unknown' }, '/op'],
        [{ op: 'eq', left: { op: 'current' } }, '/right'],
        [{ op: 'eq', left: null, right: { op: 'current' } }, '/left'],
        [{ op: 'eq', left: { op: 'unknown' }, right: { op: 'current' } }, '/left/op'],
        [{ op: 'exists', value: { op: 'field', path: [] } }, '/value/path'],
        [{ op: 'exists', value: { op: 'field', path: 'id' } }, '/value/path'],
        [{ op: 'exists', value: { op: 'current', extra: 1 } }, '/value/extra'],
        [{ op: 'in', value: { op: 'current' }, values: {} }, '/values'],
        [{ op: 'and', predicates: {} }, '/predicates'],
        [{ op: 'or', predicates: [false] }, '/predicates/0'],
        [{ op: 'not', predicate: {} }, '/predicate/op'],
    ])('rejects malformed predicates and expressions %#', (predicate, path) => {
        expectError(() => fromIR({ version: 1, steps: [{ op: 'where', predicate }] }), 'INVALID_QUERY', `/steps/0/predicate${path}`);
    });

    it('applies the same validation to builders as imported IR', () => {
        expectError(() => query().index(-1), 'INVALID_QUERY', '/steps/0/index');
        expectError(() => query().field(1 as never), 'INVALID_QUERY', '/steps/0/key');
        expectError(() => query().where({ op: 'unknown' } as never), 'INVALID_QUERY');
        expectError(() => literal(undefined as never), 'INVALID_QUERY', '/value');
        expectError(() => eq(current(), {} as never), 'INVALID_QUERY', '/right/op');
    });

    it('rejects non-JSON IR and callbacks without evaluating them', () => {
        const callback = vi.fn(() => true);
        const getter = vi.fn(() => 1);
        expectError(() => fromIR(Object.defineProperty({ steps: [] }, 'version', { get: getter, enumerable: true })), 'INVALID_QUERY', '/version');
        expectError(() => query().where(callback as never), 'INVALID_QUERY', '/steps/0/predicate');
        const cyclic: Record<string, unknown> = { version: 1, steps: [] };
        cyclic.self = cyclic;
        expectError(() => fromIR(cyclic), 'INVALID_QUERY', '/self');
        expect(callback).not.toHaveBeenCalled();
        expect(getter).not.toHaveBeenCalled();
    });

    it.each([null, 'records', {}, { toIR: 1 }])('rejects invalid select arguments %#', input => {
        expectError(() => snapshot({}).select(input as never), 'INVALID_QUERY', '');
    });

    it('validates structural query implementations when they enter a snapshot', () => {
        const built = query();
        const modified: Query = { ...built, toIR: () => ({ version: 1, steps: [{ op: 'unknown' }] } as never) };
        expectError(() => snapshot({}).select(modified), 'INVALID_QUERY', '/steps/0/op');
    });

    it('supports JSON literals containing operator-like keys as plain data', () => {
        const value: JsonValue = { op: 'anything', version: 99, left: [null] };
        expect(snapshot([value]).select(query().each().where(eq(current(), literal(value)))).values()).toEqual([value]);
    });

    it('round-trips judgment expressions and paging steps', () => {
        const built = query().each()
            .where(and(gt(probability('fraud', true, field('order')), literal(0.9)), eq(decision('intent'), literal('refund'))))
            .where(gt(expected('urgency'), literal(3)))
            .sort(field('total'), 'desc').skip(2).limit(5);
        expect(built.toIR().steps.slice(2)).toEqual([
            { op: 'where', predicate: { op: 'gt', left: { op: 'expected', judgment: 'urgency', input: { op: 'current' } }, right: { op: 'literal', value: 3 } } },
            { op: 'sort', by: { op: 'field', path: ['total'] }, direction: 'desc' },
            { op: 'skip', count: 2 },
            { op: 'limit', count: 5 },
        ]);
        expect(fromIR(JSON.parse(JSON.stringify(built.toIR()))).toIR()).toEqual(built.toIR());
        expect(query().sort(current()).toIR().steps[0]).toEqual({ op: 'sort', by: { op: 'current' }, direction: 'asc' });
    });

    const judged = { op: 'decision', judgment: 'intent', input: { op: 'current' } };
    it.each([
        [{ op: 'sort', by: { op: 'current' } }, '/direction'],
        [{ op: 'sort', by: { op: 'current' }, direction: 'up' }, '/direction'],
        [{ op: 'sort', by: judged, direction: 'asc' }, '/by/op'],
        [{ op: 'skip', count: -1 }, '/count'],
        [{ op: 'limit', count: 1.5 }, '/count'],
        [{ op: 'limit' }, '/count'],
        [{ op: 'where', predicate: { op: 'exists', value: { ...judged, judgment: ' ' } } }, '/predicate/value/judgment'],
        [{ op: 'where', predicate: { op: 'exists', value: { ...judged, input: judged } } }, '/predicate/value/input/op'],
        [{ op: 'where', predicate: { op: 'exists', value: { ...judged, outcome: 1 } } }, '/predicate/value/outcome'],
        [{ op: 'where', predicate: { op: 'exists', value: { ...judged, op: 'probability' } } }, '/predicate/value/outcome'],
        [{ op: 'where', predicate: { op: 'exists', value: { ...judged, op: 'probability', outcome: null } } }, '/predicate/value/outcome'],
    ])('rejects malformed judgment and paging IR %#', (step, path) => {
        expectError(() => fromIR({ version: 1, steps: [step] }), 'INVALID_QUERY', `/steps/0${path}`);
    });

    it('rejects nested judgments and invalid builder arguments', () => {
        expectError(() => probability('a', true, decision('b') as never), 'INVALID_QUERY', '/input/op');
        expectError(() => probability({} as never, true), 'INVALID_QUERY', '/judgment');
        expectError(() => query().limit(-1), 'INVALID_QUERY', '/steps/0/count');
        expectError(() => query().sort(field('a'), 'up' as never), 'INVALID_QUERY', '/steps/0/direction');
    });
});
