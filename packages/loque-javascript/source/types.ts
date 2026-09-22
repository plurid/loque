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
