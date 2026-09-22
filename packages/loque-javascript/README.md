<p align="center">
    <img src="https://raw.githubusercontent.com/plurid/loque/master/about/identity/loque-logo.png" height="250" alt="loque">
</p>

# loque

Query and update nested JSON data, with conditions that can ask a model.

Loque lets you describe **which values you want**, find them inside arrays and
objects, and make changes at their exact locations. You can read the matches,
inspect a list of proposed edits, and apply those edits to produce an updated
copy of the document.

Conditions can also use **judgments**: named questions such as "is this order
fraudulent?" answered with probabilities by a model, classifier, or rule set you
plug in. The model supplies probabilities; your query decides the threshold and
the edit. Loque checks the cheap conditions first, sends each distinct question
once, and caches the answers.

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
- [Sort and page results](#sort-and-page-results)
- [Read the results](#read-the-results)
- [Change the selected data](#change-the-selected-data)
- [Save and reuse queries](#save-and-reuse-queries)
- [Work with probabilistic decisions](#work-with-probabilistic-decisions)
- [Use the results in TypeScript](#use-the-results-in-typescript)
- [Use judgments in queries](#use-judgments-in-queries)
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
CommonJS builds, and has no runtime dependencies. The judgment runtime hashes
with the platform's WebCrypto (`crypto.subtle`), which browsers expose in secure
contexts. For setup from a checkout,
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
query and the ability to update what it finds. Deterministic queries execute
synchronously in memory; queries with judgments run through an asynchronous
[runtime](#use-judgments-in-queries). Your application handles loading,
displaying, and persisting the data.

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

## Sort and page results

`.sort(expression, direction)` reorders the current selection; `.skip(n)` and
`.limit(n)` page through it:

```ts
state.select(orders.sort(field('total'), 'desc').field('id')).values();
// ['o-1', 'o-2', 'o-3']

state.select(orders.sort(field('total')).skip(1).limit(1).field('id')).values();
// ['o-2']
```

Sorting is stable. Numbers come first, then strings; nodes whose key is missing
or of another type keep their document order after them. `'desc'` reverses the
order among numbers and among strings. Sort keys use `field`, `current`, or
`literal`, not judgments. Paths still point into the snapshot, so a sorted or
paged selection can be planned and applied like any other.

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

## Work with probabilistic decisions

Loque can validate a probability distribution supplied by your application or an
evaluator. Define the possible outcomes, then parse the result data:

```ts
import { booleanDecision, choiceDecision, scoreDecision } from '@plurid/loque';

const intent = choiceDecision(['refund', 'replacement', 'question', 'other']);
const decisionProvenance = {
    evaluator: 'support-evaluator',
    evaluatorVersion: '1',
    model: 'support-model-v1',
    judgment: 'ticket-intent',
    judgmentVersion: '1',
    inputHash: 'example-input-hash',
    timestamp: '2026-09-22T12:00:00.000Z',
};

const intentResult = intent.parse({
    distribution: [
        { value: 'refund', probability: 0.91 },
        { value: 'replacement', probability: 0.04 },
        { value: 'question', probability: 0.03 },
        { value: 'other', probability: 0.02 },
    ],
    provenance: decisionProvenance,
});

intentResult.value;
// 'refund'

intentResult.probability('refund');
// 0.91

const shouldReviewRefund = intentResult.probability('refund') >= 0.9;
```

The result retains every probability. `.value` is the most probable outcome;
your application chooses a threshold or other policy before taking action.
Parsing is synchronous and uses the supplied data. To have Loque obtain decisions
while it filters, declare a judgment and use the runtime, described in
[Use judgments in queries](#use-judgments-in-queries).

### Boolean and numeric outcomes

`booleanDecision()` defines the outcomes `false` and `true`. `scoreDecision`
accepts finite numeric outcomes in strictly increasing order:

```ts
const reviewResult = booleanDecision().parse({
    distribution: [
        { value: false, probability: 0.25 },
        { value: true, probability: 0.75 },
    ],
    provenance: { ...decisionProvenance, judgment: 'needs-review' },
});

reviewResult.probability(true);
// 0.75

const urgency = scoreDecision([1, 2, 3, 4, 5]);
const urgencyResult = urgency.parse({
    distribution: [
        { value: 1, probability: 0 },
        { value: 2, probability: 0 },
        { value: 3, probability: 0.25 },
        { value: 4, probability: 0.5 },
        { value: 5, probability: 0.25 },
    ],
    provenance: { ...decisionProvenance, judgment: 'urgency' },
});

urgencyResult.value;
// 4

urgencyResult.expected;
// 4
```

`.expected` is the weighted mean: the sum of each score times its probability,
divided by the total probability. It may lie between the declared scores, and
uses floating-point arithmetic. Only score results expose this property.

### Validation, ownership, and serialization

- Choice outcomes are a nonempty array of distinct, nonblank strings. Score
  outcomes are a nonempty, strictly increasing array of finite numbers. Singleton
  outcome spaces are valid.
- A distribution must contain every declared outcome exactly once, including
  outcomes with zero probability. Values are matched without type coercion.
- Each probability must be finite and between `0` and `1`. The total must be
  within `1e-9` of `1` to accommodate rounding. Reported probabilities are
  preserved without normalization.
- Results put entries in definition order. Ties choose the first outcome in that
  order: `false` for booleans, the first declared choice, or the lowest score.
- All seven provenance fields shown above are required, nonblank strings.
  `timestamp` must use the canonical UTC format returned by `Date.toISOString()`.
  The application supplies the identities and input hash; Loque validates their
  shape, not their authenticity. `example-input-hash` is a placeholder.

Each definition exposes readonly `.kind` and `.outcomes` properties, plus
`.parse(input)`. Definitions copy their outcome arrays. Parsing validates and
copies the result data, then freezes its distribution and provenance. Invalid definitions or result
data throw `LoqueError` with code `INVALID_DECISION`. Looking up an undeclared
outcome also throws, rather than returning a probability for it.

Use `.toJSON()` to get readonly data suitable for a snapshot, or serialize the
result directly with `JSON.stringify`:

```ts
const decisionJSON = JSON.stringify(intentResult);
const restoredIntent = intent.parse(JSON.parse(decisionJSON));

restoredIntent.probability('refund');
// 0.91

const recordedDecision = snapshot(intentResult.toJSON());
```

The serialized shape is `{ distribution, provenance }`. Keep the corresponding
definition to restore a result. Methods, `.value`, and `.expected` are derived
again when parsing; they are not stored in the serialized data.

In TypeScript, inline outcome arrays preserve their literal types.
`intentResult.probability('refund')` is valid; an undeclared label is a type error.
`.parse(unknown)` also validates data received from untyped callers or JSON.

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

## Use judgments in queries

A **judgment** is a named, versioned question with a decision definition. An
**evaluator** answers it. A **runtime** binds both and runs queries that refer
to judgments by name. The same principle holds throughout: the evaluator reports
probabilities, and the query states the policy.

### Declare judgments and an evaluator

This example reuses `isRecord` from the previous section to read projected
objects safely:

```ts
import { judgment, ruleEvaluator, runtime, probability, memoryCache } from '@plurid/loque';

const fraud = judgment({
    name: 'fraud',
    version: '1',
    evaluator: 'rules',
    decision: booleanDecision(),
    instructions: { question: 'Does this order show evidence of fraud?' },
    project: order => isRecord(order) ? { note: order.note ?? null } : null,
});

const rules = ruleEvaluator({
    name: 'rules',
    version: '1',
    model: 'keyword-rules-v1',
    decide(input) {
        const risky = isRecord(input) && typeof input.note === 'string' && input.note.includes('stolen');
        const yes = risky ? 0.97 : 0.02;
        return [{ value: false, probability: 1 - yes }, { value: true, probability: yes }];
    },
});

const cache = memoryCache();
const rt = runtime({ judgments: [fraud], evaluators: [rules], cache });
```

`project` chooses the part of the node sent to the evaluator. It controls
privacy and cost, and it defines the cache identity: nodes with equal projections
share one answer. Without `project`, the whole node is sent. `instructions` is
arbitrary JSON passed to the evaluator unchanged, such as question text and
criteria. `ruleEvaluator` wraps a local function (rules, a classifier, a test
fixture) and fills in provenance; model-backed evaluators implement the
[`Evaluator` interface](#write-an-evaluator).

### Filter with probabilities

Judgment expressions read a decision about the current node, or about another
input you pass as the last argument:

| Expression | Value |
| --- | --- |
| `probability(judgment, outcome, input?)` | The probability of that outcome |
| `decision(judgment, input?)` | The most probable outcome |
| `expected(judgment, input?)` | The expected value of a score judgment |

Use them in predicates like any other expression, then run the query with
`rt.select`:

```ts
const payments = snapshot({
    orders: [
        { id: 'p-1', total: 1500, note: 'stolen card reported' },
        { id: 'p-2', total: 40, note: 'stolen card reported' },
        { id: 'p-3', total: 2200, note: 'gift' },
        { id: 'p-4', total: 3100, note: 'stolen card reported' },
    ],
});

const suspicious = query().field('orders').each().where(and(
    gt(field('total'), literal(1000)),
    gte(probability(fraud, true), literal(0.95)),
));

const flagged = await rt.select(payments, suspicious);

flagged.paths();
// ['/orders/0', '/orders/3']

flagged.stats;
// { evaluations: 2, cacheHits: 0, calls: 1 }
```

The total check runs first, so `p-2` is never sent to the evaluator. `p-1` and
`p-4` project to the same `{ note }`, so that question is asked once. Both
distinct questions go in a single call. Judgments that cannot change a result
are skipped: inside `and(...)`, a false deterministic condition settles the node;
inside `or(...)`, a true one does. Later `.where()` steps evaluate judgments only
for nodes that passed earlier steps.

A judged selection is an ordinary selection, so the edit is still explicit:

```ts
const reviewFlagged = flagged.plan({ op: 'merge', value: { review: true } });

reviewFlagged.operations;
// [
//     { op: 'add', path: '/orders/0/review', value: true },
//     { op: 'add', path: '/orders/3/review', value: true },
// ]
```

`flagged.decisions()` lists every decision consulted, with the path of the node
it was consulted for, so the plan can be audited:

```ts
flagged.decisions().map(item => [item.path, item.judgment, item.decision.probability(true)]);
// [
//     ['/orders/0', 'fraud', 0.97],
//     ['/orders/2', 'fraud', 0.02],
//     ['/orders/3', 'fraud', 0.97],
// ]
```

The synchronous `snapshot.select()` rejects queries containing judgments.
Judgment expressions serialize like the rest of the IR, naming judgments rather
than embedding them, so a saved query runs against whichever runtime defines
those names.

### Cache, budget, and explain

Every answer is cached under a SHA-256 key of the evaluator name and version,
the judgment name and version, and the canonical ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html))
projected input. Rerunning a query over unchanged data makes no calls; changing
a judgment's `version` or the evaluator's `version` invalidates its answers:

```ts
(await rt.select(payments, suspicious)).stats;
// { evaluations: 0, cacheHits: 2, calls: 0 }
```

`memoryCache()` keeps answers for the life of the process. Any object with
`get(key)` and `set(key, data)`, synchronous or asynchronous, can persist them
elsewhere. Cached data is validated again when read.

`rt.explain` reports the work a query needs without calling any evaluator:

```ts
const draft = query().field('orders').each().where(
    gte(probability(fraud, true, literal({ note: 'new pattern' })), literal(0.5)),
);

const explanation = await rt.explain(payments, draft);

explanation.evaluations;
// 1

explanation.exact;
// false
```

Each entry of `explanation.steps` gives the node count entering and leaving a
step, and for judgment steps the number of distinct questions, cache hits,
uncached questions, and calls. When answers are missing, undecided nodes are
counted as passing, so later counts are upper bounds and `exact` is `false`.

Pass `maxEvaluations` to fail with `BUDGET_EXCEEDED` before calling an
evaluator when a step needs more uncached answers than allowed, and `signal` to
cancel:

```ts
const budgeted = await rt.select(payments, suspicious, { maxEvaluations: 10 });

budgeted.count();
// 2
```

### Write an evaluator

An evaluator has a `name`, a `version`, an optional `maxBatchSize`, and an
`evaluate(groups, { signal })` method. Each group is one projected input with
every question asked about it:

```ts
import type { EvaluationGroup, Evaluator } from '@plurid/loque';

const constant: Evaluator = {
    name: 'constant',
    version: '1',
    maxBatchSize: 50,
    evaluate: (groups: readonly EvaluationGroup[]) => groups.map(group => group.questions.map(question => ({
        distribution: question.outcomes.map((value, index) => ({
            value, probability: index === 0 ? 1 : 0,
        })),
        provenance: {
            evaluator: 'constant',
            evaluatorVersion: '1',
            model: 'constant',
            judgment: question.judgment,
            judgmentVersion: question.judgmentVersion,
            inputHash: group.inputHash,
            timestamp: new Date().toISOString(),
        },
    }))),
};
```

A group has `input`, its `inputHash`, and `questions`. Each question carries
`judgment`, `judgmentVersion`, `kind` (`boolean`, `choice`, or `score`),
`outcomes`, and `instructions`. Return one array per group and one decision data
object per question, in order. Loque parses each answer with the judgment's
decision definition and requires its provenance `evaluator`, `evaluatorVersion`,
`judgment`, `judgmentVersion`, and `inputHash` to match the request. The model
and timestamp are the evaluator's. Several judgments about the same projected
input share a group, which suits providers that answer several questions about
one state in a single request. Calls to different evaluators, and batches split
by `maxBatchSize`, run concurrently.

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

A runtime selection reads the same frozen tree. Each `rt.select` call projects
every judged node at most once per judgment and keeps its answers only in the
cache you supply. Selection finishes, including every evaluator call, before a
plan can be created, so evaluators never observe a partially edited document.
Selections from `rt.select` do not stream: judgments before a `.limit()` are
evaluated for every candidate that reaches them.

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
| `INVALID_DECISION` | Invalid outcomes, incomplete distribution, invalid probability, provenance not matching the request | Location inside the definition's outcome array or the decision data (prefixed with `/group/question` for evaluator answers) |
| `INVALID_JUDGMENT` | Invalid judgment or evaluator definition, duplicate names, non-JSON projection | Location inside the options, or inside the projected value |
| `EVALUATION_FAILED` | Evaluator threw or rejected, returned the wrong number of answers, or the signal was aborted | `''`, or the group index; the original error is `cause` |
| `BUDGET_EXCEEDED` | More uncached evaluations needed than `maxEvaluations` | `''` |

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
| `booleanDecision()` | A `BooleanDecision` with outcomes `false` and `true` |
| `choiceDecision(outcomes)` | A `ChoiceDecision<T>` for string outcomes |
| `scoreDecision(outcomes)` | A `ScoreDecision<T>` for numeric outcomes |
| `definition.parse(input: unknown)` | A `DecisionResult<T>`; score definitions return `ScoreDecisionResult<T>` with `.expected` |
| `decision.probability(value)` | The reported probability of a declared outcome |
| `decision.toJSON()` | Readonly `DecisionData<T>` containing distribution and provenance |
| `judgment(options)` | A `Judgment<T>` with `name`, `version`, `evaluator`, `decision`, `instructions`, and `project` |
| `ruleEvaluator(options)` | An `Evaluator` wrapping `decide(input, question)` |
| `memoryCache()` | A `MemoryCache` with `get`, `set`, `size`, and `clear()` |
| `runtime({ judgments, evaluators, cache? })` | A `Runtime` |
| `rt.select(snapshot, query, options?)` | A promise of a `JudgedSelection`: a `Selection` plus `.decisions()` and `.stats` |
| `rt.explain(snapshot, query)` | A promise of an `Explanation` |

The query methods are `.field(key)`, `.index(index)`, `.each()`,
`.where(predicate)`, `.sort(by, direction?)`, `.skip(count)`, and
`.limit(count)`. Each returns another `Query`. Expression helpers are `field`,
`current`, and `literal`; judgment expression helpers are `probability`,
`decision`, and `expected`. Predicate helpers are `eq`, `ne`, `lt`, `lte`, `gt`,
`gte`, `isIn`, `exists`, `and`, `or`, and `not`.

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
| `QueryIR`, `QueryStepIR`, `ExpressionIR`, `DeterministicExpressionIR`, `JudgmentExpressionIR`, `PredicateIR`, `ComparisonOperator`, `SortDirection` | Serializable query format |
| `Mutation`, `MutationPlan`, `PatchOperation` | Mutation intents, captured plans, and generated operations |
| `LoqueErrorCode` | Error-code union |
| `DecisionDefinition`, `BooleanDecision`, `ChoiceDecision`, `ScoreDecision` | Declared outcome spaces and result parsers |
| `DecisionValue`, `DecisionProbability`, `DecisionProvenance`, `DecisionData` | Outcome values, probability entries, and portable result data |
| `DecisionResult`, `ScoreDecisionResult` | Immutable probability results and numeric expectations |
| `Judgment`, `JudgmentOptions`, `Evaluator`, `EvaluationGroup`, `EvaluationQuestion`, `EvaluationContext`, `RuleEvaluatorOptions` | Judgment definitions and the evaluator contract |
| `Runtime`, `RuntimeOptions`, `SelectOptions`, `JudgedSelection`, `JudgedDecision`, `EvaluationStats`, `Explanation`, `ExplainStep`, `DecisionCache`, `MemoryCache` | Runtime execution, auditing, planning, and caching |

### IR node shapes

A query is `{ version: 1, steps: [...] }`. The exported types define these nodes:

| Node | Shape |
| --- | --- |
| Property step | `{ op: 'field', key: string }` |
| Index step | `{ op: 'index', index: number }` |
| Enumeration step | `{ op: 'each' }` |
| Filter step | `{ op: 'where', predicate }` |
| Sort step | `{ op: 'sort', by: expression, direction: 'asc' \| 'desc' }` |
| Paging steps | `{ op: 'skip' \| 'limit', count: number }` |
| Current value | `{ op: 'current' }` |
| Relative field | `{ op: 'field', path: [segment, ...] }` |
| Literal value | `{ op: 'literal', value }` |
| Judgment probability | `{ op: 'probability', judgment: string, input: expression, outcome }` |
| Judgment outcome or expectation | `{ op: 'decision' \| 'expected', judgment: string, input: expression }` |
| Comparison | `{ op: 'eq' \| 'ne' \| 'lt' \| 'lte' \| 'gt' \| 'gte', left, right }` |
| Membership | `{ op: 'in', value: expression, values: [...] }` |
| Existence | `{ op: 'exists', value: expression }` |
| Conjunction/disjunction | `{ op: 'and' \| 'or', predicates: [...] }` |
| Negation | `{ op: 'not', predicate }` |

A relative field path contains one or more string or non-negative integer
segments. Judgment inputs and sort keys must be `current`, `field`, or `literal`
expressions. Mutation intents are `{ op: 'replace', value }`,
`{ op: 'merge', value: object }`, or `{ op: 'remove' }`.

## Development

The JavaScript/TypeScript implementation is in `packages/loque-javascript`.
From that directory:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm verify
```

`pnpm verify` runs lint, type checks, behavior tests with coverage, a check that
every TypeScript example in this README compiles, runs, and produces the results
shown, and checks of the packed ESM/CommonJS library, declarations, and browser
bundle. See the
[development guide](https://github.com/plurid/loque/blob/master/packages/loque-javascript/DEVELOPMENT.md) for all commands and the source layout.

## Codeophon

- Licensing: [delicense](https://github.com/ly3xqhl8g9/delicense)
- Versioning: [αver](https://github.com/ly3xqhl8g9/alpha-versioning)
