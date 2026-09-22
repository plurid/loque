import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '@plurid/loque';

const require = createRequire(import.meta.url);
const commonjs = require('@plurid/loque');

for (const [format, api] of [['ESM', esm], ['CommonJS', commonjs]]) {
    const loque = api.default;
    const records = [
        Object.freeze({ id: '1', value: 'one' }),
        Object.freeze({ id: '2', value: 'two' }),
    ];
    const data = Object.freeze({ records: Object.freeze(records) });
    const statements = loque.locate('records.id:1');

    assert.ok(statements[0] instanceof api.LocatorCollectionStatement);
    assert.ok(statements[1] instanceof api.LocatorDocumentStatement);
    assert.deepEqual(loque.extract(statements, data), {
        data: records[0], empty: false, cursor: 0,
    });
    assert.deepEqual(loque.extract('records.id:1 & id:2', data), {
        data: records, empty: false, cursor: 1,
    });
    assert.deepEqual(loque.extract('records.id:missing', data), {
        data: [], empty: true, cursor: undefined,
    });

    const updated = loque.update(statements, data, { value: 'updated' });
    assert.equal(updated.records[0].value, 'updated');
    assert.deepEqual(updated.records[1], records[1]);
    assert.equal(data.records[0].value, 'one');
    assert.notEqual(updated, data);
    assert.notEqual(updated.records, data.records);

    assert.deepEqual(new api.Locator().parse('records.id:1'), statements);
    assert.deepEqual(new api.Extractor(statements, data).extract().data, records[0]);
    assert.deepEqual(new api.Updater(statements, data, { value: 'updated' }).result(), updated);
    console.log(`${format}: public API and immutable update checks passed`);
}

assert.equal(require('@plurid/loque/package.json').name, '@plurid/loque');
