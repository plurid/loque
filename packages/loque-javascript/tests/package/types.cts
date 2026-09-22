import api = require('@plurid/loque');

const state: api.Snapshot = api.default.snapshot({ records: [{ id: '1', value: 'one' }] });
const query: api.Query = api.query().field('records').each().where(api.eq(api.field('id'), api.literal('1')));
const selection: api.Selection = state.select(api.fromIR(query.toIR()));
const values: readonly api.JsonValue[] = selection.values();
const plan: api.MutationPlan = selection.plan({ op: 'merge', value: { reviewed: true } });
const next: api.Snapshot = plan.apply();
const definition: api.ScoreDecision<1 | 2> = api.default.scoreDecision([1, 2]);
const result: api.ScoreDecisionResult<1 | 2> = definition.parse({
    distribution: [{ value: 1, probability: 0.25 }, { value: 2, probability: 0.75 }],
    provenance: {
        evaluator: 'fixture', evaluatorVersion: '1', model: 'fixture-v1',
        judgment: 'review', judgmentVersion: '1', inputHash: 'fixture-input',
        timestamp: '2026-09-22T12:00:00.000Z',
    },
});
const expected: number = result.expected;
const portable: api.DecisionData<1 | 2> = result.toJSON();

export function rejectInvalidUsage(): void {
    // @ts-expect-error The CommonJS declarations require result narrowing.
    void values[0].id;
    // @ts-expect-error The CommonJS declarations keep plans readonly.
    plan.operations.push({ op: 'remove', path: '' });
    // @ts-expect-error Snapshots are immutable.
    next.value = null;
    // @ts-expect-error CommonJS declarations preserve inferred score outcomes.
    result.probability(3);
    // @ts-expect-error Decision results are readonly.
    result.expected = 0;
}

export { values, next, expected, portable };
