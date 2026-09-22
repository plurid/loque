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
            // Preserve the existing allowances until the runtime/type redesign.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-empty-function': 'off',
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
