import { snapshot, query, field, literal, eq } from '../../source';

const data = {
    records: [
        { id: '1', children: [{ id: '1-1', value: 'nested' }] },
        { id: '2', children: [] },
    ],
};
const state = snapshot(data);
const selected = state.select(query().field('records').each()
    .where(eq(field('id'), literal('1'))).field('children').each());
const plan = selected.plan({ op: 'merge', value: { reviewed: true } });

export const values = selected.values();
export const operations = plan.operations;
export const updated = plan.apply().value;
