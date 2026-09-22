import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimeOnly = process.argv[2] === '--runtime-only';
assert.ok(process.argv.length === 2 || (runtimeOnly && process.argv.length === 4),
    'Usage: node scripts/check-package.mjs [--runtime-only package.tgz]');
const temporary = await mkdtemp(join(tmpdir(), 'loque-package-'));

function run(command, args, cwd = packageRoot, capture = false) {
    const result = spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0,
        `${command} ${args.join(' ')} failed${capture ? `\n${result.stderr}` : ''}`);
    return result.stdout;
}

try {
    const tarball = runtimeOnly ? resolve(process.argv[3]) : join(temporary, 'loque.tgz');
    if (!runtimeOnly) {
        // prepack builds fresh output. No consumer dependency installation is needed.
        run('pnpm', ['pack', '--out', tarball]);
    }

    const entries = run('tar', ['-tzf', tarball], packageRoot, true).trim().split('\n');
    assert.ok(entries.every((entry) => /^package\/(distribution\/|package\.json$|README\.md$|LICENSE(?:\.deon)?$)/.test(entry)),
        'The tarball must contain only distribution files, package metadata, README, and licenses');
    assert.ok(entries.every((entry) => !entry.includes('__tests__') && !entry.includes('.test.')),
        'Tests must not be published');

    const consumer = join(temporary, 'consumer');
    const installedPackage = join(consumer, 'node_modules', '@plurid', 'loque');
    await mkdir(installedPackage, { recursive: true });
    run('tar', ['-xzf', tarball, '-C', installedPackage, '--strip-components', '1']);
    await cp(join(packageRoot, 'tests/package'), consumer, { recursive: true });
    run(process.execPath, [join(consumer, 'runtime.mjs')], consumer);

    if (!runtimeOnly) {
        run('pnpm', ['exec', 'publint', tarball, '--strict']);
        run('pnpm', ['exec', 'attw', tarball, '--no-definitely-typed']);

        const compiler = join(packageRoot, 'node_modules/typescript/bin/tsc');
        for (const [module, moduleResolution, files] of [
            ['NodeNext', 'NodeNext', ['types.mts', 'types.cts']],
            ['ESNext', 'Bundler', ['types.mts']],
        ]) {
            const config = join(consumer, `tsconfig.${moduleResolution}.json`);
            await writeFile(config, JSON.stringify({
                compilerOptions: {
                    target: 'ES2022', module, moduleResolution,
                    strict: true, noEmit: true, types: [],
                },
                files,
            }));
            run(process.execPath, [compiler, '-p', config], consumer);
            console.log(`${moduleResolution}: consumer type checks passed`);
        }

        // A real browser build rejects Node builtins instead of silently polyfilling them.
        const { build } = await import('vite');
        const browserDirectory = join(temporary, 'browser');
        await build({
            configFile: false,
            root: consumer,
            logLevel: 'warn',
            plugins: [{
                name: 'reject-node-builtins',
                enforce: 'pre',
                resolveId(id) {
                    assert.ok(!isBuiltin(id), `Browser bundle imports Node builtin ${id}`);
                    return null;
                },
            }],
            build: {
                target: 'es2022',
                outDir: browserDirectory,
                emptyOutDir: true,
                lib: { entry: join(consumer, 'browser.mjs'), formats: ['es'], fileName: () => 'index.mjs' },
            },
        });
        const browser = await import(pathToFileURL(join(browserDirectory, 'index.mjs')).href);
        assert.deepEqual(browser.selected, { id: '1', value: 'one' });
        assert.deepEqual(browser.updated, { records: [{ id: '1', value: 'one', reviewed: true }] });

        const manifest = JSON.parse(await readFile(join(installedPackage, 'package.json'), 'utf8'));
        assert.equal(manifest.engines.node, '>=22');
        for (const field of ['main', 'module', 'types']) {
            await readFile(join(installedPackage, manifest[field]));
        }

        if (process.env.LOQUE_PACKAGE_ARTIFACT_DIR) {
            const destination = resolve(process.env.LOQUE_PACKAGE_ARTIFACT_DIR, 'loque.tgz');
            await mkdir(dirname(destination), { recursive: true });
            await cp(tarball, destination);
        }
        console.log('Packed package: contents, exports, types, and browser bundle checks passed');
    }
} finally {
    await rm(temporary, { recursive: true, force: true });
}
