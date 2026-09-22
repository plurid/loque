import { LoqueError } from './errors';
import { appendPointer, child, equal, isArray, isObject, MISSING, type Resolved } from './json';
import type { ExpressionIR, JsonValue, JudgmentExpressionIR, NodeRef, PredicateIR, QueryIR, QueryStepIR } from './types';

/** A judgment value that has not been evaluated yet; `key` identifies it for batching. */
export class Pending {
    constructor(readonly key: string) {}
}

export type Judge = (expression: JudgmentExpressionIR, input: JsonValue) => Resolved | Pending;

/** A decided predicate, or the pending judgments that could still decide it. */
export type Truth = boolean | readonly Pending[];

function resolve(expression: ExpressionIR, value: JsonValue, judge: Judge): Resolved | Pending {
    switch (expression.op) {
        case 'current': return value;
        case 'literal': return expression.value;
        case 'field': return expression.path.reduce<Resolved>(child, value);
        default: {
            // Validation guarantees a deterministic input expression.
            const input = resolve(expression.input, value, judge) as Resolved;
            return input === MISSING ? MISSING : judge(expression, input);
        }
    }
}

/**
 * Three-valued evaluation. A decisive child ends and/or early, so judgments in
 * branches that cannot change the result are never requested; the remaining
 * pending judgments are all returned so they can be evaluated in one batch.
 */
export function truth(predicate: PredicateIR, value: JsonValue, judge: Judge): Truth {
    switch (predicate.op) {
        case 'and': case 'or': {
            const decisive = predicate.op === 'or';
            const pending: Pending[] = [];
            for (const item of predicate.predicates) {
                const result = truth(item, value, judge);
                if (result === decisive) return decisive;
                if (typeof result !== 'boolean') pending.push(...result);
            }
            return pending.length === 0 ? !decisive : pending;
        }
        case 'not': {
            const result = truth(predicate.predicate, value, judge);
            return typeof result === 'boolean' ? !result : result;
        }
        // A judgment of a present input always has a value.
        case 'exists': return resolve(predicate.value, value, judge) !== MISSING;
        case 'in': {
            const resolved = resolve(predicate.value, value, judge);
            if (resolved === MISSING) return false;
            if (resolved instanceof Pending) return [resolved];
            return predicate.values.some(item => equal(resolved, item));
        }
        default: {
            const left = resolve(predicate.left, value, judge);
            const right = resolve(predicate.right, value, judge);
            if (left === MISSING || right === MISSING) return false;
            if (left instanceof Pending || right instanceof Pending) {
                return [left, right].filter(item => item instanceof Pending);
            }
            if (predicate.op === 'eq') return equal(left, right);
            if (predicate.op === 'ne') return !equal(left, right);
            if (!((typeof left === 'number' && typeof right === 'number')
                || (typeof left === 'string' && typeof right === 'string'))) return false;
            switch (predicate.op) {
                case 'lt': return left < right;
                case 'lte': return left <= right;
                case 'gt': return left > right;
                case 'gte': return left >= right;
            }
        }
    }
}

const deterministic: Judge = () => {
    throw new LoqueError('INVALID_QUERY', 'Judgment expressions require a runtime');
};

function rank(key: Resolved | Pending): number {
    return typeof key === 'number' ? 0 : typeof key === 'string' ? 1 : 2;
}

/** Apply one non-filter step. These downward-only steps cannot revisit a path. */
export function traverse(nodes: readonly NodeRef[], step: Exclude<QueryStepIR, { op: 'where' }>): NodeRef[] {
    switch (step.op) {
        case 'skip': return nodes.slice(step.count);
        case 'limit': return nodes.slice(0, step.count);
        case 'sort': {
            const sign = step.direction === 'asc' ? 1 : -1;
            const keyed = nodes.map((node, position): { node: NodeRef; position: number; key: Resolved | Pending } => ({
                node, position, key: resolve(step.by, node.value, deterministic),
            }));
            keyed.sort((a, b) => {
                const order = rank(a.key) - rank(b.key);
                if (order !== 0 || rank(a.key) === 2) return order || a.position - b.position;
                // Same rank: both numbers or both strings.
                const left = a.key as number;
                const right = b.key as number;
                const compared = left < right ? -1 : left > right ? 1 : 0;
                return sign * compared || a.position - b.position;
            });
            return keyed.map(item => item.node);
        }
    }
    const next: NodeRef[] = [];
    for (const node of nodes) {
        if (step.op === 'each') {
            if (isArray(node.value) || isObject(node.value)) {
                for (const [key, value] of Object.entries(node.value)) {
                    next.push({ path: appendPointer(node.path, key), value });
                }
            }
        } else {
            const key = step.op === 'field' ? step.key : step.index;
            const value = child(node.value, key);
            if (value !== MISSING) next.push({ path: appendPointer(node.path, key), value });
        }
    }
    return next;
}

export function freezeNodes(nodes: readonly NodeRef[]): readonly NodeRef[] {
    return Object.freeze(nodes.map(node => Object.isFrozen(node) ? node : Object.freeze(node)));
}

/** Selection is finalized against one immutable tree before planning mutations. */
export function evaluate(root: JsonValue, ir: QueryIR): readonly NodeRef[] {
    let nodes: NodeRef[] = [{ path: '', value: root }];
    for (const step of ir.steps) {
        nodes = step.op === 'where'
            ? nodes.filter(node => truth(step.predicate, node.value, deterministic) === true)
            : traverse(nodes, step);
    }
    return freezeNodes(nodes);
}
