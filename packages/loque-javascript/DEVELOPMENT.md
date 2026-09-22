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
| `pnpm check:package` | Build, pack, and check isolated consumer fixtures |
| `pnpm verify` | Run lint, types, coverage, and package checks |

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

The source is organized around a single JSON selection pipeline:

- `json.ts` validates and copies JSON, handles pointers, and shares navigation and equality rules.
- `ir.ts` validates versioned query structures; `query.ts` builds the same immutable IR.
- `evaluate.ts` selects snapshot nodes with deterministic traversal and predicates.
- `mutation.ts` validates intents and targets, compiles patches, and applies generated operations.
- `snapshot.ts` owns the frozen state and binds selections/plans to it.
- `types.ts`, `errors.ts`, and `index.ts` define the public contract.

Selections never traverse a partially updated document. Mutation application is
internal and accepts only generated operations. The public API does not ingest
arbitrary patches or attach a plan to a different snapshot.

## Verification contract

Behavior tests cover JSON ownership/validation, nested traversal, predicates,
portable IR, mutation plans, escaped pointers, safe property handling, and
immutable application. The compiler also has direct conflict tests because the
current downward-only traversal cannot produce overlapping targets.

Coverage includes all production TypeScript, excluding tests. Required floors are
90% statements, lines, and functions, and 85% branches. Lint rejects explicit `any`, unused
variables, and empty functions.

Consumer fixtures exercise the packed ESM and CommonJS APIs, portable-query
round trips, mutation application, and errors. Type fixtures cover readonly
results, required narrowing, and invalid query/mutation arguments. The browser
fixture selects and updates data without Node builtins. All verification commands
must leave tracked source and the lockfile unchanged.

See the package README for the public API, worked examples, JSON data contract,
and query/patch formats.
