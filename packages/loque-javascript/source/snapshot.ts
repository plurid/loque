import { LoqueError } from './errors';
import { evaluate } from './evaluate';
import { judgmentExpressions, queryOf } from './ir';
import { copyJson } from './json';
import { applyOperations, planOperations } from './mutation';
import type { JsonValue, Mutation, MutationPlan, NodeRef, Query, Selection, Snapshot } from './types';

const owned = new WeakMap<object, JsonValue>();

/** Bind finalized nodes to the snapshot they were selected from. */
export function selectionOf(value: JsonValue, nodes: readonly NodeRef[]): Selection {
    return Object.freeze({
        nodes: () => nodes,
        values: () => Object.freeze(nodes.map(node => node.value)),
        paths: () => Object.freeze(nodes.map(node => node.path)),
        first: () => nodes[0],
        count: () => nodes.length,
        plan(mutation: Mutation): MutationPlan {
            const operations = planOperations(value, nodes, mutation);
            return Object.freeze({
                matchCount: nodes.length,
                operations,
                apply: () => ownedSnapshot(applyOperations(value, operations)),
            });
        },
    });
}

function ownedSnapshot(value: JsonValue): Snapshot {
    const result: Snapshot = Object.freeze({
        value,
        select(query: Query): Selection {
            const ir = queryOf(query);
            const [judged] = judgmentExpressions(ir);
            if (judged !== undefined) {
                throw new LoqueError('INVALID_QUERY', 'Judgment expressions require runtime().select', judged.path);
            }
            return selectionOf(value, evaluate(value, ir));
        },
    });
    owned.set(result, value);
    return result;
}

/** The validated tree of a snapshot created by this library. */
export function snapshotValue(input: Snapshot): JsonValue {
    const value = input !== null && typeof input === 'object' ? owned.get(input) : undefined;
    if (value === undefined) throw new LoqueError('INVALID_JSON', 'Expected a snapshot created by snapshot()');
    return value;
}

/** Capture a validated, deeply immutable copy of an ordinary JSON document. */
export function snapshot(input: unknown): Snapshot {
    return ownedSnapshot(copyJson(input));
}
