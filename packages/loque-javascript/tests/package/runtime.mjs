import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '@plurid/loque';

const require = createRequire(import.meta.url);
const commonjs = require('@plurid/loque');

for (const [format, api] of [['ESM', esm], ['CommonJS', commonjs]]) {
    const loque = api.default;
    for (const [name, value] of Object.entries(loque)) assert.equal(value, api[name]);
    for (const name of ['locate', 'extract', 'update', 'Locator', 'Extractor', 'Updater']) {
        assert.equal(Object.hasOwn(api, name), false);
        assert.equal(Object.hasOwn(loque, name), false);
    }
    const data = { records: [
        { id: '1', value: 'one', children: [1, 2, 3] },
        { id: '2', value: 'two', children: [4] },
    ] };
    const state = loque.snapshot(data);
    const records = loque.query().field('records').each();
    const selectedQuery = records.where(loque.eq(loque.field('id'), loque.literal('1')));
    const restored = loque.fromIR(JSON.parse(JSON.stringify(selectedQuery.toIR())));
    const selection = state.select(restored);
    assert.deepEqual(selection.values(), [data.records[0]]);
    assert.deepEqual(selection.paths(), ['/records/0']);
    assert.deepEqual(selection.first(), { path: '/records/0', value: data.records[0] });
    assert.equal(selection.count(), 1);
    assert.deepEqual(state.select(selectedQuery.field('children').index(1)).values(), [2]);
    assert.deepEqual(state.select(records.field('missing')).values(), []);
    assert.equal(state.select(records.field('missing')).first(), undefined);

    const plan = selection.plan({ op: 'merge', value: { reviewed: true, value: 'updated' } });
    assert.deepEqual(plan.operations, [
        { op: 'add', path: '/records/0/reviewed', value: true },
        { op: 'replace', path: '/records/0/value', value: 'updated' },
    ]);
    assert.equal(plan.matchCount, 1);
    const updated = plan.apply();
    assert.equal(updated.value.records[0].value, 'updated');
    assert.equal(state.value.records[0].value, 'one');
    data.records[0].value = 'caller changed';
    assert.equal(selection.first().value.value, 'one');
    assert.deepEqual(plan.apply().value, updated.value);
    assert.ok(Object.isFrozen(updated.value.records[0]));
    assert.ok(Object.isFrozen(plan.operations));

    const removal = state.select(selectedQuery.field('children').each()
        .where(loque.isIn(loque.current(), [1, 3]))).plan({ op: 'remove' });
    assert.deepEqual(removal.operations, [
        { op: 'remove', path: '/records/0/children/2' },
        { op: 'remove', path: '/records/0/children/0' },
    ]);
    assert.deepEqual(removal.apply().value.records[0].children, [2]);
    assert.equal(state.select(loque.query()).plan({ op: 'replace', value: null }).apply().value, null);
    assert.throws(() => state.select(loque.query()).plan({ op: 'remove' }),
        error => error instanceof api.LoqueError && error.code === 'INVALID_MUTATION');
    assert.throws(() => loque.snapshot({ bad: undefined }),
        error => error instanceof api.LoqueError && error.path === '/bad');
    console.log(`${format}: snapshots, portable queries, selections, and immutable plans passed`);
}

// Serialized builders also interoperate across the separately bundled formats.
assert.deepEqual(commonjs.snapshot([1]).select(esm.query().each()).values(), [1]);
assert.equal(require('@plurid/loque/package.json').name, '@plurid/loque');
