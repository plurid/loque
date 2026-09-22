import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
    globalIgnores(['distribution/**', 'coverage/**', '.vitest/**', 'node_modules/**']),
    js.configs.recommended,
    {
        files: ['**/*.{ts,mts,cts}'],
        extends: [tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/no-empty-function': 'error',
        },
    },
    {
        files: ['tests/package/*.cts'],
        rules: {
            '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
        },
    },
    {
        languageOptions: {
            globals: { console: 'readonly' },
        },
    },
);
