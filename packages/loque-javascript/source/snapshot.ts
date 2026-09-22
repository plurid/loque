import { LoqueError } from './errors';
import { evaluate } from './evaluate';
import { queryIR } from './ir';
import { copyJson } from './json';
import { applyOperations, planOperations } from './mutation';
import type { JsonValue, Mutation, MutationPlan, Query, Selection, Snapshot } from './types';

function ownedSnapshot(value: JsonValue): Snapshot {
    return Object.freeze({
        value,
        select(query: Query): Selection {
            if (query === null || typeof query !== 'object' || typeof query.toIR !== 'function') {
                throw new LoqueError('INVALID_QUERY', 'Expected a query builder; use fromIR for serialized queries');
            }
            const nodes = evaluate(value, queryIR(query.toIR()));
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
        },
    });
}

/** Capture a validated, deeply immutable copy of an ordinary JSON document. */
export function snapshot(input: unknown): Snapshot {
    return ownedSnapshot(copyJson(input));
}
