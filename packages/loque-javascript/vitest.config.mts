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
                statements: 90,
                branches: 85,
                functions: 90,
                lines: 90,
            },
        },
    },
});
