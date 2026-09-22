/** JSON trees are readonly at every public boundary. */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
export type JsonArray = readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonPointer = string;
export type PathSegment = string | number;

/** Expressions computed from the current node alone, without evaluators. */
export type DeterministicExpressionIR =
    | { readonly op: 'current' }
    | { readonly op: 'field'; readonly path: readonly PathSegment[] }
    | { readonly op: 'literal'; readonly value: JsonValue };

/** Values read from a named judgment of a deterministic input. */
export type JudgmentExpressionIR =
    | {
        readonly op: 'probability'; readonly judgment: string;
        readonly input: DeterministicExpressionIR; readonly outcome: DecisionValue;
    }
    | { readonly op: 'decision' | 'expected'; readonly judgment: string; readonly input: DeterministicExpressionIR };

export type ExpressionIR = DeterministicExpressionIR | JudgmentExpressionIR;

export type ComparisonOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
export type PredicateIR =
    | { readonly op: ComparisonOperator; readonly left: ExpressionIR; readonly right: ExpressionIR }
    | { readonly op: 'in'; readonly value: ExpressionIR; readonly values: JsonArray }
    | { readonly op: 'exists'; readonly value: ExpressionIR }
    | { readonly op: 'and' | 'or'; readonly predicates: readonly PredicateIR[] }
    | { readonly op: 'not'; readonly predicate: PredicateIR };

export type QueryStepIR =
    | { readonly op: 'field'; readonly key: string }
    | { readonly op: 'index'; readonly index: number }
    | { readonly op: 'each' }
    | { readonly op: 'where'; readonly predicate: PredicateIR }
    | { readonly op: 'sort'; readonly by: DeterministicExpressionIR; readonly direction: SortDirection }
    | { readonly op: 'skip' | 'limit'; readonly count: number };

export type SortDirection = 'asc' | 'desc';

export type QueryIR = { readonly version: 1; readonly steps: readonly QueryStepIR[] };

export interface Query {
    field(key: string): Query;
    index(index: number): Query;
    each(): Query;
    where(predicate: PredicateIR): Query;
    /** Stable sort: numbers, then strings, then nodes without a sortable key. */
    sort(by: DeterministicExpressionIR, direction?: SortDirection): Query;
    skip(count: number): Query;
    limit(count: number): Query;
    toIR(): QueryIR;
}

/** A path and value in the selection's original snapshot. */
export interface NodeRef {
    readonly path: JsonPointer;
    readonly value: JsonValue;
}

export type Mutation =
    | { readonly op: 'replace'; readonly value: JsonValue }
    | { readonly op: 'merge'; readonly value: JsonObject }
    | { readonly op: 'remove' };

/** The RFC 6902 subset emitted by Loque, not an arbitrary patch input API. */
export type PatchOperation =
    | { readonly op: 'add' | 'replace'; readonly path: JsonPointer; readonly value: JsonValue }
    | { readonly op: 'remove'; readonly path: JsonPointer };

export interface MutationPlan {
    readonly matchCount: number;
    readonly operations: readonly PatchOperation[];
    /** Apply to the captured snapshot; repeated calls never accumulate changes. */
    apply(): Snapshot;
}

export interface Selection {
    nodes(): readonly NodeRef[];
    values(): readonly JsonValue[];
    paths(): readonly JsonPointer[];
    first(): NodeRef | undefined;
    count(): number;
    plan(mutation: Mutation): MutationPlan;
}

export interface Snapshot {
    readonly value: JsonValue;
    select(query: Query): Selection;
}

export type DecisionValue = boolean | string | number;

export interface DecisionProbability<T extends DecisionValue = DecisionValue> {
    readonly value: T;
    readonly probability: number;
}

/** Caller-supplied identity of the evaluation that produced a distribution. */
export interface DecisionProvenance {
    readonly evaluator: string;
    readonly evaluatorVersion: string;
    readonly model: string;
    readonly judgment: string;
    readonly judgmentVersion: string;
    readonly inputHash: string;
    readonly timestamp: string;
}

/** Portable result data; the definition supplies its outcome space. */
export interface DecisionData<T extends DecisionValue = DecisionValue> {
    readonly distribution: readonly DecisionProbability<T>[];
    readonly provenance: DecisionProvenance;
}

export interface DecisionResult<T extends DecisionValue = DecisionValue> extends DecisionData<T> {
    /** Most probable outcome; ties follow the definition's outcome order. */
    readonly value: T;
    probability(value: T): number;
    toJSON(): DecisionData<T>;
}

export interface ScoreDecisionResult<T extends number = number> extends DecisionResult<T> {
    /** Probability-weighted mean over the declared numeric outcomes. */
    readonly expected: number;
}

export interface DecisionDefinition<T extends DecisionValue = DecisionValue> {
    readonly kind: 'boolean' | 'choice' | 'score';
    readonly outcomes: readonly T[];
    parse(input: unknown): DecisionResult<T>;
}

export interface BooleanDecision extends DecisionDefinition<boolean> {
    readonly kind: 'boolean';
    readonly outcomes: readonly [false, true];
}

export interface ChoiceDecision<T extends string = string> extends DecisionDefinition<T> {
    readonly kind: 'choice';
}

export interface ScoreDecision<T extends number = number> extends DecisionDefinition<T> {
    readonly kind: 'score';
    parse(input: unknown): ScoreDecisionResult<T>;
}

/** A named, versioned question about part of a node, answered by one evaluator. */
export interface Judgment<T extends DecisionValue = DecisionValue> {
    readonly name: string;
    readonly version: string;
    readonly evaluator: string;
    readonly decision: DecisionDefinition<T>;
    /** Opaque JSON passed to the evaluator, such as question text and criteria. */
    readonly instructions: JsonValue;
    /** The state sent to the evaluator; also its cache identity. */
    project(value: JsonValue): JsonValue;
}

export interface JudgmentOptions<T extends DecisionValue = DecisionValue> {
    readonly name: string;
    readonly version: string;
    readonly evaluator: string;
    readonly decision: DecisionDefinition<T>;
    readonly instructions?: unknown;
    readonly project?: (value: JsonValue) => unknown;
}

export interface EvaluationQuestion {
    readonly judgment: string;
    readonly judgmentVersion: string;
    readonly kind: DecisionDefinition['kind'];
    readonly outcomes: readonly DecisionValue[];
    readonly instructions: JsonValue;
}

/** One projected state and every question asked about it in this call. */
export interface EvaluationGroup {
    readonly inputHash: string;
    readonly input: JsonValue;
    readonly questions: readonly EvaluationQuestion[];
}

export interface EvaluationContext {
    readonly signal?: AbortSignal;
}

export interface Evaluator {
    readonly name: string;
    readonly version: string;
    /** Maximum number of groups per call; unlimited when omitted. */
    readonly maxBatchSize?: number;
    /** Return decision data (distribution and provenance) per question, per group. */
    evaluate(
        groups: readonly EvaluationGroup[], context: EvaluationContext,
    ): Promise<readonly (readonly unknown[])[]> | readonly (readonly unknown[])[];
}

export interface RuleEvaluatorOptions {
    readonly name: string;
    readonly version: string;
    readonly model: string;
    readonly maxBatchSize?: number;
    decide(
        input: JsonValue, question: EvaluationQuestion,
    ): readonly DecisionProbability[] | Promise<readonly DecisionProbability[]>;
    /** Clock for provenance timestamps; defaults to the current time. */
    now?(): Date;
}

/** Stores decision data by content-addressed key; values are validated when read. */
export interface DecisionCache {
    get(key: string): unknown;
    set(key: string, data: DecisionData): void | Promise<void>;
}

export interface MemoryCache extends DecisionCache {
    readonly size: number;
    clear(): void;
}

export interface RuntimeOptions {
    readonly judgments: readonly Judgment[];
    readonly evaluators: readonly Evaluator[];
    readonly cache?: DecisionCache;
}

export interface SelectOptions {
    /** Upper bound on uncached evaluations; exceeding it fails before calling evaluators. */
    readonly maxEvaluations?: number;
    readonly signal?: AbortSignal;
}

/** A decision consulted while filtering the node at `path`. */
export interface JudgedDecision {
    readonly path: JsonPointer;
    readonly judgment: string;
    readonly decision: DecisionResult;
}

export interface EvaluationStats {
    readonly evaluations: number;
    readonly cacheHits: number;
    readonly calls: number;
}

export interface JudgedSelection extends Selection {
    decisions(): readonly JudgedDecision[];
    readonly stats: EvaluationStats;
}

export interface ExplainStep {
    readonly op: QueryStepIR['op'];
    readonly input: number;
    /** An upper bound once an earlier or current step has undecided nodes. */
    readonly output: number;
    readonly judgments?: {
        readonly needed: number;
        readonly cached: number;
        readonly uncached: number;
        readonly calls: number;
    };
}

export interface Explanation {
    readonly steps: readonly ExplainStep[];
    readonly matches: number;
    /** False when uncached judgments leave counts as upper bounds. */
    readonly exact: boolean;
    readonly evaluations: number;
    readonly calls: number;
}

export interface ProgramLimits {
    readonly maxMatches?: number;
    readonly maxEvaluations?: number;
    readonly maxOperations?: number;
}

/** A portable request: select with a query, optionally plan one mutation, within limits. */
export interface ProgramIR {
    readonly version: 1;
    readonly query: QueryIR;
    readonly mutation?: Mutation;
    readonly limits?: ProgramLimits;
}

export interface ProgramOptions {
    readonly query: Query | QueryIR;
    readonly mutation?: Mutation;
    readonly limits?: ProgramLimits;
}

export interface Program {
    toIR(): ProgramIR;
}

export type MutationKind = Mutation['op'];

/** What programs may read, write, judge, and spend. Patterns are JSON Pointers where `*` matches one segment. */
export interface CapabilityOptions {
    readonly read?: readonly string[];
    readonly write?: readonly string[];
    readonly deny?: readonly string[];
    readonly judgments?: readonly string[];
    readonly mutations?: readonly MutationKind[];
    readonly maxMatches?: number;
    readonly maxEvaluations?: number;
    readonly maxOperations?: number;
}

export interface Violation {
    readonly kind: 'read' | 'write' | 'judgment' | 'mutation';
    /** Location inside the program document. */
    readonly path: JsonPointer;
    /** The data location pattern involved; `*` marks any segment. */
    readonly location: string;
    readonly message: string;
}

export interface Capability {
    /** Normalized options: every list present, limits only when set. */
    readonly options: Required<Pick<CapabilityOptions, 'read' | 'write' | 'deny' | 'judgments' | 'mutations'>>
        & Pick<CapabilityOptions, 'maxMatches' | 'maxEvaluations' | 'maxOperations'>;
    /** Every static violation of this capability by the program; empty when allowed. */
    check(program: Program): readonly Violation[];
}

export interface RunOptions {
    readonly capability?: Capability;
    readonly signal?: AbortSignal;
}

export interface ReportedDecision {
    readonly path: JsonPointer;
    readonly judgment: string;
    readonly value: DecisionValue;
    readonly distribution: readonly DecisionProbability[];
}

/** JSON describing a run, suitable for returning to the agent that sent the program. */
export interface ProgramReport {
    readonly matchCount: number;
    readonly paths: readonly JsonPointer[];
    /** Present only for programs without a mutation, whose selected locations were checked as readable. */
    readonly values?: readonly JsonValue[];
    readonly operations: readonly PatchOperation[];
    readonly decisions: readonly ReportedDecision[];
    readonly stats: EvaluationStats;
}

export interface ProgramResult {
    readonly selection: JudgedSelection;
    /** Present when the program has a mutation; the host decides whether to apply it. */
    readonly plan?: MutationPlan;
    readonly report: ProgramReport;
}

export interface Runtime {
    select(snapshot: Snapshot, query: Query, options?: SelectOptions): Promise<JudgedSelection>;
    /** Check a program against an optional capability, select, and plan its mutation. */
    run(snapshot: Snapshot, program: Program, options?: RunOptions): Promise<ProgramResult>;
    /** Counts steps, cache hits, and required calls without calling evaluators. */
    explain(snapshot: Snapshot, query: Query): Promise<Explanation>;
}
