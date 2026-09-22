import { expressionIR, predicateIR, queryIR } from './ir';
import type {
    ComparisonOperator, ExpressionIR, JsonArray, JsonValue, PathSegment,
    PredicateIR, Query, QueryIR, QueryStepIR,
} from './types';

function build(ir: QueryIR): Query {
    const append = (step: QueryStepIR): Query => fromIR({ version: 1, steps: [...ir.steps, step] });
    return Object.freeze({
        field: (key: string) => append({ op: 'field', key }),
        index: (index: number) => append({ op: 'index', index }),
        each: () => append({ op: 'each' }),
        where: (predicate: PredicateIR) => append({ op: 'where', predicate }),
        toIR: () => ir,
    });
}

export function fromIR(input: unknown): Query {
    return build(queryIR(input));
}

export function query(): Query {
    return fromIR({ version: 1, steps: [] });
}

export function current(): ExpressionIR {
    return expressionIR({ op: 'current' });
}

export function field(first: PathSegment, ...rest: PathSegment[]): ExpressionIR {
    return expressionIR({ op: 'field', path: [first, ...rest] });
}

export function literal(value: JsonValue): ExpressionIR {
    return expressionIR({ op: 'literal', value });
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
