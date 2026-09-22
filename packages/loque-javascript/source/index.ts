import { snapshot } from './snapshot';
import { booleanDecision, choiceDecision, scoreDecision } from './decision';
import {
    query, fromIR, current, field, literal, eq, ne, lt, lte, gt, gte, isIn, exists, and, or, not,
    probability, decision, expected,
} from './query';
import { judgment, ruleEvaluator } from './judgment';
import { memoryCache } from './cache';
import { runtime } from './runtime';

export { snapshot, query, fromIR, current, field, literal, eq, ne, lt, lte, gt, gte, isIn, exists, and, or, not };
export { probability, decision, expected };
export { booleanDecision, choiceDecision, scoreDecision };
export { judgment, ruleEvaluator, memoryCache, runtime };
export { LoqueError, type LoqueErrorCode } from './errors';
export type {
    JsonValue, JsonArray, JsonObject, JsonPointer, PathSegment,
    ExpressionIR, DeterministicExpressionIR, JudgmentExpressionIR, ComparisonOperator, PredicateIR,
    QueryStepIR, QueryIR, SortDirection, Query,
    NodeRef, Mutation, PatchOperation, MutationPlan, Selection, Snapshot,
    DecisionValue, DecisionProbability, DecisionProvenance, DecisionData, DecisionResult,
    ScoreDecisionResult, DecisionDefinition, BooleanDecision, ChoiceDecision, ScoreDecision,
    Judgment, JudgmentOptions, Evaluator, EvaluationGroup, EvaluationQuestion, EvaluationContext,
    RuleEvaluatorOptions, DecisionCache, MemoryCache, Runtime, RuntimeOptions, SelectOptions,
    JudgedSelection, JudgedDecision, EvaluationStats, Explanation, ExplainStep,
} from './types';

export default Object.freeze({
    snapshot, query, fromIR, current, field, literal, eq, ne, lt, lte, gt, gte, isIn, exists, and, or, not,
    probability, decision, expected,
    booleanDecision, choiceDecision, scoreDecision,
    judgment, ruleEvaluator, memoryCache, runtime,
});
