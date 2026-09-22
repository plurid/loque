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

## Current baseline and follow-up

The 12 existing assertion-bearing unit tests are preserved. Nested extraction is
an explicit TODO because traversal is not implemented. Coverage includes all
production TypeScript, rather than only the public barrel. Thresholds are the
initial measured percentages rounded down: statements 63%, branches 51%,
functions 64%, and lines 62%. They should rise as behavior tests are added.
Explicit `any` and unused scaffolding remain allowed by lint during
this tooling migration; strict TypeScript checking remains enabled.

The next phase must define query behavior before changing implementation:
comparison operators, literal types, nested paths, cursor pagination, errors,
and `&`/`|` semantics. The current README uses `id:1 & id:2` to combine matches;
conventional boolean AND must not be assumed. That contract will guide shared
selection logic, parser validation, public-type improvements, regression tests,
and updates to the API documentation.
