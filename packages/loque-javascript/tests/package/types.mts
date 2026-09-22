import loque, {
    snapshot, query, fromIR, current, field, literal, eq, and, isIn,
    booleanDecision, choiceDecision, scoreDecision,
    type JsonValue, type JsonObject, type QueryIR, type Query, type Selection,
    type NodeRef, type Snapshot, type Mutation, type MutationPlan, type PatchOperation,
    type BooleanDecision, type ChoiceDecision, type ScoreDecision,
    type DecisionDefinition, type DecisionData, type DecisionResult, type ScoreDecisionResult,
    type DecisionProvenance, type DecisionProbability, type DecisionValue,
    judgment, runtime, ruleEvaluator, memoryCache, probability as chance, decision as judged, expected as mean, gte,
    type Judgment, type Runtime, type JudgedSelection, type Explanation, type Evaluator, type MemoryCache,
    type ExpressionIR, type DeterministicExpressionIR, type EvaluationStats, type JudgedDecision,
} from '@plurid/loque';

// Named interfaces need no index signature: input is validated at runtime.
interface Document { id: string; value: string }
const data: { records: Document[] } = { records: [{ id: '1', value: 'one' }] };
const state: Snapshot = snapshot(data);
const built: Query = query().field('records').each().where(and(
    eq(field('id'), literal('1')),
    isIn(field('value'), ['one', 'two']),
));
const ir: QueryIR = built.toIR();
const imported: Query = fromIR(JSON.parse(JSON.stringify(ir)));
const selection: Selection = state.select(imported);
const nodes: readonly NodeRef[] = selection.nodes();
const values: readonly JsonValue[] = selection.values();
const first: NodeRef | undefined = selection.first();
const mutation: Mutation = { op: 'merge', value: { reviewed: true } };
const plan: MutationPlan = selection.plan(mutation);
const operations: readonly PatchOperation[] = plan.operations;
const next: Snapshot = plan.apply();
const root: JsonValue = next.value;
const count: number = selection.count();
const paths: readonly string[] = selection.paths();
const scalar = loque.snapshot('value').select(loque.query().where(eq(current(), literal('value')))).first()?.value;
const narrowed: string | undefined = typeof scalar === 'string' ? scalar : undefined;
const provenance: DecisionProvenance = {
    evaluator: 'fixture', evaluatorVersion: '1', model: 'fixture-v1',
    judgment: 'review', judgmentVersion: '1', inputHash: 'fixture-input',
    timestamp: '2026-09-22T12:00:00.000Z',
};
const binary: BooleanDecision = booleanDecision();
const choice: ChoiceDecision<'refund' | 'other'> = choiceDecision(['refund', 'other']);
const scores: ScoreDecision<1 | 2> = scoreDecision([1, 2]);
const definition: DecisionDefinition<boolean> = binary;
const decisionData: DecisionData<'refund' | 'other'> = {
    distribution: [{ value: 'refund', probability: 0.75 }, { value: 'other', probability: 0.25 }],
    provenance,
};
const decision: DecisionResult<'refund' | 'other'> = choice.parse(decisionData);
const chosen: 'refund' | 'other' = decision.value;
const outcome: DecisionValue = chosen;
const probability: number = decision.probability('refund');
const entry: DecisionProbability<'refund' | 'other'> = decision.distribution[0];
const portable: DecisionData<'refund' | 'other'> = decision.toJSON();
const score: ScoreDecisionResult<1 | 2> = scores.parse({
    distribution: [{ value: 1, probability: 0.25 }, { value: 2, probability: 0.75 }], provenance,
});
const expected: number = score.expected;
const booleanResult: DecisionResult<boolean> = loque.booleanDecision().parse({
    distribution: [{ value: false, probability: 0.25 }, { value: true, probability: 0.75 }], provenance,
});

const intent: Judgment<'refund' | 'other'> = judgment({
    name: 'intent', version: '1', evaluator: 'rules', decision: choice,
    instructions: { question: 'What does the customer want?' },
    project: value => value,
});
const urgency: Judgment<1 | 2> = judgment({ name: 'urgency', version: '1', evaluator: 'rules', decision: scores });
const rules: Evaluator = ruleEvaluator({
    name: 'rules', version: '1', model: 'fixture', maxBatchSize: 10, now: () => new Date(0),
    decide: (_input, question) => question.outcomes.map((value, index) => ({ value, probability: index === 0 ? 1 : 0 })),
});
const cache: MemoryCache = memoryCache();
const rt: Runtime = runtime({ judgments: [intent, urgency], evaluators: [rules], cache });
const refund: ExpressionIR = chance(intent, 'refund');
const input: DeterministicExpressionIR = field('ticket');
const paged: Query = built.where(gte(refund, literal(0.9))).where(gte(mean(urgency, input), literal(1)))
    .where(eq(judged(intent), literal('refund'))).sort(field('id'), 'desc').skip(1).limit(2);
export async function runJudged(): Promise<void> {
    const selection: JudgedSelection = await rt.select(state, paged, { maxEvaluations: 10 });
    const used: readonly JudgedDecision[] = selection.decisions();
    const stats: EvaluationStats = selection.stats;
    const plan: MutationPlan = selection.plan({ op: 'remove' });
    const explanation: Explanation = await rt.explain(state, paged);
    void [used, stats, plan, explanation.exact, cache.size];
}

export function rejectInvalidUsage(): void {
    // @ts-expect-error Judgment outcomes are inferred from the definition.
    chance(intent, 'unknown');
    // @ts-expect-error Expected values need a numeric judgment.
    mean(intent);
    // @ts-expect-error Judgment inputs must be deterministic.
    chance(intent, 'refund', refund);
    // @ts-expect-error Sort keys must be deterministic.
    query().sort(refund);
    // @ts-expect-error Sort directions are asc or desc.
    query().sort(field('id'), 'up');
    // @ts-expect-error Runtime results are readonly.
    void (async () => { (await rt.select(state, paged)).stats.calls = 0; })();
    // @ts-expect-error JSON results need narrowing before object property access.
    void first!.value.id;
    // @ts-expect-error Results are not inferred as the input document type.
    const document: Document = values[0];
    // @ts-expect-error A traversal field is a literal string key.
    query().field(1);
    // @ts-expect-error Predicates cannot be JavaScript callbacks.
    query().where(() => true);
    // @ts-expect-error Literals cannot be undefined.
    literal(undefined);
    // @ts-expect-error Merge accepts only object payloads.
    selection.plan({ op: 'merge', value: [] });
    // @ts-expect-error Arbitrary JSON Patch is not a mutation intent.
    selection.plan({ op: 'move', from: '/a', path: '/b' });
    // @ts-expect-error Application uses the captured snapshot.
    plan.apply(data);
    // @ts-expect-error Node paths are readonly.
    nodes[0].path = '/different';
    // @ts-expect-error Result arrays are readonly.
    values.push(null);
    // @ts-expect-error JSON objects are readonly after narrowing.
    (root as JsonObject).changed = true;
    // @ts-expect-error IR steps are readonly.
    ir.steps.push({ op: 'each' });
    // @ts-expect-error The namespace rejects methods outside the public API.
    loque.extract('records.id:1', data);
    // @ts-expect-error Choice outcomes must be strings.
    choiceDecision([1, 2]);
    // @ts-expect-error Score outcomes must be numeric.
    scoreDecision(['low', 'high']);
    // @ts-expect-error Outcome inference rejects undeclared labels.
    decision.probability('unknown');
    // @ts-expect-error Numeric outcome inference rejects undeclared scores.
    score.probability(3);
    // @ts-expect-error Boolean outcomes are not string labels.
    booleanResult.probability('true');
    // @ts-expect-error Only score results have numeric expectations.
    void decision.expected;
    // @ts-expect-error Definitions own readonly outcome arrays.
    choice.outcomes.push('refund');
    // @ts-expect-error Distribution entries are readonly.
    decision.distribution[0].probability = 1;
    // @ts-expect-error Provenance is readonly.
    decision.provenance.model = 'changed';
    // @ts-expect-error Serialized data is also readonly.
    portable.distribution.push({ value: 'refund', probability: 1 });
    void document;
}

export {
    state, imported, nodes, values, first, operations, root, count, paths, narrowed,
    definition, outcome, probability, entry, portable, expected,
};
