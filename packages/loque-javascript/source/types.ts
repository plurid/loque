/** JSON trees are readonly at every public boundary. */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
export type JsonArray = readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonPointer = string;
export type PathSegment = string | number;

export type ExpressionIR =
    | { readonly op: 'current' }
    | { readonly op: 'field'; readonly path: readonly PathSegment[] }
    | { readonly op: 'literal'; readonly value: JsonValue };

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
    | { readonly op: 'where'; readonly predicate: PredicateIR };

export type QueryIR = { readonly version: 1; readonly steps: readonly QueryStepIR[] };

export interface Query {
    field(key: string): Query;
    index(index: number): Query;
    each(): Query;
    where(predicate: PredicateIR): Query;
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
