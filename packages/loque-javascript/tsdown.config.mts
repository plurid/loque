import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['source/index.ts'],
    outDir: 'distribution',
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2022',
    fixedExtension: true,
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    cjsDefault: false,
});
