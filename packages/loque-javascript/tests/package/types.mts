import loque, {
    snapshot, query, fromIR, current, field, literal, eq, and, isIn,
    type JsonValue, type JsonObject, type QueryIR, type Query, type Selection,
    type NodeRef, type Snapshot, type Mutation, type MutationPlan, type PatchOperation,
} from '@plurid/loque';

// Named interfaces need no index signature: input is validated at runtime.
interface Document { id: string; value: string }
const data: { records: Document[] } = { records: [{ id: '1', value: 'one' }] };
const state: Snapshot = snapshot(data);
const built: Query = query().field('records').each().where(and(
    eq(field('id'), literal('1')),
    isIn(field('value'), ['one', 'two']),
));
const ir: QueryIR = built.toIR();
const imported: Query = fromIR(JSON.parse(JSON.stringify(ir)));
const selection: Selection = state.select(imported);
const nodes: readonly NodeRef[] = selection.nodes();
const values: readonly JsonValue[] = selection.values();
const first: NodeRef | undefined = selection.first();
const mutation: Mutation = { op: 'merge', value: { reviewed: true } };
const plan: MutationPlan = selection.plan(mutation);
const operations: readonly PatchOperation[] = plan.operations;
const next: Snapshot = plan.apply();
const root: JsonValue = next.value;
const count: number = selection.count();
const paths: readonly string[] = selection.paths();
const scalar = loque.snapshot('value').select(loque.query().where(eq(current(), literal('value')))).first()?.value;
const narrowed: string | undefined = typeof scalar === 'string' ? scalar : undefined;

export function rejectInvalidUsage(): void {
    // @ts-expect-error JSON results need narrowing before object property access.
    void first!.value.id;
    // @ts-expect-error Results are not inferred as the input document type.
    const document: Document = values[0];
    // @ts-expect-error A traversal field is a literal string key.
    query().field(1);
    // @ts-expect-error Predicates cannot be JavaScript callbacks.
    query().where(() => true);
    // @ts-expect-error Literals cannot be undefined.
    literal(undefined);
    // @ts-expect-error Merge accepts only object payloads.
    selection.plan({ op: 'merge', value: [] });
    // @ts-expect-error Arbitrary JSON Patch is not a mutation intent.
    selection.plan({ op: 'move', from: '/a', path: '/b' });
    // @ts-expect-error Application uses the captured snapshot.
    plan.apply(data);
    // @ts-expect-error Node paths are readonly.
    nodes[0].path = '/different';
    // @ts-expect-error Result arrays are readonly.
    values.push(null);
    // @ts-expect-error JSON objects are readonly after narrowing.
    (root as JsonObject).changed = true;
    // @ts-expect-error IR steps are readonly.
    ir.steps.push({ op: 'each' });
    // @ts-expect-error The namespace rejects methods outside the public API.
    loque.extract('records.id:1', data);
    void document;
}

export { state, imported, nodes, values, first, operations, root, count, paths, narrowed };
