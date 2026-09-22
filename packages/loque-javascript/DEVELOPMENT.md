# Development

The published library supports Node.js 22+ and modern browser bundlers. It has
no runtime dependencies and ships ES2022 JavaScript in ESM and CommonJS formats.
Only the package root and `@plurid/loque/package.json` are public entry points.
CommonJS consumers use `require('@plurid/loque').default` for the default API.

Building requires Node.js `^22.18.0 || ^24.11.0 || >=26.0.0` and pnpm 11.3.0,
as pinned in `package.json`. Run commands from this directory:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

| Command | Purpose |
| --- | --- |
| `pnpm build` | Clean and build JavaScript, source maps, and bundled declarations |
| `pnpm dev` | Rebuild on source changes |
| `pnpm typecheck` | Check production source separately from tests and configuration |
| `pnpm lint` | Run ESLint without rewriting files |
| `pnpm test` | Run unit tests once |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:coverage` | Report and enforce production-source coverage |
| `pnpm check:docs` | Type-check and run the README examples and compare documented results |
| `pnpm check:package` | Build, pack, and check isolated consumer fixtures |
| `pnpm verify` | Run lint, types, coverage, docs, and package checks |

The toolchain uses tsdown, Vitest/V8 coverage, ESLint flat configuration, and
TypeScript 6. TypeScript stays on the 6.0 release line until compiler-API consumers
support TypeScript 7. `@types/node` stays on Node 22 to match the runtime baseline.
The package-local `pnpm-workspace.yaml` records pnpm's exact-version release-age
exceptions for the selected typescript-eslint release; it does not introduce a
multi-package workspace.

`check:package` packs once into a temporary directory and verifies the actual
tarball with publint, Are the Types Wrong, Node ESM/CommonJS consumers, TypeScript
NodeNext/bundler consumers, and a Vite browser build that rejects Node builtins.
It requires `tar` on the development machine. Temporary files are removed after
the check. Set `LOQUE_PACKAGE_ARTIFACT_DIR` to keep the verified `loque.tgz` for
testing on another runtime:

```sh
node scripts/check-package.mjs --runtime-only /path/to/loque.tgz
```

`pnpm pack` builds fresh output through `prepack`; publishing also runs `verify`.
The GitHub Actions workflow verifies Node 22, 24, and 26, then tests the packed
artifact on Node 22.0.0 without installing build tools on that older runtime.

## Runtime architecture

The source has three layers: state (JSON snapshots, selection, and plans),
intelligence (judgments answered by evaluators), and policy (queries that
threshold those answers and choose edits):

- `json.ts` validates and copies JSON, handles pointers, and shares navigation and equality rules.
- `ir.ts` validates versioned query structures and locates judgment expressions; `query.ts` builds the same immutable IR.
- `evaluate.ts` implements traversal, sort/skip/limit, and three-valued predicate evaluation.
  Unevaluated judgments are `Pending`, and `and`/`or` drop pending judgments once a sibling decides the result.
- `mutation.ts` validates intents and targets, compiles patches, and applies generated operations.
- `snapshot.ts` owns the frozen state, rejects judged queries synchronously, and binds selections/plans to it.
- `decision.ts` validates outcome definitions, probability distributions, and provenance; it derives immutable decision results.
- `judgment.ts` defines judgments (name, version, evaluator, decision, instructions, projection) and `ruleEvaluator`.
- `canonical.ts` serializes JSON per RFC 8785 and hashes it with WebCrypto SHA-256.
- `cache.ts` provides the in-memory decision cache.
- `runtime.ts` is the planner. For each `where` step it:
  1. evaluates deterministic parts;
  2. collects pending judgments from undecided nodes;
  3. deduplicates them by judgment and canonical projected input;
  4. reads the cache, enforces the budget, and groups the misses by evaluator and input hash;
  5. calls evaluators in `maxBatchSize` batches;
  6. verifies each answer's provenance, then re-evaluates the step.

  It also produces `explain` reports.
- `types.ts`, `errors.ts`, and `index.ts` define the public contract.

Selections never traverse a partially updated document. Mutation application is
internal and accepts only generated operations. The public API does not ingest
arbitrary patches or attach a plan to a different snapshot.

Evaluators supply probabilities; they cannot choose targets or edits. Queries
name judgments rather than embedding prompts or providers, so serialized IR
stays portable across runtimes. Portable decision data contains only the
distribution and provenance. A definition reconstructs derived values and
methods when parsing it. Provider adapters, such as one for Jev, belong in
separate packages that implement `Evaluator`; the core has no runtime dependencies.

## Verification contract

Behavior tests cover JSON ownership/validation, nested traversal, predicates,
sorting and paging, portable IR, mutation plans, escaped pointers, safe property
handling, and immutable application. Runtime tests cover:
- deterministic pushdown and `or` pruning;
- per-object batching and deduplication of equal projections;
- `maxBatchSize` splitting, cache reuse, and budgets;
- aborts, evaluator failures, and forged provenance;
- static validation of judgment references, and `explain` counts.

Decision tests cover distribution completeness, numeric
validation, tie-breaking, expected scores, provenance, ownership, and JSON round
trips. The compiler also has direct conflict tests because the current
downward-only traversal cannot produce overlapping targets.

Coverage includes all production TypeScript, excluding tests. Required floors are
90% statements, lines, and functions, and 85% branches. Lint rejects explicit `any`, unused
variables, and empty functions.

Consumer fixtures exercise the packed ESM and CommonJS APIs, portable-query
round trips, mutation application, decision results, the judgment runtime with a
cache, and errors. Type fixtures
cover readonly results, required narrowing, invalid query/mutation arguments,
and inferred decision outcomes. The browser fixture selects and updates data,
computes an expected score, and runs a judged query using WebCrypto, all without
Node builtins.

`check:docs` concatenates the README's TypeScript examples into one module.
Types resolve against `source/`. It type-checks that module, bundles and runs it,
and asserts every `expression; // value` result the README shows. It also
requires the repository README to match the package README, apart from the
development-guide link. All verification commands
must leave tracked source and the lockfile unchanged.

See the package README for the public API, worked examples, JSON data contract,
and query/patch formats.
