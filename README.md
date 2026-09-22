<p align="center">
    <img src="https://raw.githubusercontent.com/plurid/loque/master/about/identity/loque-logo.png" height="250" alt="loque">
</p>

# loque

Query and update nested JSON data.

Loque lets you describe **which values you want**, find them inside arrays and
objects, and make changes at their exact locations. You can read the matches,
inspect a list of proposed edits, and apply those edits to produce an updated
copy of the document.

For example: find pending orders worth at least 100, mark those orders for review,
and keep the input available for comparison. Or select individual items inside
those orders, replace a configuration value wherever it occurs along a path, or
remove matching entries from several nested arrays.

Queries can be saved as JSON and reused with another document. Proposed changes
are available as JSON Patch operations, so your application can display, log, or
send the edits before applying them.

## Contents

- [Install](#install)
- [First query and update](#first-query-and-update)
- [How it works](#how-it-works)
- [Navigate arrays and objects](#navigate-arrays-and-objects)
- [Filter values](#filter-values)
- [Read the results](#read-the-results)
- [Change the selected data](#change-the-selected-data)
- [Save and reuse queries](#save-and-reuse-queries)
- [Use the results in TypeScript](#use-the-results-in-typescript)
- [Data and execution model](#data-and-execution-model)
- [Handle errors](#handle-errors)
- [API reference](#api-reference)
- [Development](#development)

## Install

```sh
pnpm add @plurid/loque
```

Use named imports in JavaScript or TypeScript:

```ts
import { snapshot, query, field, literal, eq, gte, and } from '@plurid/loque';
```

The package supports Node.js 22+ and modern browser bundlers, provides ESM and
CommonJS builds, and has no runtime dependencies. For setup from a checkout,
see [Development](#development).

## First query and update

Start with ordinary data. The following examples use this document and snapshot:

```ts
const data = {
    orders: [
        { id: 'o-1', status: 'pending', total: 120 },
        { id: 'o-2', status: 'paid', total: 80 },
        { id: 'o-3', status: 'pending', total: 35 },
    ],
};

const state = snapshot(data);
```

A **snapshot** is Loque's own readonly copy of the data. Your application can keep
using `data`; changes to it will not affect `state`.

Describe the orders to select:

```ts
const orders = query().field('orders').each();

const needsReview = orders.where(and(
    eq(field('status'), literal('pending')),
    gte(field('total'), literal(100)),
));

const selection = state.select(needsReview);

selection.values();
// [{ id: 'o-1', status: 'pending', total: 120 }]

selection.paths();
// ['/orders/0']

selection.count();
// 1
```

Read the query from left to right: start at the document root, enter `orders`,
visit each element, then keep elements whose status is `pending` **and** whose
total is at least `100`. Creating the query does not read any data;
`state.select(needsReview)` executes it against the snapshot.

To mark the selected order for review, create a plan:

```ts
const plan = selection.plan({
    op: 'merge',
    value: { reviewed: true },
});

plan.matchCount;
// 1

plan.operations;
// [{ op: 'add', path: '/orders/0/reviewed', value: true }]
```

The plan describes the edits. Apply it when you want the updated document:

```ts
const next = plan.apply();

next.value;
// {
//     orders: [
//         { id: 'o-1', status: 'pending', total: 120, reviewed: true },
//         { id: 'o-2', status: 'paid', total: 80 },
//         { id: 'o-3', status: 'pending', total: 35 },
//     ],
// }
```

`next` is another snapshot. `data`, `state`, and `selection` still contain their
original values. You can query `next`, serialize `next.value`, or pass its data to
the rest of your application.

The examples below reuse `state`, `orders`, and the other variables above unless
they introduce their own data. Imports show additional helpers as they are used.

## How it works

The objects in that example have distinct jobs:

| Object | What it represents | What you do with it |
| --- | --- | --- |
| Snapshot | A stable, readonly JSON document | Read `.value` or run `.select(query)` |
| Query | A reusable description of paths and conditions | Extend it with traversal/filter steps, or serialize it with `.toIR()` |
| Selection | The matching values and their locations in one snapshot | Read values, paths, or nodes; create a change plan |
| Mutation plan | The exact edits to those selected locations | Inspect `.operations`, then call `.apply()` |

Selection and editing share the same locations. If you inspect three matches and
create a plan from that selection, the plan targets those three matches in that
snapshot. It does not run the query again while making changes.

This is useful when working with API responses, configuration documents, saved
application state, or other structured data where you need both a conditional
query and the ability to update what it finds. Loque executes synchronously in
memory. Your application handles loading, displaying, and persisting the data.

## Navigate arrays and objects

### Select a property, element, or the root

```ts
state.select(query().field('orders').index(1)).values();
// [{ id: 'o-2', status: 'paid', total: 80 }]

state.select(orders.field('id')).values();
// ['o-1', 'o-2', 'o-3']

snapshot('hello').select(query()).values();
// ['hello']
```

`query()` starts at the root. `.field('name')` selects an object property;
`.index(0)` selects an array element. `.each()` selects every array element or
every own value in an object.

```ts
const settings = snapshot({
    features: {
        search: { enabled: true },
        export: { enabled: false },
    },
});

settings.select(query().field('features').each().field('enabled')).values();
// [true, false]
```

Property names are literal strings. `.field('a.b')` selects a property named
`a.b`; use `.field('a').field('b')` to descend through two objects. Similarly,
`.field('0')` selects an object key, while `.index(0)` selects an array element.
Indices must be non-negative safe integers.

### Descend through nested collections

You can filter at one level and continue into the selected children:

```ts
const shop = snapshot({
    orders: [
        {
            id: 'o-1',
            status: 'pending',
            items: [
                { sku: 'keyboard', quantity: 1 },
                { sku: 'cable', quantity: 3 },
            ],
        },
        {
            id: 'o-2',
            status: 'paid',
            items: [{ sku: 'cable', quantity: 5 }],
        },
    ],
});

const bulkItems = query().field('orders').each()
    .where(eq(field('status'), literal('pending')))
    .field('items').each()
    .where(gte(field('quantity'), literal(2)));

shop.select(bulkItems).values();
// [{ sku: 'cable', quantity: 3 }]

shop.select(bulkItems).paths();
// ['/orders/0/items/1']
```

The result contains the item inside the matching order. You can also use this
selection to update or remove that item.

### Build queries from other queries

Extending a query creates another query. It does not alter the one you started
with:

```ts
const pendingOrders = orders.where(eq(field('status'), literal('pending')));
const paidOrders = orders.where(eq(field('status'), literal('paid')));

state.select(orders).count();        // 3
state.select(pendingOrders).count(); // 2
state.select(paidOrders).count();    // 1
```

Reuse the same query with any snapshot having the relevant structure. Missing
properties, out-of-range indices, and incompatible containers produce no matches
on that branch:

```ts
state.select(query().field('missing')).values(); // []
state.select(orders.index(0)).values();          // []: each order is an object.
state.select(query().field('orders').index(99)).values(); // []
```

## Filter values

A predicate is a condition passed to `.where()`. Predicates use expressions that
read values from the current node or supply a fixed value:

| Expression | What it reads |
| --- | --- |
| `field('total')` | The current object's `total` property |
| `field('items', 0, 'quantity')` | A nested property, including an array index |
| `current()` | The entire current node, useful when selecting scalar values |
| `literal(100)` | A fixed JSON value |

There are two uses of `field`: the query method `.field('total')` **moves the
selection** to that property; the expression `field('total')` **reads the
property inside a predicate**, keeping the selected order as the result.

### Compare values

```ts
import { current, lt, lte, gt, ne } from '@plurid/loque';

state.select(orders.where(lt(field('total'), literal(100))).field('id')).values();
// ['o-2', 'o-3']

state.select(orders.field('total').where(gte(current(), literal(100)))).values();
// [120]
```

| Predicate | Meaning |
| --- | --- |
| `eq(left, right)` | Equal |
| `ne(left, right)` | Unequal |
| `lt(left, right)` | Less than |
| `lte(left, right)` | Less than or equal |
| `gt(left, right)` | Greater than |
| `gte(left, right)` | Greater than or equal |

Comparisons do not coerce types: `1` and `'1'` are different values. Equality
compares arrays and objects by their JSON contents. Array order matters; object
key order does not. Ordering compares two numbers or two strings. Strings use
JavaScript's UTF-16 lexicographic order. Other type combinations do not match an
ordering predicate.

### Combine conditions and match several values

```ts
import { isIn, or, not } from '@plurid/loque';

state.select(orders.where(isIn(field('id'), ['o-1', 'o-3'])).field('id')).values();
// ['o-1', 'o-3']

const paidOrSmall = orders.where(or(
    eq(field('status'), literal('paid')),
    lt(field('total'), literal(40)),
));
state.select(paidOrSmall.field('id')).values();
// ['o-2', 'o-3']

state.select(orders.where(not(eq(field('status'), literal('paid')))).field('id')).values();
// ['o-1', 'o-3']
```

`and(...)` requires every condition; `or(...)` requires at least one; `not(...)`
inverts a condition. Both `and` and `or` short-circuit. A node satisfying two OR
branches still appears once. Calling `.where()` several times applies each filter
in sequence.

`isIn(expression, values)` checks membership in a literal JSON array using the
same equality rules as `eq`. An empty membership list matches nothing. Empty
`and()` is true, and empty `or()` is false, which is useful when assembling
conditions programmatically.

### Distinguish missing fields from null

```ts
import { exists } from '@plurid/loque';

const notes = snapshot([
    { id: 'a', note: null },
    { id: 'b' },
    { id: 'c', note: '' },
]);
const rows = query().each();

notes.select(rows.where(exists(field('note'))).field('id')).values();
// ['a', 'c']

notes.select(rows.where(eq(field('note'), literal(null))).field('id')).values();
// ['a']

notes.select(rows.where(not(exists(field('note')))).field('id')).values();
// ['b']
```

Null is a value. A missing field is absence. Every comparison involving a missing
operand is false, including `ne`, and membership is false too. Negation works on
the resulting boolean: `not(eq(field('note'), literal(null)))` selects both `b`
and `c`, while `ne(field('note'), literal(null))` selects only `c`. Use `exists`
when your condition must require a field to be present.

## Read the results

A selection offers several views of the same matches:

| Method | Result |
| --- | --- |
| `.values()` | Readonly array of matching JSON values |
| `.paths()` | Readonly array of their JSON Pointer paths |
| `.nodes()` | Readonly array of `{ path, value }` references |
| `.first()` | First `{ path, value }` reference, or `undefined` |
| `.count()` | Number of selected nodes |

```ts
selection.nodes();
// [{
//     path: '/orders/0',
//     value: { id: 'o-1', status: 'pending', total: 120 },
// }]

const firstOrder = selection.first()?.value;
const hasMatches = selection.count() > 0;
```

`values()`, `paths()`, and `nodes()` return arrays for zero, one, or many matches.
There is no special single-result shape. Array matches retain source order.
Object traversal follows ECMAScript own enumerable key order: integer keys first,
then other string keys in insertion order. Equal values at different locations
remain separate matches.

Paths use [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901.html), a standard
way to identify a value inside a JSON document:

| Path | Location |
| --- | --- |
| `''` | The document root |
| `/orders/0` | The first order |
| `/orders/0/status` | Its status |
| `/` | An object property with an empty name |

Inside a property name, `~` becomes `~0` and `/` becomes `~1`. For example,
`query().field('a/b').field('~')` produces `/a~1b/~0`. A node reference identifies
a location in its selection's snapshot. Obtain a fresh selection from the updated
snapshot when you need locations after edits, especially after array removals.

## Change the selected data

Call `.plan()` on a selection with one of three operations: `merge`, `replace`,
or `remove`. The operation applies to every selected node. Nothing is edited
until you call the plan's `.apply()` method.

### Merge properties into matching objects

Merge adds missing properties and replaces supplied properties that already
exist:

```ts
const reviewPlan = state.select(needsReview).plan({
    op: 'merge',
    value: { status: 'review', reviewed: true },
});

reviewPlan.matchCount;
// 1

reviewPlan.operations;
// [
//     { op: 'replace', path: '/orders/0/status', value: 'review' },
//     { op: 'add', path: '/orders/0/reviewed', value: true },
// ]

const reviewedState = reviewPlan.apply();
reviewedState.select(orders.field('status')).values();
// ['review', 'paid', 'pending']
```

To add a property, select its parent object and merge into it. Selecting an
absent property directly produces an empty selection.

Merge is **shallow**. Supplying a nested object replaces that entire property:

```ts
const preferences = snapshot({
    appearance: { color: 'blue', size: 'large' },
});
const preferencePlan = preferences.select(query()).plan({
    op: 'merge',
    value: { appearance: { color: 'red' } },
});
preferencePlan.apply().value;
// { appearance: { color: 'red' } }
```

To change only `color` while keeping `size`, select `.field('appearance')` and
merge `{ color: 'red' }` into that object. Merge targets and payloads must be
objects; arrays are not mergeable. Null is stored as a value, not interpreted as
a request to delete a property.

### Replace matching values

Replacement works with any JSON value. Select the exact nodes you want to
replace:

```ts
const statusPlan = state.select(pendingOrders.field('status')).plan({
    op: 'replace',
    value: 'queued',
});

statusPlan.operations;
// [
//     { op: 'replace', path: '/orders/0/status', value: 'queued' },
//     { op: 'replace', path: '/orders/2/status', value: 'queued' },
// ]

statusPlan.apply().select(orders.field('status')).values();
// ['queued', 'paid', 'queued']
```

Selecting an order and replacing it replaces the whole order. Selecting its
`status` and replacing it changes that property. Selecting `query()` allows you
to replace the whole document, including with a scalar or null.

### Remove matching properties or array elements

```ts
const labels = snapshot({ labels: ['draft', 'keep', 'draft', 'keep'] });
const drafts = query().field('labels').each()
    .where(eq(current(), literal('draft')));
const removal = labels.select(drafts).plan({ op: 'remove' });

removal.operations;
// [
//     { op: 'remove', path: '/labels/2' },
//     { op: 'remove', path: '/labels/0' },
// ]

removal.apply().value;
// { labels: ['keep', 'keep'] }
```

Removing an object property deletes that property. Removing an array element
closes the gap. Loque emits removals in descending index order within each array
so earlier removals cannot shift the remaining targets. Removing the document
root is an error because the result must still be a JSON value.

### Inspect, serialize, and apply plans

`plan.matchCount` counts selected nodes. `plan.operations.length` counts edits;
a merge can produce several edits for one node. An empty selection produces an
empty plan, and merging `{}` produces no edits even when nodes match.

Operations use the `add`, `replace`, and `remove` subset of
[JSON Patch](https://www.rfc-editor.org/rfc/rfc6902.html). They are readonly JSON
values that can be serialized:

```ts
const patchJSON = JSON.stringify(reviewPlan.operations, null, 2);
const documentJSON = JSON.stringify(reviewedState.value, null, 2);
```

The first string describes the changes; the second contains the updated document.
Loque exposes generated patches for inspection and interchange. Application
through Loque is `plan.apply()`; there is no public arbitrary-patch input API.

A plan always applies to its captured snapshot. Repeated `.apply()` calls produce
equivalent results. To make successive changes, query the snapshot returned by
the preceding plan:

```ts
const finalState = reviewedState.select(
    orders.where(eq(field('id'), literal('o-2'))),
).plan({ op: 'merge', value: { archived: true } }).apply();

finalState.select(orders.field('reviewed')).values(); // [true]
finalState.select(orders.field('archived')).values(); // [true]
```

All targets are validated before a plan is returned. For example, merging into a
selection containing both an object and a number throws an error. It does not
partially update the object. Mutation payloads are copied when the plan is created,
so later changes to the payload cannot alter the plan.

## Save and reuse queries

The builders produce an **intermediate representation**, or IR: ordinary JSON
that describes traversal and predicates. Use it to store a query in configuration,
share it between parts of an application, or accept a structured query from
another process.

```ts
import { fromIR } from '@plurid/loque';

const queryJSON = JSON.stringify(needsReview.toIR());
const restoredQuery = fromIR(JSON.parse(queryJSON));

state.select(restoredQuery).paths();
// ['/orders/0']
```

You can also supply the representation directly. This query selects pending
orders:

```ts
const structuredQuery = fromIR({
    version: 1,
    steps: [
        { op: 'field', key: 'orders' },
        { op: 'each' },
        {
            op: 'where',
            predicate: {
                op: 'eq',
                left: { op: 'field', path: ['status'] },
                right: { op: 'literal', value: 'pending' },
            },
        },
    ],
});

state.select(structuredQuery.field('id')).values();
// ['o-1', 'o-3']
```

`version` identifies the IR format. `fromIR(unknown)` validates and copies the
input. Unsupported versions, unknown operators, missing or extra fields, malformed
paths, and non-JSON contents are rejected. The TypeScript builders use the same
validation and execution rules.

Queries contain data and operators rather than JavaScript predicate callbacks.
Your application chooses which document to query and whether to apply any
resulting edits. The serialized query does not contain the snapshot or its values.

## Use the results in TypeScript

Loque exports readonly types for its data, queries, results, and plans. Selected
values have type `JsonValue`, because a query can address objects, arrays, or
scalars. Narrow a result before using application-specific fields:

```ts
const selectedId = state.select(needsReview.field('id')).first()?.value;
if (typeof selectedId === 'string') {
    console.log(selectedId.toUpperCase()); // O-1
}
```

For objects, use a type guard to inspect their contents:

```ts
import type { JsonObject, JsonValue } from '@plurid/loque';

function isRecord(value: JsonValue | undefined): value is JsonObject {
    return value !== undefined && value !== null
        && typeof value === 'object' && !Array.isArray(value);
}

const selectedOrder = selection.first()?.value;
if (isRecord(selectedOrder) && typeof selectedOrder.total === 'number') {
    console.log(selectedOrder.total + 10); // 130
}
```

`snapshot` accepts `unknown`, so input objects typed with your own interfaces need
no index signature. The snapshot validates their actual values at runtime.
Result types do not assert that the selected data matches an application schema.
Use your application's validation when you need that guarantee.

The returned document, selected values, node references, queries, and plans are
readonly. Their JSON contents are frozen at runtime as well. Make edits through
plans and work with the resulting snapshot.

## Data and execution model

Loque accepts JSON trees:

- Null, booleans, strings, and finite numbers.
- Dense arrays containing JSON values.
- Plain objects with enumerable string-keyed data properties, including objects
  created with a null prototype.

Undefined, `NaN`, infinities, bigint, functions, symbols, dates, maps, sets, and
class instances are rejected. So are cyclic references, getters/setters,
non-enumerable object properties, sparse arrays, and extra properties on arrays.
Validation does not invoke getters or `toJSON` methods. Convert application-specific
values, such as dates, to their intended JSON representation before taking a
snapshot.

Only own properties participate in traversal. Names such as `__proto__` and
`constructor` are treated as data keys. Two references to the same input object
become independent locations in the copied JSON tree.

Snapshot creation validates and copies the input. Selection evaluates a query
against that stable tree. Applying a plan creates a copy with the generated edits
and freezes the result. The implementation works on documents in memory; factor
those copies into your memory budget when processing large inputs. Structural
sharing and object identity between snapshots are not API guarantees.

## Handle errors

Invalid input or query definitions throw `LoqueError`, with a code and a path
identifying the problem:

```ts
import { LoqueError } from '@plurid/loque';

try {
    snapshot({ total: NaN });
} catch (error) {
    if (error instanceof LoqueError) {
        console.log(error.code); // INVALID_JSON
        console.log(error.path); // /total
    } else {
        throw error;
    }
}
```

| Code | Examples | What `path` identifies |
| --- | --- | --- |
| `INVALID_JSON` | Undefined property, non-finite number, cyclic input | Location inside the snapshot input |
| `INVALID_QUERY` | Negative index, unknown IR operator, invalid predicate | Location inside the query definition |
| `INVALID_MUTATION` | Non-object merge target, invalid payload, root removal | Invalid part of the intent, or the targeted location in the snapshot |

Paths use JSON Pointer; `''` means the root. Use the code for programmatic handling
and the message for additional context. A valid query finding no matches returns
an empty selection. It does not throw.

## API reference

### Entry points and return types

| Entry point | Returns |
| --- | --- |
| `snapshot(data: unknown)` | `Snapshot` with readonly `.value` and `.select(query)` |
| `query()` | A `Query` starting at the document root |
| `fromIR(input: unknown)` | A validated `Query` |
| `snapshot.select(query)` | A `Selection` in that snapshot |
| `selection.plan(mutation)` | A `MutationPlan` with `.matchCount`, `.operations`, and `.apply()` |
| `plan.apply()` | A new `Snapshot` |
| `query.toIR()` | Readonly `QueryIR` |

The query methods are `.field(key)`, `.index(index)`, `.each()`, and
`.where(predicate)`. Each returns another `Query`. Expression helpers are
`field`, `current`, and `literal`. Predicate helpers are `eq`, `ne`, `lt`, `lte`,
`gt`, `gte`, `isIn`, `exists`, `and`, `or`, and `not`.

All these factory/helper functions are also available on the default namespace:

```ts
import loque from '@plurid/loque';

loque.snapshot([1, 2, 3]).select(
    loque.query().each().where(loque.gt(loque.current(), loque.literal(1))),
).values();
// [2, 3]
```

CommonJS provides the same named exports and default namespace:

```js
const loque = require('@plurid/loque');

loque.snapshot({ enabled: true })
    .select(loque.query().field('enabled')).values(); // [true]

const namespace = loque.default;
namespace.query();
```

`LoqueError` is a named export. Only `@plurid/loque` and
`@plurid/loque/package.json` are public package entry points.

### Public types

| Types | Purpose |
| --- | --- |
| `JsonValue`, `JsonArray`, `JsonObject` | Readonly JSON data |
| `JsonPointer`, `PathSegment` | Locations and relative path segments |
| `Snapshot`, `Query`, `Selection`, `NodeRef` | Data capture, query construction, and results |
| `QueryIR`, `QueryStepIR`, `ExpressionIR`, `PredicateIR`, `ComparisonOperator` | Serializable query format |
| `Mutation`, `MutationPlan`, `PatchOperation` | Mutation intents, captured plans, and generated operations |
| `LoqueErrorCode` | Error-code union |

### IR node shapes

A query is `{ version: 1, steps: [...] }`. The exported types define these nodes:

| Node | Shape |
| --- | --- |
| Property step | `{ op: 'field', key: string }` |
| Index step | `{ op: 'index', index: number }` |
| Enumeration step | `{ op: 'each' }` |
| Filter step | `{ op: 'where', predicate }` |
| Current value | `{ op: 'current' }` |
| Relative field | `{ op: 'field', path: [segment, ...] }` |
| Literal value | `{ op: 'literal', value }` |
| Comparison | `{ op: 'eq' \| 'ne' \| 'lt' \| 'lte' \| 'gt' \| 'gte', left, right }` |
| Membership | `{ op: 'in', value: expression, values: [...] }` |
| Existence | `{ op: 'exists', value: expression }` |
| Conjunction/disjunction | `{ op: 'and' \| 'or', predicates: [...] }` |
| Negation | `{ op: 'not', predicate }` |

A relative field path contains one or more string or non-negative integer
segments. Mutation intents are `{ op: 'replace', value }`,
`{ op: 'merge', value: object }`, or `{ op: 'remove' }`.

## Development

The JavaScript/TypeScript implementation is in `packages/loque-javascript`.
From that directory:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm verify
```

`pnpm verify` runs lint, type checks, behavior tests with coverage, and checks of
the packed ESM/CommonJS library, declarations, and browser bundle. See the
[development guide](packages/loque-javascript/DEVELOPMENT.md) for all commands and the source layout.

## Codeophon

- Licensing: [delicense](https://github.com/ly3xqhl8g9/delicense)
- Versioning: [αver](https://github.com/ly3xqhl8g9/alpha-versioning)
