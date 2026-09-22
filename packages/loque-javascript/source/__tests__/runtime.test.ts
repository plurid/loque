import { describe, expect, it, vi } from 'vitest';
import {
    and, booleanDecision, choiceDecision, decision, eq, exists, expected, field, gt, gte, isIn, judgment, literal, lt,
    capability, memoryCache, not, or, probability, program, programFromIR, query, ruleEvaluator, runtime, scoreDecision,
    snapshot,
    type EvaluationGroup, type Evaluator, type JsonObject, type JsonValue,
} from '../index';
import { expectError } from './helpers';

const now = () => new Date('2026-09-22T12:00:00.000Z');
const orders = query().field('orders').each();
const data = {
    orders: [
        { id: 'o-1', total: 1500, note: 'stolen card' },
        { id: 'o-2', total: 200, note: 'stolen card' },
        { id: 'o-3', total: 3000, note: 'fine' },
        { id: 'o-4', total: 2500, note: 'stolen card' },
    ],
};

function rules(options: { maxBatchSize?: number } = {}) {
    const evaluator = ruleEvaluator({
        name: 'rules', version: '1', model: 'keywords-v1', now, ...options,
        decide(input, question) {
            const text = JSON.stringify(input);
            if (question.kind === 'boolean') {
                const yes = text.includes('stolen') ? 0.97 : 0.1;
                return [{ value: false, probability: 1 - yes }, { value: true, probability: yes }];
            }
            if (question.kind === 'score') {
                return question.outcomes.map(value => ({ value, probability: value === 4 ? 1 : 0 }));
            }
            return question.outcomes.map((value, index) => ({ value, probability: index === 0 ? 1 : 0 }));
        },
    });
    const evaluate = vi.fn(evaluator.evaluate);
    return { evaluator: { ...evaluator, evaluate } as Evaluator, evaluate };
}

const fraud = judgment({
    name: 'fraud', version: '3', evaluator: 'rules', decision: booleanDecision(),
    instructions: { question: 'Does this order show evidence of fraud?' },
    project: order => ({ note: (order as JsonObject).note }),
});
const suspicious = and(gt(field('total'), literal(1000)), gte(probability(fraud, true), literal(0.95)));

function setup(options: { maxBatchSize?: number; cache?: ReturnType<typeof memoryCache> } = {}) {
    const { evaluator, evaluate } = rules(options);
    return { evaluate, rt: runtime({ judgments: [fraud], evaluators: [evaluator], cache: options.cache }) };
}

describe('judgment runtime', () => {
    it('filters deterministically first, deduplicates projections, and records decisions', async () => {
        const { rt, evaluate } = setup();
        const state = snapshot(data);
        const selection = await rt.select(state, orders.where(suspicious));
        expect(selection.paths()).toEqual(['/orders/0', '/orders/3']);
        // o-2 fails the total check; o-1 and o-4 share one projected state.
        expect(selection.stats).toEqual({ evaluations: 2, cacheHits: 0, calls: 1 });
        const groups = evaluate.mock.calls[0][0] as readonly EvaluationGroup[];
        expect(groups.map(group => group.input)).toEqual([{ note: 'stolen card' }, { note: 'fine' }]);
        expect(groups[0].inputHash).toMatch(/^[0-9a-f]{64}$/);
        expect(groups[0].questions).toEqual([{
            judgment: 'fraud', judgmentVersion: '3', kind: 'boolean', outcomes: [false, true],
            instructions: { question: 'Does this order show evidence of fraud?' },
        }]);
        expect(selection.decisions().map(item => [item.path, item.judgment, item.decision.probability(true)]))
            .toEqual([['/orders/0', 'fraud', 0.97], ['/orders/2', 'fraud', 0.1], ['/orders/3', 'fraud', 0.97]]);
        expect(selection.decisions()[0].decision.provenance).toMatchObject({
            evaluator: 'rules', model: 'keywords-v1', timestamp: '2026-09-22T12:00:00.000Z',
        });
        expect(Object.isFrozen(selection.decisions())).toBe(true);

        const plan = selection.plan({ op: 'merge', value: { review: true } });
        expect(plan.operations).toEqual([
            { op: 'add', path: '/orders/0/review', value: true },
            { op: 'add', path: '/orders/3/review', value: true },
        ]);
        expect(plan.apply().select(orders.where(eq(field('review'), literal(true))).field('id')).values())
            .toEqual(['o-1', 'o-4']);
    });

    it('makes no calls when deterministic predicates decide every node', async () => {
        const { rt, evaluate } = setup();
        const state = snapshot(data);
        const none = await rt.select(state, orders.where(and(lt(field('total'), literal(0)), suspicious)));
        const all = await rt.select(state, orders.where(or(gt(field('total'), literal(0)), suspicious)));
        const negated = await rt.select(state, orders.where(not(and(lt(field('total'), literal(0)), suspicious))));
        expect([none.count(), all.count(), negated.count()]).toEqual([0, 4, 4]);
        expect(evaluate).not.toHaveBeenCalled();
        expect(all.decisions()).toEqual([]);
    });

    it('evaluates later judgment steps only for earlier survivors', async () => {
        const { rt, evaluate } = setup();
        const query = orders.where(gte(probability(fraud, true), literal(0.95)))
            .where(lt(probability(fraud, false, literal({ note: 'new' })), literal(0.5)));
        const selection = await rt.select(snapshot(data), query);
        expect(selection.count()).toBe(0);
        expect(evaluate).toHaveBeenCalledTimes(2);
        expect(selection.stats.evaluations).toBe(3);
    });

    it('batches several judgments about one object into one group', async () => {
        const intent = judgment({
            name: 'intent', version: '1', evaluator: 'rules', decision: choiceDecision(['refund', 'other']),
        });
        const urgency = judgment({ name: 'urgency', version: '1', evaluator: 'rules', decision: scoreDecision([1, 4]) });
        const abuse = judgment({ name: 'abuse', version: '1', evaluator: 'rules', decision: booleanDecision() });
        const { evaluator, evaluate } = rules();
        const rt = runtime({ judgments: [intent, urgency, abuse], evaluators: [evaluator] });
        const tickets = snapshot([{ text: 'refund please' }]);
        const selection = await rt.select(tickets, query().each().where(and(
            gt(probability(intent, 'refund'), literal(0.8)),
            gte(expected(urgency), literal(4)),
            lt(probability(abuse, true), literal(0.2)),
            eq(decision(intent), literal('refund')),
            isIn(decision(urgency), [4]),
        )));
        expect(selection.count()).toBe(1);
        expect(evaluate).toHaveBeenCalledTimes(1);
        const groups = evaluate.mock.calls[0][0];
        expect(groups).toHaveLength(1);
        expect(groups[0].questions.map(question => question.judgment)).toEqual(['intent', 'urgency', 'abuse']);
        expect(selection.decisions().map(item => item.judgment)).toEqual(['intent', 'urgency', 'abuse']);
    });

    it('splits groups by maxBatchSize and calls concurrently', async () => {
        const { rt, evaluate } = setup({ maxBatchSize: 1 });
        const selection = await rt.select(snapshot(data), orders.where(suspicious));
        expect(selection.stats.calls).toBe(2);
        expect(evaluate.mock.calls.map(call => call[0].length)).toEqual([1, 1]);
    });

    it('reuses cached decisions across queries and explains the remaining work', async () => {
        const cache = memoryCache();
        const { rt, evaluate } = setup({ cache });
        const state = snapshot(data);
        const before = await rt.explain(state, orders.where(suspicious));
        expect(before).toEqual({
            steps: [
                { op: 'field', input: 1, output: 1 },
                { op: 'each', input: 1, output: 4 },
                { op: 'where', input: 4, output: 3, judgments: { needed: 2, cached: 0, uncached: 2, calls: 1 } },
            ],
            matches: 3, exact: false, evaluations: 2, calls: 1,
        });
        expect(evaluate).not.toHaveBeenCalled();

        await rt.select(state, orders.where(suspicious));
        expect(cache.size).toBe(2);
        const again = await rt.select(state, orders.where(suspicious));
        expect(again.stats).toEqual({ evaluations: 0, cacheHits: 2, calls: 0 });
        expect(again.paths()).toEqual(['/orders/0', '/orders/3']);
        expect(evaluate).toHaveBeenCalledTimes(1);
        const after = await rt.explain(state, orders.where(suspicious));
        expect(after).toMatchObject({ matches: 2, exact: true, evaluations: 0, calls: 0 });

        cache.clear();
        expect(cache.size).toBe(0);
    });

    it('enforces budgets before calling evaluators', async () => {
        const { rt, evaluate } = setup();
        const state = snapshot(data);
        await expect(rt.select(state, orders.where(suspicious), { maxEvaluations: 1 }))
            .rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
        expect(evaluate).not.toHaveBeenCalled();
        expect((await rt.select(state, orders.where(suspicious), { maxEvaluations: 2 })).count()).toBe(2);
        await expect(rt.select(state, orders, { maxEvaluations: -1 })).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    });

    it('does not evaluate judgments of missing inputs, or to prove existence', async () => {
        const { rt, evaluate } = setup();
        const state = snapshot(data);
        const missing = await rt.select(state, orders.where(gte(probability(fraud, true, field('absent')), literal(0))));
        const present = await rt.select(state, orders.where(exists(decision(fraud))));
        expect([missing.count(), present.count()]).toEqual([0, 4]);
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('validates judgments used by a query before evaluating', async () => {
        const { rt, evaluate } = setup();
        const state = snapshot(data);
        const where = (predicate: Parameters<typeof orders.where>[0]) => rt.select(state, orders.where(predicate));
        await expect(where(eq(decision('unknown'), literal(true))))
            .rejects.toMatchObject({ code: 'INVALID_QUERY', path: '/steps/2/predicate/left/judgment' });
        await expect(where(gt(probability('fraud', 'yes'), literal(0))))
            .rejects.toMatchObject({ code: 'INVALID_QUERY', path: '/steps/2/predicate/left/outcome' });
        await expect(where(gt(literal(0), expected('fraud'))))
            .rejects.toMatchObject({ code: 'INVALID_QUERY', path: '/steps/2/predicate/right/op' });
        expect(evaluate).not.toHaveBeenCalled();
        expectError(() => state.select(orders.where(suspicious)), 'INVALID_QUERY', '/steps/2/predicate/predicates/1/left');
        await expect(rt.select({ value: data, select: state.select }, orders)).rejects.toMatchObject({ code: 'INVALID_JSON' });
    });

    it('rejects evaluator results that do not answer the request', async () => {
        const state = snapshot(data);
        const run = (evaluate: Evaluator['evaluate'], signal?: AbortSignal) => runtime({
            judgments: [fraud], evaluators: [{ name: 'rules', version: '1', evaluate }],
        }).select(state, orders.where(suspicious), { signal });
        const answer = (group: EvaluationGroup, changes: Record<string, JsonValue> = {}) => ({
            distribution: [{ value: false, probability: 0.5 }, { value: true, probability: 0.5 }],
            provenance: {
                evaluator: 'rules', evaluatorVersion: '1', model: 'm', judgment: 'fraud', judgmentVersion: '3',
                inputHash: group.inputHash, timestamp: '2026-09-22T12:00:00.000Z', ...changes,
            },
        });

        expect((await run(groups => groups.map(group => [answer(group)]))).count()).toBe(0);
        await expect(run(groups => groups.map(group => [answer(group, { inputHash: 'forged' })])))
            .rejects.toMatchObject({ code: 'INVALID_DECISION', path: '/0/0/provenance/inputHash' });
        await expect(run(groups => groups.map(group => [answer(group, { judgmentVersion: '2' })])))
            .rejects.toMatchObject({ code: 'INVALID_DECISION', path: '/0/0/provenance/judgmentVersion' });
        await expect(run(groups => groups.map(() => [{ distribution: [], provenance: {} }])))
            .rejects.toMatchObject({ code: 'INVALID_DECISION', path: '/0/0/distribution' });
        await expect(run(() => [])).rejects.toMatchObject({ code: 'EVALUATION_FAILED', path: '' });
        await expect(run(groups => groups.map(() => []))).rejects.toMatchObject({ code: 'EVALUATION_FAILED', path: '/0' });
        await expect(run(() => null as never)).rejects.toMatchObject({ code: 'EVALUATION_FAILED' });

        const failure = new Error('offline');
        await expect(run(async () => { throw failure; })).rejects.toMatchObject({ code: 'EVALUATION_FAILED', cause: failure });

        const controller = new AbortController();
        controller.abort('stop');
        const evaluate = vi.fn(() => []);
        await expect(run(evaluate, controller.signal)).rejects.toMatchObject({ code: 'EVALUATION_FAILED', cause: 'stop' });
        expect(evaluate).not.toHaveBeenCalled();

        const later = new AbortController();
        const pending = run((_, { signal }) => new Promise((_resolve, reject) => {
            signal!.addEventListener('abort', () => reject(signal!.reason));
        }), later.signal);
        later.abort('late');
        await expect(pending).rejects.toMatchObject({ code: 'EVALUATION_FAILED', cause: 'late' });
    });

    it('validates cached data like evaluator output', async () => {
        const cache = { get: () => ({ distribution: 'bad' }), set: vi.fn() };
        const { evaluator } = rules();
        const rt = runtime({ judgments: [fraud], evaluators: [evaluator], cache });
        await expect(rt.select(snapshot(data), orders.where(suspicious)))
            .rejects.toMatchObject({ code: 'INVALID_DECISION' });
        const rtAsync = runtime({
            judgments: [fraud], evaluators: [evaluator],
            cache: { get: async () => undefined, set: async () => undefined },
        });
        expect((await rtAsync.select(snapshot(data), orders.where(suspicious))).count()).toBe(2);
    });

    it('validates judgment definitions, evaluators, and runtime options', async () => {
        const { evaluator } = rules();
        const base = { name: 'j', version: '1', evaluator: 'rules', decision: booleanDecision() };
        expectError(() => judgment(null as never), 'INVALID_JUDGMENT', '');
        expectError(() => judgment({ ...base, name: ' ' }), 'INVALID_JUDGMENT', '/name');
        expectError(() => judgment({ ...base, decision: { kind: 'boolean', outcomes: [false, true], parse: () => ({}) } as never }),
            'INVALID_JUDGMENT', '/decision');
        expectError(() => judgment({ ...base, project: 1 as never }), 'INVALID_JUDGMENT', '/project');
        expectError(() => judgment({ ...base, instructions: { at: new Date() } }), 'INVALID_JUDGMENT', '/instructions/at');
        expect(judgment(base).instructions).toBeNull();

        expectError(() => ruleEvaluator(null as never), 'INVALID_JUDGMENT', '');
        expectError(() => ruleEvaluator({ name: 'r', version: '1', model: 'm', decide: 1 as never }), 'INVALID_JUDGMENT', '/decide');
        expectError(() => ruleEvaluator({ name: 'r', version: '1', model: '', decide: () => [] }), 'INVALID_JUDGMENT', '/model');

        const valid = { judgments: [judgment(base)], evaluators: [evaluator] };
        expectError(() => runtime(null as never), 'INVALID_JUDGMENT', '');
        expectError(() => runtime({ ...valid, judgments: {} as never }), 'INVALID_JUDGMENT', '/judgments');
        expectError(() => runtime({ ...valid, evaluators: {} as never }), 'INVALID_JUDGMENT', '/evaluators');
        expectError(() => runtime({ ...valid, evaluators: [null as never] }), 'INVALID_JUDGMENT', '/evaluators/0');
        expectError(() => runtime({ ...valid, evaluators: [evaluator, evaluator] }), 'INVALID_JUDGMENT', '/evaluators/1/name');
        expectError(() => runtime({ ...valid, evaluators: [{ ...evaluator, version: 1 as never }] }),
            'INVALID_JUDGMENT', '/evaluators/0/version');
        for (const maxBatchSize of [0, 1.5, -1]) {
            expectError(() => runtime({ ...valid, evaluators: [{ ...evaluator, maxBatchSize }] }),
                'INVALID_JUDGMENT', '/evaluators/0/maxBatchSize');
        }
        expectError(() => runtime({ ...valid, judgments: [base as never] }), 'INVALID_JUDGMENT', '/judgments/0');
        expectError(() => runtime({ ...valid, judgments: [judgment(base), judgment(base)] }), 'INVALID_JUDGMENT', '/judgments/1/name');
        expectError(() => runtime({ ...valid, judgments: [judgment({ ...base, evaluator: 'other' })] }),
            'INVALID_JUDGMENT', '/judgments/0/evaluator');
        expectError(() => runtime({ ...valid, cache: { get: () => undefined } as never }), 'INVALID_JUDGMENT', '/cache');

        const projected = judgment({ ...base, project: () => ({ bad: undefined }) });
        await expect(runtime({ ...valid, judgments: [projected] })
            .select(snapshot([1]), query().each().where(eq(decision(projected), literal(true)))))
            .rejects.toMatchObject({ code: 'INVALID_JUDGMENT', path: '/bad' });
    });

    it('projects each node once and supports scalar inputs', async () => {
        const project = vi.fn((value: JsonValue) => value);
        const flag = judgment({ name: 'flag', version: '1', evaluator: 'rules', decision: booleanDecision(), project });
        const { evaluator, evaluate } = rules();
        const rt = runtime({ judgments: [flag], evaluators: [evaluator] });
        const selection = await rt.select(snapshot(['stolen', 'fine', 'stolen']), query().each().where(or(
            gt(probability(flag, true), literal(0.9)),
            eq(decision(flag), literal(true)),
        )));
        expect(selection.values()).toEqual(['stolen', 'stolen']);
        expect(project).toHaveBeenCalledTimes(2);
        expect(evaluate.mock.calls[0][0]).toHaveLength(2);
    });

    describe('programs', () => {
        const guard = capability({
            read: ['/orders/*/id', '/orders/*/total'], write: ['/orders/*/review'], deny: ['/orders/*/note'],
            judgments: ['fraud'], mutations: ['merge'], maxMatches: 3,
        });
        const review = program({ query: orders.where(suspicious), mutation: { op: 'merge', value: { review: true } } });

        it('plans a checked mutation and reports JSON for the agent', async () => {
            const { rt, evaluate } = setup();
            const state = snapshot(data);
            const result = await rt.run(state, programFromIR(JSON.parse(JSON.stringify(review.toIR()))), { capability: guard });
            expect(result.report).toEqual({
                matchCount: 2,
                paths: ['/orders/0', '/orders/3'],
                operations: [
                    { op: 'add', path: '/orders/0/review', value: true },
                    { op: 'add', path: '/orders/3/review', value: true },
                ],
                decisions: [
                    { path: '/orders/0', judgment: 'fraud', value: true, distribution: [
                        { value: false, probability: expect.closeTo(0.03) }, { value: true, probability: 0.97 }] },
                    { path: '/orders/2', judgment: 'fraud', value: false, distribution: [
                        { value: false, probability: 0.9 }, { value: true, probability: 0.1 }] },
                    { path: '/orders/3', judgment: 'fraud', value: true, distribution: [
                        { value: false, probability: expect.closeTo(0.03) }, { value: true, probability: 0.97 }] },
                ],
                stats: { evaluations: 2, cacheHits: 0, calls: 1 },
            });
            expect(JSON.parse(JSON.stringify(result.report))).toEqual(JSON.parse(JSON.stringify(result.report)));
            expect(Object.isFrozen(result.report)).toBe(true);
            expect(result.selection.count()).toBe(2);
            expect(result.plan!.apply().select(orders.field('review')).values()).toEqual([true, true]);
            expect(evaluate).toHaveBeenCalledTimes(1);
        });

        it('returns values only for read programs', async () => {
            const { rt } = setup();
            const ids = program({ query: orders.where(gt(field('total'), literal(2000))).field('id') });
            const result = await rt.run(snapshot(data), ids, { capability: guard });
            expect(result.plan).toBeUndefined();
            expect(result.report).toMatchObject({ matchCount: 2, values: ['o-3', 'o-4'], operations: [] });
        });

        it('rejects capability violations before touching data or evaluators', async () => {
            const { rt, evaluate } = setup();
            const leak = program({ query: orders.where(gte(probability(fraud, true), literal(0.5))).field('note') });
            await expect(rt.run(snapshot(data), leak, { capability: guard })).rejects.toMatchObject({
                code: 'CAPABILITY_DENIED', path: '/query', message: expect.stringContaining('(1 violation)'),
            });
            const worse = program({ query: orders.field('note'), mutation: { op: 'remove' } });
            await expect(rt.run(snapshot(data), worse, { capability: guard })).rejects.toMatchObject({
                code: 'CAPABILITY_DENIED', path: '/mutation/op', message: expect.stringContaining('(2 violations)'),
            });
            expect(evaluate).not.toHaveBeenCalled();
            await expect(rt.run(snapshot(data), review, { capability: {} as never }))
                .rejects.toMatchObject({ code: 'INVALID_CAPABILITY' });
            await expect(rt.run(snapshot(data), {} as never)).rejects.toMatchObject({ code: 'INVALID_PROGRAM' });
        });

        it('applies the stricter of program and capability limits', async () => {
            const { rt, evaluate } = setup();
            const state = snapshot(data);
            const all = program({ query: orders.field('id') });
            await expect(rt.run(state, all, { capability: guard }))
                .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED', path: '/query' });
            expect((await rt.run(state, all)).report.matchCount).toBe(4);
            const limited = program({ query: orders.where(suspicious), limits: { maxEvaluations: 1 } });
            await expect(rt.run(state, limited)).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
            const strict = capability({ read: [''], judgments: ['fraud'], maxEvaluations: 1 });
            await expect(rt.run(state, program({ query: orders.where(suspicious), limits: { maxEvaluations: 9 } }),
                { capability: strict })).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
            expect(evaluate).not.toHaveBeenCalled();
            const merge = program({
                query: orders.where(suspicious), mutation: { op: 'merge', value: { review: true, queue: 'risk' } },
                limits: { maxOperations: 3 },
            });
            await expect(rt.run(state, merge)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED', path: '/mutation' });
        });
    });
});
