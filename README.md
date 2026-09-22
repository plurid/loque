<p align="center">
    <img src="https://raw.githubusercontent.com/plurid/loque/master/about/identity/loque-logo.png" height="250" alt="loque">
</p>

# loque

Deterministic JSON selections and immutable mutation plans.

Loque captures an ordinary JSON document, selects nodes with a portable query,
and generates a reviewable JSON Patch. Applying a plan produces a new snapshot
while keeping the original data and selections unchanged.

```ts
import { snapshot, query, field, literal, eq } from '@plurid/loque';

const state = snapshot({
    records: [
        { id: '1', value: 'one' },
        { id: '2', value: 'two' },
    ],
});

const selected = state.select(
    query().field('records').each().where(eq(field('id'), literal('1'))),
);

selected.values(); // [{ id: '1', value: 'one' }]
selected.paths();  // ['/records/0']

const plan = selected.plan({ op: 'merge', value: { reviewed: true } });
plan.operations; // [{ op: 'add', path: '/records/0/reviewed', value: true }]
const next = plan.apply();
next.value; // New readonly JSON document.
```

This is the deterministic core of the Loque 2 architecture: immutable snapshots,
node references, nested selection, typed predicates, serializable IR, and explicit
replace/merge/remove plans. It replaces the legacy string-query API. Arrays and
objects contain ordinary JSON values with no collection markers.

The JavaScript/TypeScript package supports Node.js 22+ and modern browser bundlers,
ships ESM and CommonJS, and has no runtime dependencies. Judgment providers, the
textual DSL, pagination, and persistent storage are later milestones.

- [JavaScript/TypeScript API and migration guide](packages/loque-javascript/README.md)
- [Development and verification](packages/loque-javascript/DEVELOPMENT.md)
- [npm package: @plurid/loque](https://www.npmjs.com/package/@plurid/loque)

## Codeophon

- Licensing: [delicense](https://github.com/ly3xqhl8g9/delicense)
- Versioning: [αver](https://github.com/ly3xqhl8g9/alpha-versioning)
