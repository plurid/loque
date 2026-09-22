import api = require('@plurid/loque');

const state: api.Snapshot = api.default.snapshot({ records: [{ id: '1', value: 'one' }] });
const query: api.Query = api.query().field('records').each().where(api.eq(api.field('id'), api.literal('1')));
const selection: api.Selection = state.select(api.fromIR(query.toIR()));
const values: readonly api.JsonValue[] = selection.values();
const plan: api.MutationPlan = selection.plan({ op: 'merge', value: { reviewed: true } });
const next: api.Snapshot = plan.apply();

export function rejectInvalidUsage(): void {
    // @ts-expect-error The CommonJS declarations require result narrowing.
    void values[0].id;
    // @ts-expect-error The CommonJS declarations keep plans readonly.
    plan.operations.push({ op: 'remove', path: '' });
    // @ts-expect-error Snapshots are immutable.
    next.value = null;
}

export { values, next };
