import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import { createBaseConfig } from '../eslint.config.base.mjs';

const baseConfig = createBaseConfig({ eslint, tseslint, prettierPlugin });

export default tseslint.config(
    {
        ignores: ['cdk.out/**'],
    },
    ...baseConfig,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
);
