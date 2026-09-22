import { appendPointer, child, equal, isArray, isObject, MISSING, type Resolved } from './json';
import type { ExpressionIR, JsonValue, NodeRef, PredicateIR, QueryIR } from './types';

function resolve(expression: ExpressionIR, value: JsonValue): Resolved {
    switch (expression.op) {
        case 'current': return value;
        case 'literal': return expression.value;
        case 'field': return expression.path.reduce<Resolved>(child, value);
    }
}

function matches(predicate: PredicateIR, value: JsonValue): boolean {
    switch (predicate.op) {
        case 'and': return predicate.predicates.every(item => matches(item, value));
        case 'or': return predicate.predicates.some(item => matches(item, value));
        case 'not': return !matches(predicate.predicate, value);
        case 'exists': return resolve(predicate.value, value) !== MISSING;
        case 'in': {
            const resolved = resolve(predicate.value, value);
            return resolved !== MISSING && predicate.values.some(item => equal(resolved, item));
        }
        default: {
            const left = resolve(predicate.left, value);
            const right = resolve(predicate.right, value);
            if (left === MISSING || right === MISSING) return false;
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

/** Selection is finalized against one immutable tree before planning mutations. */
export function evaluate(root: JsonValue, ir: QueryIR): readonly NodeRef[] {
    let nodes: NodeRef[] = [{ path: '', value: root }];
    for (const step of ir.steps) {
        if (step.op === 'where') {
            nodes = nodes.filter(node => matches(step.predicate, node.value));
            continue;
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
        nodes = next;
    }
    // These downward-only steps cannot revisit a path; no value-based deduplication.
    return Object.freeze(nodes.map(node => Object.freeze(node)));
}
