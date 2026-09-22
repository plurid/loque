import { LoqueError } from './errors';
import { shape } from './ir';
import { appendPointer, copyJson, defineValue, freezeJson, isArray, isObject, pointerSegments } from './json';
import type { JsonObject, JsonValue, Mutation, NodeRef, PatchOperation } from './types';

export function mutationIR(input: unknown): Mutation {
    const owned = copyJson(input, 'INVALID_MUTATION');
    if (!isObject(owned)) throw new LoqueError('INVALID_MUTATION', 'Expected a mutation object');
    switch (owned.op) {
        case 'remove':
            shape(owned, ['op'], '', 'INVALID_MUTATION');
            return owned as Mutation;
        case 'replace': case 'merge':
            shape(owned, ['op', 'value'], '', 'INVALID_MUTATION');
            if (owned.op === 'merge' && !isObject(owned.value)) {
                throw new LoqueError('INVALID_MUTATION', 'Merge requires an object value', '/value');
            }
            return owned as Mutation;
        default:
            throw new LoqueError('INVALID_MUTATION', 'Unknown mutation operator', '/op');
    }
}

/** Resolve only existing pointers generated from this snapshot's selection. */
function at(root: JsonValue, segments: readonly string[]): JsonValue {
    return segments.reduce((value, key) => (value as JsonObject)[key], root);
}

function parentPath(path: string): string {
    return path.slice(0, path.lastIndexOf('/'));
}

function validateTargets(nodes: readonly NodeRef[], mutation: Mutation): void {
    const paths = new Set<string>();
    for (const node of nodes) {
        if (paths.has(node.path)) throw new LoqueError('INVALID_MUTATION', 'Duplicate target', node.path);
        paths.add(node.path);
    }
    for (const node of nodes) {
        let ancestor = node.path;
        while (ancestor !== '') {
            ancestor = parentPath(ancestor);
            if (paths.has(ancestor)) throw new LoqueError('INVALID_MUTATION', 'Overlapping targets', node.path);
        }
        if (mutation.op === 'remove' && node.path === '') {
            throw new LoqueError('INVALID_MUTATION', 'Cannot remove the document root', node.path);
        }
        if (mutation.op === 'merge' && !isObject(node.value)) {
            throw new LoqueError('INVALID_MUTATION', 'Merge requires object targets', node.path);
        }
    }
}

export function planOperations(root: JsonValue, nodes: readonly NodeRef[], input: Mutation): readonly PatchOperation[] {
    const mutation = mutationIR(input);
    validateTargets(nodes, mutation);
    const operations: PatchOperation[] = [];

    if (mutation.op === 'remove') {
        // Group by parent to keep the comparison transitive even across many arrays.
        const groups = new Map<string, NodeRef[]>();
        for (const node of nodes) {
            const parent = parentPath(node.path);
            const group = groups.get(parent) ?? [];
            group.push(node);
            groups.set(parent, group);
        }
        for (const [parent, group] of groups) {
            if (isArray(at(root, pointerSegments(parent)))) {
                group.sort((a, b) => Number(b.path.slice(parent.length + 1)) - Number(a.path.slice(parent.length + 1)));
            }
            for (const node of group) operations.push({ op: 'remove', path: node.path });
        }
    } else {
        for (const node of nodes) {
            if (mutation.op === 'replace') {
                operations.push({ op: 'replace', path: node.path, value: mutation.value });
            } else {
                for (const [key, value] of Object.entries(mutation.value)) {
                    operations.push({
                        op: Object.hasOwn(node.value as JsonObject, key) ? 'replace' : 'add',
                        path: appendPointer(node.path, key),
                        value,
                    });
                }
            }
        }
    }
    return Object.freeze(operations.map(operation => Object.freeze(operation)));
}

/** Internal application accepts only fully validated, generated operations. */
export function applyOperations(root: JsonValue, operations: readonly PatchOperation[]): JsonValue {
    let result = copyJson(root, 'INVALID_JSON', false);
    for (const operation of operations) {
        if (operation.path === '' && operation.op === 'replace') {
            result = operation.value;
            continue;
        }
        const segments = pointerSegments(operation.path);
        const key = segments.pop()!;
        const parent = at(result, segments);
        if (operation.op === 'remove') {
            if (isArray(parent)) (parent as JsonValue[]).splice(Number(key), 1);
            else Reflect.deleteProperty(parent as JsonObject, key);
        } else {
            defineValue(parent as object, key, operation.value);
        }
    }
    return freezeJson(result);
}
