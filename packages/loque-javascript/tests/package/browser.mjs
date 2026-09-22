import loque from '@plurid/loque';

const state = loque.snapshot({ records: [{ id: '1', value: 'one' }] });
const query = loque.query().field('records').each()
    .where(loque.eq(loque.field('id'), loque.literal('1')));
const selection = state.select(loque.fromIR(JSON.parse(JSON.stringify(query.toIR()))));
export const selected = selection.first().value;
export const updated = selection.plan({ op: 'merge', value: { reviewed: true } }).apply().value;

const score = loque.scoreDecision([1, 2]).parse({
    distribution: [{ value: 1, probability: 0.25 }, { value: 2, probability: 0.75 }],
    provenance: {
        evaluator: 'fixture', evaluatorVersion: '1', model: 'fixture-v1',
        judgment: 'review', judgmentVersion: '1', inputHash: 'fixture-input',
        timestamp: '2026-09-22T12:00:00.000Z',
    },
});
export const expectedScore = score.expected;
