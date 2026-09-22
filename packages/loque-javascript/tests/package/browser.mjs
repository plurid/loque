import loque from '@plurid/loque';

const state = loque.snapshot({ records: [{ id: '1', value: 'one' }] });
const query = loque.query().field('records').each()
    .where(loque.eq(loque.field('id'), loque.literal('1')));
const selection = state.select(loque.fromIR(JSON.parse(JSON.stringify(query.toIR()))));
export const selected = selection.first().value;
export const updated = selection.plan({ op: 'merge', value: { reviewed: true } }).apply().value;
