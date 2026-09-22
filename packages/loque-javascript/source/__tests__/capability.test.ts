import { describe, expect, it } from 'vitest';
import {
    and, capability, current, decision, eq, exists, field, gt, literal, not, probability, program, query,
    type CapabilityOptions, type Mutation, type Query,
} from '../index';
import { expectError } from './helpers';

const orders = query().field('orders').each();
const base: CapabilityOptions = {
    read: ['/orders/*', '/customers/*/name'],
    write: ['/orders/*/review'],
    deny: ['/orders/*/card'],
    judgments: ['fraud'],
    mutations: ['merge'],
};
const check = (built: Query, mutation?: Mutation, options: CapabilityOptions = base) =>
    capability(options).check(program({ query: built, ...(mutation === undefined ? {} : { mutation }) }));

describe('capabilities', () => {
    it('allows reads and writes covered by patterns', () => {
        expect(check(orders.where(eq(field('status'), literal('open'))).field('id'))).toEqual([]);
        expect(check(orders.where(not(exists(field('card')))).field('id')))
            .toMatchObject([{ path: '/query/steps/2/predicate/predicate/value', location: '/orders/*/card' }]);
        expect(check(orders.where(gt(probability('fraud', true), literal(0.9))), { op: 'merge', value: { review: true } }))
            .toEqual([]);
        expect(check(query().field('customers').index(3).field('name'))).toEqual([]);
    });

    it('does not require reading the whole target of a write program', () => {
        // Orders contain a denied card, but a merge returns only paths and operations.
        expect(check(orders, { op: 'merge', value: { review: true } })).toEqual([]);
        expect(check(orders, { op: 'merge', value: { card: null } }))
            .toMatchObject([{ kind: 'write', location: '/orders/*/card' }]);
    });

    it('denies selecting or comparing a node that contains a denied subtree', () => {
        expect(check(orders)).toEqual([{
            kind: 'read', path: '/query', location: '/orders/*', message: 'Location overlaps a denied location',
        }]);
        expect(check(orders.field('card'))).toMatchObject([{ kind: 'read', location: '/orders/*/card' }]);
        expect(check(orders.where(eq(current(), literal(null))).field('id')))
            .toMatchObject([{ kind: 'read', path: '/query/steps/2/predicate/left', location: '/orders/*' }]);
        expect(check(query().field('orders').index(0).field('id'), undefined, { ...base, deny: ['/orders/1'] })).toEqual([]);
        expect(check(query().field('orders').index(0).field('id'), undefined, { ...base, deny: ['/orders/*/id'] }))
            .toMatchObject([{ kind: 'read', location: '/orders/0/id' }]);
    });

    it('requires wildcard read patterns for each steps', () => {
        const narrow = { ...base, read: ['/customers/0'] };
        expect(check(query().field('customers').each(), undefined, narrow))
            .toMatchObject([{ kind: 'read', location: '/customers/*', message: 'Location is not readable' }]);
        expect(check(query().field('customers').index(0), undefined, narrow)).toEqual([]);
        expect(check(query().field('customers').field('*'), undefined, narrow))
            .toMatchObject([{ kind: 'read', location: '/customers/*' }]);
        expect(check(query().field('customers').field('*'), undefined, { ...base, read: ['/customers/*'] })).toEqual([]);
    });

    it('checks predicate fields, sort keys, existence, and nested judgments', () => {
        const found = check(query().field('customers').each()
            .where(and(exists(field('email')), eq(decision('churn'), literal(true))))
            .sort(field('age')).field('name'));
        expect(found.map(item => [item.kind, item.path, item.location])).toEqual([
            ['read', '/query/steps/2/predicate/predicates/0/value', '/customers/*/email'],
            ['judgment', '/query/steps/2/predicate/predicates/1/left/judgment', '/customers/*'],
            ['read', '/query/steps/3/by', '/customers/*/age'],
        ]);
        expect(check(orders.where(exists(literal(1))).field('id'))).toEqual([]);
    });

    it('checks mutation kinds and each written location', () => {
        expect(check(orders.field('id'), { op: 'remove' }).map(item => [item.kind, item.path, item.location])).toEqual([
            ['mutation', '/mutation/op', '/orders/*/id'],
            ['write', '/mutation', '/orders/*/id'],
        ]);
        expect(check(orders.where(exists(field('id'))).field('id'),
            { op: 'merge', value: { review: true, 'a/b': 1 } }).map(item => item.path))
            .toEqual(['/mutation/value/review', '/mutation/value/a~1b']);
        expect(check(orders.where(exists(field('card'))), { op: 'merge', value: {} }))
            .toMatchObject([{ kind: 'read', location: '/orders/*/card' }]);
        const replaceAll = { ...base, read: ['/orders'], write: ['/orders'], mutations: ['replace'] as const };
        expect(check(query().field('orders'), { op: 'replace', value: [] }, replaceAll))
            .toMatchObject([{ kind: 'write', message: 'Location overlaps a denied location' }]);
        expect(check(orders.field('id'), { op: 'merge', value: {} }, { ...base, mutations: [] }))
            .toMatchObject([{ kind: 'mutation' }]);
    });

    it('denies everything by default and grants the root pattern everything', () => {
        expect(check(query(), undefined, {})).toMatchObject([{ kind: 'read', location: '' }]);
        expect(check(orders, { op: 'remove' }, { read: [''], write: [''], mutations: ['remove'] })).toEqual([]);
        expect(check(query().field('a/b').field('~'), undefined, { read: ['/a~1b/~0'] })).toEqual([]);
    });

    it('normalizes and validates options', () => {
        expect(capability({ read: ['/a'], maxMatches: 5 }).options).toEqual({
            read: ['/a'], write: [], deny: [], judgments: [], mutations: [], maxMatches: 5,
        });
        expect(Object.isFrozen(capability({}).options)).toBe(true);
        expectError(() => capability(null as never), 'INVALID_CAPABILITY', '');
        expectError(() => capability({ read: '/a' } as never), 'INVALID_CAPABILITY', '/read');
        expectError(() => capability({ read: ['a'] }), 'INVALID_CAPABILITY', '/read/0');
        expectError(() => capability({ deny: ['/a~2'] }), 'INVALID_CAPABILITY', '/deny/0');
        expectError(() => capability({ write: [1 as never] }), 'INVALID_CAPABILITY', '/write/0');
        expectError(() => capability({ judgments: [' '] }), 'INVALID_CAPABILITY', '/judgments/0');
        expectError(() => capability({ mutations: ['move' as never] }), 'INVALID_CAPABILITY', '/mutations/0');
        expectError(() => capability({ maxOperations: -1 }), 'INVALID_CAPABILITY', '/maxOperations');
        expectError(() => capability({ extra: true } as never), 'INVALID_CAPABILITY', '/extra');
        expectError(() => capability(base).check({} as never), 'INVALID_PROGRAM', '');
    });
});
