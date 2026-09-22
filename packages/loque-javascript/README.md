<p align="center">
    <img src="https://raw.githubusercontent.com/plurid/loque/master/about/identity/loque-logo.png" height="250" alt="loque">
</p>

# loque

Deterministic JSON selections and immutable mutation plans.

Loque captures an ordinary JSON document, selects nodes through a portable query,
then generates a reviewable JSON Patch. Applying the plan creates a new snapshot.
The input and all earlier selections remain unchanged.

This is the deterministic core of the Loque 2 architecture. It replaces the
legacy locator/extractor/updater API. See [migration](#migration-from-the-legacy-api).

## Installation and support

```sh
pnpm add @plurid/loque
```

The package supports Node.js 22+ and modern browser bundlers, ships ES2022 ESM and
CommonJS, and has no runtime dependencies. Only the package root and
`@plurid/loque/package.json` are public entry points.

```ts
import loque, { snapshot, query, field, literal, eq } from '@plurid/loque';
```

Every query/snapshot factory is available both by name and on `loque`. CommonJS
consumers can use `require('@plurid/loque')` for named exports or
`require('@plurid/loque').default` for the namespace.

## Select, inspect, apply

```ts
import { snapshot, query, field, literal, eq } from '@plurid/loque';

const data = {
    records: [
        { id: '1', value: 'one', children: [{ score: 7 }] },
        { id: '2', value: 'two', children: [] },
    ],
};
const state = snapshot(data);
const selectedQuery = query().field('records').each()
    .where(eq(field('id'), literal('1')));
const selection = state.select(selectedQuery);

selection.values(); // [{ id: '1', value: 'one', children: [{ score: 7 }] }]
selection.paths();  // ['/records/0']
selection.first();  // { path: '/records/0', value: ... }
selection.count();  // 1

const plan = selection.plan({ op: 'merge', value: { reviewed: true } });
plan.matchCount; // 1
plan.operations;
// [{ op: 'add', path: '/records/0/reviewed', value: true }]

const next = plan.apply();
next.value; // New readonly JSON document with reviewed: true.
state.value; // Original captured document.
data; // Caller-owned document, unchanged by Loque.

// Continue from any snapshot, including nested arrays and objects.
next.select(selectedQuery.field('children').each().field('score')).values(); // [7]
```

## Snapshot and selection contract

`snapshot(unknown)` validates, copies, and deeply freezes the input once. Later
changes to the caller's data cannot alter the snapshot, selections, or plans.
Inputs may be null, booleans, strings, finite numbers, dense arrays, and plain
objects, including objects with a null prototype. Shared references are copied as
separate tree paths; cycles are rejected.

Undefined, non-finite numbers, bigint, functions, symbols, class instances,
accessors, non-enumerable object properties, sparse arrays, and extra array
properties are rejected. Validation does not invoke getters or `toJSON` methods.
Only own data properties participate in traversal. Names such as `__proto__` and
`constructor` are ordinary data keys.

| Builder step | Meaning |
| --- | --- |
| `query()` | Select the document root, including scalar roots |
| `.field(key)` | Select an existing object property using its exact string key |
| `.index(index)` | Select an array element using a non-negative safe integer |
| `.each()` | Select every array element or own object value |
| `.where(predicate)` | Keep nodes satisfying a boolean predicate |

Builders are immutable: extending a query creates another query. Missing fields,
out-of-range indices, and incompatible container types contribute no matches.
A field called `a.b` is one property, not a parsed path. `.field('0')` addresses an
object key; `.index(0)` addresses an array element.

Results preserve array order and ECMAScript own enumerable key order for objects
(integer keys first, then other string keys in insertion order). Separate nodes
with equal values remain separate matches; each selected path occurs once.
`values()`, `paths()`, and `nodes()` always return readonly arrays, including for
zero or one match. `first()` returns a readonly `NodeRef` or undefined.

A `NodeRef` contains `path` and `value`. Paths are [RFC 6901 JSON
Pointers](https://www.rfc-editor.org/rfc/rfc6901.html): the root is `''`, an empty
property name is `'/'`, and `~`/`/` within keys become `~0`/`~1`. These paths always
refer to the selection's original snapshot. Query the next snapshot to obtain
references after changes such as array removal.

## Expressions and predicates

Expressions are `current()`, `field(first, ...rest)`, and `literal(jsonValue)`.
`field('children', 0, 'score')` resolves a path relative to the current selected
node. String segments address objects and numeric segments address arrays.
Builders capture immutable copies of literals and predicate inputs.

| Predicate | Semantics |
| --- | --- |
| `eq(left, right)`, `ne(left, right)` | Structural JSON equality/inequality; no coercion |
| `lt`, `lte`, `gt`, `gte` | Compare two numbers or two strings; all other type combinations are false |
| `isIn(expression, values)` | Structural membership in a literal JSON array |
| `exists(expression)` | True when the expression resolves, including to null |
| `and(...predicates)`, `or(...predicates)` | Ordinary short-circuit boolean conjunction/disjunction |
| `not(predicate)` | Boolean negation |

Numbers and strings are distinct: `1` does not equal `'1'`. Object equality ignores
key order; array equality includes order. String ordering uses JavaScript's UTF-16
lexicographic comparison, without locale conversion. Empty `and()` is true and
empty `or()` is false. Repeated `.where()` steps filter cumulatively.

Missing is different from null. Every comparison involving a missing operand is
false, including `ne`; membership is also false. `not(eq(...))` negates the
result normally, so it can include missing values. Use `exists` when presence
must be required explicitly.

```ts
import { and, field, gte, isIn, literal, query } from '@plurid/loque';

const eligible = query().field('records').each().where(and(
    isIn(field('id'), ['1', '2']),
    gte(field('children', 0, 'score'), literal(5)),
));
```

The public result type is `JsonValue`, not an inferred application schema. Narrow
values before accessing properties. `snapshot` accepts typed application
interfaces without requiring index signatures because its input is validated at
runtime.

## Portable IR

`QueryIR` is the canonical query representation. Builders produce the same
versioned, readonly structure accepted by `fromIR(unknown)`:

```ts
import { fromIR } from '@plurid/loque';

const restored = fromIR({
    version: 1,
    steps: [
        { op: 'field', key: 'records' },
        { op: 'each' },
        {
            op: 'where',
            predicate: {
                op: 'eq',
                left: { op: 'field', path: ['id'] },
                right: { op: 'literal', value: '1' },
            },
        },
    ],
});
const portable = JSON.stringify(restored.toIR());
const roundTrip = fromIR(JSON.parse(portable));
```

The exported `QueryIR`, `QueryStepIR`, `ExpressionIR`, and `PredicateIR` types
define the format. Steps use `field/key`, `index/index`, `each`, or
`where/predicate`. Expressions use `current`, `field/path`, or `literal/value`.
Comparisons contain `left` and `right`; membership is `{ op: 'in', value, values }`;
existence uses `value`; `and`/`or` contain `predicates`; `not` contains `predicate`.

Validation rejects unsupported versions, unknown operators, missing or extra
fields, malformed paths, and non-JSON contents. No JavaScript callbacks or textual
query evaluation are accepted. `fromIR` owns its input just as builders own their
arguments. Passing a query to `select` validates its IR again.

## Mutation plans

`selection.plan(mutation)` validates all targets before returning a frozen plan.
Each plan applies one intent to the selection finalized against its captured
snapshot:

| Intent | Behavior |
| --- | --- |
| `{ op: 'replace', value }` | Replace every selected node with any JSON value; root replacement is supported |
| `{ op: 'merge', value: object }` | Shallowly replace supplied properties and add missing ones; every target must be an object |
| `{ op: 'remove' }` | Delete selected properties or array elements; removing the document root is rejected |

Merge does not recursively combine objects. Arrays are not merge targets or
merge payloads. Null is a literal value and never a deletion instruction. Payloads
are copied when the plan is created.

`operations` is the readonly `add`/`replace`/`remove` subset of [RFC 6902 JSON
Patch](https://www.rfc-editor.org/rfc/rfc6902.html). It can be serialized for
inspection or external interoperability. Array removals are emitted in descending
index order within each parent array. Duplicate or ancestor/descendant targets
are rejected by the mutation compiler.

`matchCount` counts selected nodes, not patch operations. Empty selections create
empty plans; merging `{}` can match nodes while producing no operations. Even
empty selections validate the mutation definition.

`apply()` takes no arguments and creates a new snapshot from the captured state.
Repeated calls produce equivalent results rather than accumulating changes.
Original inputs and snapshots remain unchanged if validation fails. Application
uses copying; structural sharing and object identity across snapshots are not
part of the API contract. Arbitrary patch ingestion, plan deserialization,
external-store commits, and optimistic concurrency are future capabilities.

## Errors

`LoqueError` extends `Error` and exposes `code` and `path`:

| Code | Path refers to |
| --- | --- |
| `INVALID_JSON` | Invalid data within the snapshot input |
| `INVALID_QUERY` | Invalid IR or a builder definition |
| `INVALID_MUTATION` | Invalid mutation definition, or the incompatible/conflicting target in the snapshot |

Paths are JSON Pointers; `''` identifies the root. Messages provide context, while
codes are intended for programmatic handling. No-match queries do not throw.

## Migration from the legacy API

The old string parser, `locate`, `extract`, `update`, `Locator`, `Extractor`,
`Updater`, and statement/result types have been removed. Arrays contain ordinary
JSON values; collection marker objects have no special meaning.

| Previous usage | Replacement |
| --- | --- |
| `loque.locate('records.id:1')` | `query().field('records').each().where(eq(field('id'), literal('1')))` |
| `loque.extract(locator, data).data` | `snapshot(data).select(builtQuery).values()` |
| `loque.update(locator, data, patch)` | `snapshot(data).select(builtQuery).plan({ op: 'merge', value: patch }).apply().value` |
| Extracted `empty` flag | `selection.count() === 0` |
| Extracted single value | `selection.first()?.value` |
| Legacy `&` combining either ID | `isIn(field('id'), ['1', '2'])`, or an explicit `or(...)` |

Use `literal(1)` for numeric IDs and `literal('1')` for string IDs. Conventional
`and(...)` requires every predicate to hold; it does not reproduce the old union
behavior. Results no longer switch between a single value and an array. Nested
traversal is implemented. Cursor pagination and the textual DSL are deferred,
along with judgments, evaluator adapters, and persistent storage.

## Development

See [the development guide](https://github.com/plurid/loque/blob/master/packages/loque-javascript/DEVELOPMENT.md)
for the toolchain, commands, coverage requirements, and packed-consumer checks.

Licensing: [delicense](https://github.com/ly3xqhl8g9/delicense).
Versioning: [αver](https://github.com/ly3xqhl8g9/alpha-versioning).
