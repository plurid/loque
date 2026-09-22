import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

// The README's TypeScript examples form one module, in order: later examples reuse
// earlier variables. Type-check and run that module against the current source, and
// assert documented results: `expression; // value` or `expression;` followed by a
// comment block containing only a JavaScript value.
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const source = join(packageRoot, 'source/index.ts');
const readme = await readFile(join(packageRoot, 'README.md'), 'utf8');

const localLink = '[development guide](packages/loque-javascript/DEVELOPMENT.md)';
const packageLink = '[development guide](https://github.com/plurid/loque/blob/master/packages/loque-javascript/DEVELOPMENT.md)';
const root = await readFile(join(packageRoot, '../../README.md'), 'utf8');
assert.ok(readme.includes(packageLink), 'The package README must link to the published development guide');
assert.equal(root.replace(localLink, packageLink), readme,
    'The repository README must match the package README apart from the development guide link');

const blocks = [...readme.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map(match => match[1]);
assert.ok(blocks.length > 0, 'Expected TypeScript examples in the README');

function isValue(text) {
    try {
        // Constructing a function parses without evaluating.
        new Function(`return (${text});`);
        return true;
    } catch {
        return false;
    }
}

// A complete expression statement on one line; continuations and declarations are skipped.
const statement = /^(\s*)(?!const |let |import |export |console\.|if |for |return |\/\/|[).\]}])(\S.*);$/;
let assertions = 0;
function instrument(block) {
    const lines = block.split('\n');
    const output = [];
    for (let index = 0; index < lines.length; index += 1) {
        const inline = lines[index].match(/^(.*;)\s+\/\/ (.+)$/);
        const code = inline ? inline[1] : lines[index];
        const match = code.match(statement);
        let expected;
        let end = index;
        if (match && inline && isValue(inline[2])) {
            expected = inline[2];
        } else if (match && !inline) {
            const comments = [];
            while (/^\s*\/\/ ?/.test(lines[end + 1] ?? '')) comments.push(lines[++end].replace(/^\s*\/\/ ?/, ''));
            if (comments.length > 0 && isValue(comments.join('\n'))) expected = comments.join('\n');
            else end = index;
        }
        if (expected === undefined) {
            output.push(lines[index]);
            continue;
        }
        assertions += 1;
        output.push(`${match[1]}__expect(${match[2]}, ${expected.replaceAll('\n', ' ')}, ${JSON.stringify(match[2])});`);
        index = end;
    }
    return output.join('\n');
}
const temporary = await mkdtemp(join(tmpdir(), 'loque-readme-'));

try {
    const module = join(temporary, 'readme.ts');
    const prelude = 'const __expect = (globalThis as any).__readmeExpect as '
        + '(actual: unknown, expected: unknown, source: string) => void;\n';
    await writeFile(module, `${prelude}${blocks.map(instrument).join('\n')}\nexport {};\n`);
    assert.ok(assertions >= 40, `Expected documented results to check; found ${assertions}`);
    const config = join(temporary, 'tsconfig.json');
    await writeFile(config, JSON.stringify({
        compilerOptions: {
            target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'],
            strict: true, noEmit: true, types: [], paths: { '@plurid/loque': [source] },
        },
        files: [module],
    }));
    const compiler = spawnSync(process.execPath,
        [join(packageRoot, 'node_modules/typescript/bin/tsc'), '-p', config], { encoding: 'utf8' });
    assert.equal(compiler.status, 0, `README examples do not type-check:\n${compiler.stdout}${compiler.stderr}`);

    const { build } = await import('vite');
    const output = join(temporary, 'out');
    await build({
        configFile: false,
        root: temporary,
        logLevel: 'warn',
        resolve: { alias: { '@plurid/loque': source } },
        build: {
            target: 'es2022',
            outDir: output,
            emptyOutDir: true,
            lib: { entry: module, formats: ['es'], fileName: () => 'readme.mjs' },
        },
    });
    const log = console.log;
    console.log = () => undefined;
    globalThis.__readmeExpect = (actual, expected, source) => {
        assert.deepStrictEqual(JSON.parse(JSON.stringify(actual ?? null)), expected ?? null,
            `README result differs for ${source}`);
    };
    try {
        await import(pathToFileURL(join(output, 'readme.mjs')).href);
    } finally {
        console.log = log;
    }
    console.log(`README: ${blocks.length} TypeScript examples type-check and run; ${assertions} documented results match`);
} finally {
    await rm(temporary, { recursive: true, force: true });
}
