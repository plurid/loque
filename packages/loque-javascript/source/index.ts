import { snapshot } from './snapshot';
import { query, fromIR, current, field, literal, eq, ne, lt, lte, gt, gte, isIn, exists, and, or, not } from './query';

export { snapshot, query, fromIR, current, field, literal, eq, ne, lt, lte, gt, gte, isIn, exists, and, or, not };
export { LoqueError, type LoqueErrorCode } from './errors';
export type {
    JsonValue, JsonArray, JsonObject, JsonPointer, PathSegment,
    ExpressionIR, ComparisonOperator, PredicateIR, QueryStepIR, QueryIR, Query,
    NodeRef, Mutation, PatchOperation, MutationPlan, Selection, Snapshot,
} from './types';

export default Object.freeze({
    snapshot, query, fromIR, current, field, literal, eq, ne, lt, lte, gt, gte, isIn, exists, and, or, not,
});
