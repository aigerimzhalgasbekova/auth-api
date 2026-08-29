/**
 * Shared ESLint base configuration.
 *
 * Because each package manages its own node_modules, the dependencies
 * (@eslint/js, typescript-eslint, eslint-plugin-prettier) must be
 * passed in by the caller so that Node resolves them from the correct
 * package directory.
 */
export function createBaseConfig({ eslint, tseslint, prettierPlugin }) {
    return [
        {
            ignores: ['build/**', 'dist/**', 'coverage/**', '*.js', '*.mjs'],
        },
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        prettierPlugin,
        {
            rules: {
                'prettier/prettier': 'error',
                eqeqeq: 'warn',
                // rest destructuring is how fields are omitted from an object
                '@typescript-eslint/no-unused-vars': [
                    'error',
                    { ignoreRestSiblings: true },
                ],
            },
        },
    ];
}
