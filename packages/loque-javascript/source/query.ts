import { expressionIR, predicateIR, queryIR } from './ir';
import type {
    ComparisonOperator, DecisionValue, DeterministicExpressionIR, ExpressionIR, JsonArray, JsonValue, Judgment,
    PathSegment, PredicateIR, Query, QueryIR, QueryStepIR, SortDirection,
} from './types';

function build(ir: QueryIR): Query {
    const append = (step: QueryStepIR): Query => fromIR({ version: 1, steps: [...ir.steps, step] });
    return Object.freeze({
        field: (key: string) => append({ op: 'field', key }),
        index: (index: number) => append({ op: 'index', index }),
        each: () => append({ op: 'each' }),
        where: (predicate: PredicateIR) => append({ op: 'where', predicate }),
        sort: (by: DeterministicExpressionIR, direction: SortDirection = 'asc') => append({ op: 'sort', by, direction }),
        skip: (count: number) => append({ op: 'skip', count }),
        limit: (count: number) => append({ op: 'limit', count }),
        toIR: () => ir,
    });
}

export function fromIR(input: unknown): Query {
    return build(queryIR(input));
}

export function query(): Query {
    return fromIR({ version: 1, steps: [] });
}

export function current(): DeterministicExpressionIR {
    return expressionIR({ op: 'current' }, true);
}

export function field(first: PathSegment, ...rest: PathSegment[]): DeterministicExpressionIR {
    return expressionIR({ op: 'field', path: [first, ...rest] }, true);
}

export function literal(value: JsonValue): DeterministicExpressionIR {
    return expressionIR({ op: 'literal', value }, true);
}

function judgmentName(judgment: string | Judgment): string {
    return typeof judgment === 'string' ? judgment : judgment?.name;
}

/** The probability a judgment assigns to `outcome` for the input (default: the current node). */
export function probability<T extends DecisionValue>(
    judgment: string | Judgment<T>, outcome: NoInfer<T>, input: DeterministicExpressionIR = current(),
): ExpressionIR {
    return expressionIR({ op: 'probability', judgment: judgmentName(judgment), input, outcome });
}

/** The most probable outcome of a judgment. */
export function decision(judgment: string | Judgment, input: DeterministicExpressionIR = current()): ExpressionIR {
    return expressionIR({ op: 'decision', judgment: judgmentName(judgment), input });
}

/** The probability-weighted mean of a score judgment. */
export function expected(
    judgment: string | Judgment<number>, input: DeterministicExpressionIR = current(),
): ExpressionIR {
    return expressionIR({ op: 'expected', judgment: judgmentName(judgment), input });
}

function comparison(op: ComparisonOperator, left: ExpressionIR, right: ExpressionIR): PredicateIR {
    return predicateIR({ op, left, right });
}

export const eq = (left: ExpressionIR, right: ExpressionIR): PredicateIR => comparison('eq', left, right);
export const ne = (left: ExpressionIR, right: ExpressionIR): PredicateIR => comparison('ne', left, right);
export const lt = (left: ExpressionIR, right: ExpressionIR): PredicateIR => comparison('lt', left, right);
export const lte = (left: ExpressionIR, right: ExpressionIR): PredicateIR => comparison('lte', left, right);
export const gt = (left: ExpressionIR, right: ExpressionIR): PredicateIR => comparison('gt', left, right);
export const gte = (left: ExpressionIR, right: ExpressionIR): PredicateIR => comparison('gte', left, right);

export function isIn(value: ExpressionIR, values: JsonArray): PredicateIR {
    return predicateIR({ op: 'in', value, values });
}

export function exists(value: ExpressionIR): PredicateIR {
    return predicateIR({ op: 'exists', value });
}

export function and(...predicates: PredicateIR[]): PredicateIR {
    return predicateIR({ op: 'and', predicates });
}

export function or(...predicates: PredicateIR[]): PredicateIR {
    return predicateIR({ op: 'or', predicates });
}

export function not(predicate: PredicateIR): PredicateIR {
    return predicateIR({ op: 'not', predicate });
}
