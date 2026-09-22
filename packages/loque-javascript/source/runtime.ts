import { canonicalJson, sha256Hex } from './canonical';
import { LoqueError } from './errors';
import { freezeNodes, Pending, traverse, truth, type Judge, type Truth } from './evaluate';
import { judgmentExpressions, queryOf } from './ir';
import { isJudgment, nonblank } from './judgment';
import { programOf } from './program';
import { violations } from './capability';
import type {
    DecisionCache, DecisionResult, EvaluationGroup, EvaluationStats, Evaluator, ExplainStep, Explanation,
    JsonValue, JudgedDecision, JudgedSelection, Judgment, NodeRef, Program, ProgramReport, ProgramResult, Query,
    QueryIR, RunOptions, Runtime, RuntimeOptions, ScoreDecisionResult, SelectOptions, Snapshot,
} from './types';
import { selectionOf, snapshotValue } from './snapshot';

interface BoundEvaluator {
    readonly name: string;
    readonly version: string;
    readonly maxBatchSize: number;
    readonly evaluator: Evaluator;
}

/** One judgment of one projected input, shared by every node and expression that needs it. */
interface Entry {
    readonly key: string;
    readonly judgment: Judgment;
    readonly evaluator: BoundEvaluator;
    readonly input: JsonValue;
    readonly canonical: string;
    inputHash?: string;
    cacheKey?: string;
    result?: DecisionResult;
}

interface Round {
    readonly needed: number;
    readonly cached: number;
    readonly uncached: number;
    readonly calls: number;
}

const provenanceChecks = ['evaluator', 'evaluatorVersion', 'judgment', 'judgmentVersion', 'inputHash'] as const;

function invalid(message: string, path = ''): never {
    throw new LoqueError('INVALID_JUDGMENT', message, path);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
    const result: T[][] = [];
    for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
    return result;
}

function bindEvaluators(evaluators: readonly Evaluator[]): Map<string, BoundEvaluator> {
    if (!Array.isArray(evaluators)) invalid('Expected an array of evaluators', '/evaluators');
    const bound = new Map<string, BoundEvaluator>();
    evaluators.forEach((evaluator, position) => {
        const path = `/evaluators/${position}`;
        if (evaluator === null || typeof evaluator !== 'object' || typeof evaluator.evaluate !== 'function') {
            invalid('Expected an evaluator with an evaluate function', path);
        }
        const name = nonblank(evaluator.name, `${path}/name`);
        const version = nonblank(evaluator.version, `${path}/version`);
        const { maxBatchSize = Infinity } = evaluator;
        if (maxBatchSize !== Infinity && !(Number.isSafeInteger(maxBatchSize) && maxBatchSize > 0)) {
            invalid('Expected a positive safe integer', `${path}/maxBatchSize`);
        }
        if (bound.has(name)) invalid('Duplicate evaluator name', `${path}/name`);
        bound.set(name, { name, version, maxBatchSize, evaluator });
    });
    return bound;
}

function bindJudgments(judgments: readonly Judgment[], evaluators: Map<string, BoundEvaluator>): Map<string, Judgment> {
    if (!Array.isArray(judgments)) invalid('Expected an array of judgments', '/judgments');
    const bound = new Map<string, Judgment>();
    judgments.forEach((judgment, position) => {
        const path = `/judgments/${position}`;
        if (!isJudgment(judgment)) invalid('Expected a judgment created by judgment()', path);
        if (bound.has(judgment.name)) invalid('Duplicate judgment name', `${path}/name`);
        if (!evaluators.has(judgment.evaluator)) invalid('Unknown evaluator', `${path}/evaluator`);
        bound.set(judgment.name, judgment);
    });
    return bound;
}

/** Validate a query against the declared judgments before touching data or evaluators. */
function check(ir: QueryIR, judgments: Map<string, Judgment>): void {
    for (const { expression, path } of judgmentExpressions(ir)) {
        const judgment = judgments.get(expression.judgment);
        if (judgment === undefined) throw new LoqueError('INVALID_QUERY', 'Unknown judgment', `${path}/judgment`);
        if (expression.op === 'probability' && !judgment.decision.outcomes.includes(expression.outcome)) {
            throw new LoqueError('INVALID_QUERY', 'Outcome is not declared by the judgment', `${path}/outcome`);
        }
        if (expression.op === 'expected' && judgment.decision.kind !== 'score') {
            throw new LoqueError('INVALID_QUERY', 'Expected values require a score judgment', `${path}/op`);
        }
    }
}

/** Create an evaluation context binding judgment names to definitions and evaluators. */
export function runtime(options: RuntimeOptions): Runtime {
    if (options === null || typeof options !== 'object') invalid('Expected runtime options');
    const evaluators = bindEvaluators(options.evaluators);
    const judgments = bindJudgments(options.judgments, evaluators);
    const cache: DecisionCache | undefined = options.cache;
    if (cache !== undefined && (cache === null || typeof cache !== 'object'
        || typeof cache.get !== 'function' || typeof cache.set !== 'function')) {
        invalid('Expected a cache with get and set functions', '/cache');
    }

    async function execute(input: Snapshot, ir: QueryIR, options: SelectOptions, dry: boolean) {
        const root = snapshotValue(input);
        check(ir, judgments);
        const { maxEvaluations = Infinity, signal } = options;
        if (maxEvaluations !== Infinity && !(Number.isSafeInteger(maxEvaluations) && maxEvaluations >= 0)) {
            throw new LoqueError('INVALID_QUERY', 'Expected maxEvaluations to be a non-negative safe integer');
        }

        const entries = new Map<string, Entry>();
        const keys = new Map<string, WeakMap<object, string> | Map<JsonValue, string>>();
        const stats = { evaluations: 0, cacheHits: 0, calls: 0 };

        // Projection runs once per judgment and node value, even across passes.
        function keyFor(judgment: Judgment, value: JsonValue): string {
            const scope = `${judgment.name}:${value !== null && typeof value === 'object' ? 'object' : 'scalar'}`;
            let memo = keys.get(scope);
            if (memo === undefined) {
                memo = value !== null && typeof value === 'object' ? new WeakMap() : new Map();
                keys.set(scope, memo);
            }
            let key = (memo as Map<JsonValue, string>).get(value);
            if (key === undefined) {
                const projected = judgment.project(value);
                const canonical = canonicalJson(projected);
                key = `${judgment.name}\u0000${canonical}`;
                if (!entries.has(key)) {
                    entries.set(key, {
                        key, judgment, canonical, input: projected, evaluator: evaluators.get(judgment.evaluator)!,
                    });
                }
                (memo as Map<JsonValue, string>).set(value, key);
            }
            return key;
        }

        const judge: Judge = (expression, value) => {
            const entry = entries.get(keyFor(judgments.get(expression.judgment)!, value))!;
            if (entry.result === undefined) return new Pending(entry.key);
            switch (expression.op) {
                case 'probability': return entry.result.probability(expression.outcome);
                case 'decision': return entry.result.value;
                case 'expected': return (entry.result as ScoreDecisionResult).expected;
            }
        };

        function accept(entry: Entry, data: unknown, source: string, path: string): DecisionResult {
            let result: DecisionResult;
            try {
                result = entry.judgment.decision.parse(data);
            } catch (error) {
                if (!(error instanceof LoqueError)) throw error;
                throw new LoqueError(error.code, `Invalid decision from ${source}`, `${path}${error.path}`, { cause: error });
            }
            const expected = {
                evaluator: entry.evaluator.name, evaluatorVersion: entry.evaluator.version,
                judgment: entry.judgment.name, judgmentVersion: entry.judgment.version, inputHash: entry.inputHash,
            };
            for (const key of provenanceChecks) {
                if (result.provenance[key] !== expected[key]) {
                    throw new LoqueError('INVALID_DECISION', `Provenance from ${source} does not match the request`,
                        `${path}/provenance/${key}`);
                }
            }
            return result;
        }

        async function call(evaluator: BoundEvaluator, batch: readonly (readonly Entry[])[]): Promise<void> {
            const groups: EvaluationGroup[] = batch.map(members => Object.freeze({
                inputHash: members[0].inputHash!,
                input: members[0].input,
                questions: Object.freeze(members.map(({ judgment }) => Object.freeze({
                    judgment: judgment.name, judgmentVersion: judgment.version, kind: judgment.decision.kind,
                    outcomes: judgment.decision.outcomes, instructions: judgment.instructions,
                }))),
            }));
            stats.calls += 1;
            let output: unknown;
            try {
                output = await evaluator.evaluator.evaluate(Object.freeze(groups), Object.freeze({ signal }));
            } catch (error) {
                throw new LoqueError('EVALUATION_FAILED', `Evaluator ${evaluator.name} failed`, '', { cause: error });
            }
            if (!Array.isArray(output) || output.length !== batch.length) {
                throw new LoqueError('EVALUATION_FAILED', `Evaluator ${evaluator.name} must return one array per group`);
            }
            for (const [index, members] of batch.entries()) {
                const answers: unknown = output[index];
                if (!Array.isArray(answers) || answers.length !== members.length) {
                    throw new LoqueError('EVALUATION_FAILED',
                        `Evaluator ${evaluator.name} must return one result per question`, `/${index}`);
                }
                for (const [position, entry] of members.entries()) {
                    entry.result = accept(entry, answers[position], `evaluator ${evaluator.name}`, `/${index}/${position}`);
                    stats.evaluations += 1;
                    await cache?.set(entry.cacheKey!, entry.result.toJSON());
                }
            }
        }

        /** Fill pending entries from the cache, then (unless dry) from evaluators in batches. */
        async function resolve(pending: readonly Entry[]): Promise<Round> {
            await Promise.all(pending.map(async entry => {
                entry.inputHash = await sha256Hex(entry.canonical);
                entry.cacheKey = await sha256Hex(canonicalJson({
                    evaluator: entry.evaluator.name, evaluatorVersion: entry.evaluator.version,
                    judgment: entry.judgment.name, judgmentVersion: entry.judgment.version,
                    inputHash: entry.inputHash,
                }));
            }));
            const misses: Entry[] = [];
            for (const entry of pending) {
                const cached = cache === undefined ? undefined : await cache.get(entry.cacheKey!);
                if (cached === undefined) {
                    misses.push(entry);
                } else {
                    entry.result = accept(entry, cached, 'cache', '');
                    stats.cacheHits += 1;
                }
            }

            // Questions about the same projected state share a group.
            const plan = new Map<BoundEvaluator, Map<string, Entry[]>>();
            for (const entry of misses) {
                const groups = plan.get(entry.evaluator) ?? new Map<string, Entry[]>();
                const group = groups.get(entry.inputHash!) ?? [];
                group.push(entry);
                groups.set(entry.inputHash!, group);
                plan.set(entry.evaluator, groups);
            }
            const batches = [...plan].flatMap(([evaluator, groups]) => chunks([...groups.values()], evaluator.maxBatchSize)
                .map(batch => ({ evaluator, batch })));
            const round = { needed: pending.length, cached: pending.length - misses.length, uncached: misses.length, calls: batches.length };
            if (dry || misses.length === 0) return round;

            if (stats.evaluations + misses.length > maxEvaluations) {
                throw new LoqueError('BUDGET_EXCEEDED',
                    `Query needs ${stats.evaluations + misses.length} evaluations; the budget is ${maxEvaluations}`);
            }
            if (signal?.aborted) {
                throw new LoqueError('EVALUATION_FAILED', 'Evaluation was aborted', '', { cause: signal.reason });
            }
            await Promise.all(batches.map(({ evaluator, batch }) => call(evaluator, batch)));
            return round;
        }

        let nodes: readonly NodeRef[] = [{ path: '', value: root }];
        const decisions: JudgedDecision[] = [];
        const steps: ExplainStep[] = [];
        let exact = true;
        let evaluations = 0;
        let calls = 0;
        for (const step of ir.steps) {
            const count = nodes.length;
            if (step.op !== 'where') {
                nodes = traverse(nodes, step);
                steps.push(Object.freeze({ op: step.op, input: count, output: nodes.length }));
                continue;
            }
            let results: Truth[] = nodes.map(node => truth(step.predicate, node.value, judge));
            let round: Round | undefined;
            const undecided = results.flatMap((result, position) => typeof result === 'boolean'
                ? [] : [{ position, keys: [...new Set(result.map(item => item.key))] }]);
            if (undecided.length > 0) {
                const pending = [...new Set(undecided.flatMap(item => item.keys))].map(key => entries.get(key)!);
                round = await resolve(pending);
                evaluations += round.uncached;
                calls += round.calls;
                results = nodes.map(node => truth(step.predicate, node.value, judge));
                if (!dry) {
                    for (const { position, keys } of undecided) {
                        for (const key of keys) {
                            const entry = entries.get(key)!;
                            decisions.push(Object.freeze({
                                path: nodes[position].path, judgment: entry.judgment.name, decision: entry.result!,
                            }));
                        }
                    }
                }
            }
            // Undecided nodes remain only in a dry run; count them as passing.
            if (results.some(result => typeof result !== 'boolean')) exact = false;
            nodes = nodes.filter((_, position) => results[position] !== false);
            steps.push(Object.freeze({
                op: step.op, input: count, output: nodes.length,
                ...(round === undefined ? {} : { judgments: Object.freeze(round) }),
            }));
        }

        return { root, nodes: freezeNodes(nodes), decisions, stats, steps, exact, evaluations, calls };
    }

    async function select(input: Snapshot, ir: QueryIR, options: SelectOptions): Promise<JudgedSelection> {
        const result = await execute(input, ir, options, false);
        const decisions = Object.freeze(result.decisions);
        const stats: EvaluationStats = Object.freeze({ ...result.stats });
        return Object.freeze({ ...selectionOf(result.root, result.nodes), decisions: () => decisions, stats });
    }

    return Object.freeze({
        select: (input: Snapshot, query: Query, options: SelectOptions = {}) => select(input, queryOf(query), options),
        async run(input: Snapshot, program: Program, options: RunOptions = {}): Promise<ProgramResult> {
            const ir = programOf(program);
            const { capability, signal } = options;
            if (capability !== undefined) {
                const found = violations(capability, ir);
                if (found.length > 0) {
                    throw new LoqueError('CAPABILITY_DENIED',
                        `${found[0].message} (${found.length} violation${found.length === 1 ? '' : 's'})`, found[0].path);
                }
            }
            // The stricter of the program's own limits and the host's capability applies.
            const bound = (key: 'maxMatches' | 'maxEvaluations' | 'maxOperations') =>
                Math.min(ir.limits?.[key] ?? Infinity, capability?.options[key] ?? Infinity);
            const selection = await select(input, ir.query, { maxEvaluations: bound('maxEvaluations'), signal });
            if (selection.count() > bound('maxMatches')) {
                throw new LoqueError('LIMIT_EXCEEDED',
                    `Program matched ${selection.count()} nodes; the limit is ${bound('maxMatches')}`, '/query');
            }
            const plan = ir.mutation === undefined ? undefined : selection.plan(ir.mutation);
            if (plan !== undefined && plan.operations.length > bound('maxOperations')) {
                throw new LoqueError('LIMIT_EXCEEDED',
                    `Program planned ${plan.operations.length} operations; the limit is ${bound('maxOperations')}`, '/mutation');
            }
            const report: ProgramReport = Object.freeze({
                matchCount: selection.count(),
                paths: selection.paths(),
                ...(plan === undefined ? { values: selection.values() } : {}),
                operations: plan?.operations ?? Object.freeze([]),
                decisions: Object.freeze(selection.decisions().map(({ path, judgment, decision }) => Object.freeze({
                    path, judgment, value: decision.value, distribution: decision.distribution,
                }))),
                stats: selection.stats,
            });
            return Object.freeze({ selection, ...(plan === undefined ? {} : { plan }), report });
        },
        async explain(input: Snapshot, query: Query): Promise<Explanation> {
            const result = await execute(input, queryOf(query), {}, true);
            return Object.freeze({
                steps: Object.freeze(result.steps), matches: result.nodes.length, exact: result.exact,
                evaluations: result.evaluations, calls: result.calls,
            });
        },
    });
}
