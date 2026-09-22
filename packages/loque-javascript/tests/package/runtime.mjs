import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '@plurid/loque';

const require = createRequire(import.meta.url);
const commonjs = require('@plurid/loque');
const provenance = {
    evaluator: 'fixture', evaluatorVersion: '1', model: 'fixture-v1',
    judgment: 'review', judgmentVersion: '1', inputHash: 'fixture-input',
    timestamp: '2026-09-22T12:00:00.000Z',
};

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

    const review = loque.booleanDecision().parse({
        distribution: [{ value: false, probability: 0.25 }, { value: true, probability: 0.75 }],
        provenance,
    });
    assert.equal(review.value, true);
    assert.equal(review.probability(true), 0.75);
    assert.ok(Object.isFrozen(review.distribution[0]));
    assert.ok(Object.isFrozen(review.provenance));
    const choice = loque.choiceDecision(['refund', 'other']);
    const decision = choice.parse({
        distribution: [{ value: 'other', probability: 0.25 }, { value: 'refund', probability: 0.75 }],
        provenance,
    });
    assert.equal(decision.value, 'refund');
    assert.deepEqual(choice.parse(JSON.parse(JSON.stringify(decision))).toJSON(), decision.toJSON());
    assert.deepEqual(loque.snapshot(decision.toJSON()).value, decision.toJSON());
    const score = loque.scoreDecision([1, 2]).parse({
        distribution: [{ value: 1, probability: 0.25 }, { value: 2, probability: 0.75 }],
        provenance,
    });
    assert.equal(score.value, 2);
    assert.equal(score.expected, 1.75);
    assert.throws(() => review.probability('true'),
        error => error instanceof api.LoqueError && error.code === 'INVALID_DECISION');

    const fraud = loque.judgment({
        name: 'fraud', version: '1', evaluator: 'rules', decision: loque.booleanDecision(),
        project: order => ({ note: order.note }),
    });
    const rules = loque.ruleEvaluator({
        name: 'rules', version: '1', model: 'keywords',
        decide: input => {
            const yes = input.note.includes('stolen') ? 0.97 : 0.1;
            return [{ value: false, probability: 1 - yes }, { value: true, probability: yes }];
        },
    });
    const cache = loque.memoryCache();
    const rt = loque.runtime({ judgments: [fraud], evaluators: [rules], cache });
    const orders = loque.snapshot({ orders: [
        { id: 'a', total: 1500, note: 'stolen card' },
        { id: 'b', total: 50, note: 'stolen card' },
        { id: 'c', total: 2000, note: 'fine' },
    ] });
    const suspicious = loque.fromIR(JSON.parse(JSON.stringify(loque.query().field('orders').each().where(loque.and(
        loque.gt(loque.field('total'), loque.literal(1000)),
        loque.gte(loque.probability('fraud', true), loque.literal(0.95)),
    )).sort(loque.field('total'), 'desc').limit(10).toIR())));
    const judged = await rt.select(orders, suspicious);
    assert.deepEqual(judged.paths(), ['/orders/0']);
    assert.deepEqual(judged.stats, { evaluations: 2, cacheHits: 0, calls: 1 });
    assert.equal(judged.decisions()[0].decision.probability(true), 0.97);
    assert.deepEqual(judged.plan({ op: 'merge', value: { review: true } }).operations,
        [{ op: 'add', path: '/orders/0/review', value: true }]);
    assert.deepEqual((await rt.explain(orders, suspicious)).exact, true);
    assert.deepEqual((await rt.select(orders, suspicious)).stats, { evaluations: 0, cacheHits: 2, calls: 0 });
    assert.throws(() => orders.select(suspicious), error => error instanceof api.LoqueError && error.code === 'INVALID_QUERY');
    await assert.rejects(rt.select(loque.snapshot({ orders: [{ total: 5000, note: 'new' }] }), suspicious, { maxEvaluations: 0 }),
        error => error instanceof api.LoqueError && error.code === 'BUDGET_EXCEEDED');
    console.log(`${format}: snapshots, queries, plans, decisions, and the judgment runtime passed`);
}

// Serialized builders also interoperate across the separately bundled formats.
assert.deepEqual(commonjs.snapshot([1]).select(esm.query().each()).values(), [1]);
assert.equal(require('@plurid/loque/package.json').name, '@plurid/loque');
