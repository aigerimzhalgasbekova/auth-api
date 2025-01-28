import typescriptEslint from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-plugin-prettier";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/build/", "**/dist/", "**/coverage/", "**/*.js"],
}, ...compat.extends(
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
), {

    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
        "@typescript-eslint": typescriptEslint,
        prettier,
    },

    languageOptions: {
        globals: {
            ...Object.fromEntries(Object.entries(globals.commonjs).map(([key]) => [key, "off"])),
            ...globals.node,
            ...globals.mocha,
            ...globals.jest,
            Atomics: "readonly",
            SharedArrayBuffer: "readonly",
        },

        parser: tsParser,
        ecmaVersion: 2022,

        parserOptions: {
            tsconfigRootDir: __dirname,
            project: ["./tsconfig.json", "./tests/tsconfig.json"],
        },
    },

    rules: {
        "prettier/prettier": 2,
        eqeqeq: "warn",
    },
    ignores: ['build/', 'dist/', 'coverage/', '*.js'],
}];