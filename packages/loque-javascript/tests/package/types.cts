import api = require('@plurid/loque');

const data = { records: [{ id: '1', value: 'one' }] };
const statements: api.LocatorStatements = api.default.locate('records.id:1');
const result: api.ExtractedLoque<{ id: string; value: string }> = api.default.extract(statements, data);
const id: string = result.data.id;
const updated: typeof data = new api.Updater(statements, data, { value: 'updated' }).result();

// @ts-expect-error The CommonJS declarations preserve the selected data type.
const invalidId: number = result.data.id;

export { id, updated, invalidId };
