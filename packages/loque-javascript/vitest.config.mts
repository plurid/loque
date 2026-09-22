import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['source/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['source/**/*.ts'],
            exclude: ['source/**/__tests__/**'],
            reporter: ['text', 'html', 'json-summary'],
            thresholds: {
                statements: 63,
                branches: 51,
                functions: 64,
                lines: 62,
            },
        },
    },
});
