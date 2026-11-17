import js from "@eslint/js";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { defineConfig } from "eslint/config";

// Same rule set as upstream Zapatos 6.6.1, ported to native flat config.
// `member-delimiter-style` and `semi` moved from typescript-eslint to @stylistic in v8.
// `ecmaVersion: 5` is dropped: it had no effect with the TypeScript parser.

export default defineConfig(
  js.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts"],
    settings: importPlugin.flatConfigs.typescript.settings,
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "@stylistic": stylistic,
      import: importPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        globalThis: false,
      },
      parser: tseslint.parser,
      sourceType: "module",
      parserOptions: {
        project: "tsconfig.json",
      },
    },
    rules: {
      "import/no-self-import": "warn",
      "import/no-cycle": "warn",
      "curly": ["error", "multi-line"],
      "no-template-curly-in-string": "error",
      "prefer-const": "error",
      "prefer-object-spread": "error",
      "radix": "error",
      "no-irregular-whitespace": ["error", {
        "skipComments": true,
      }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        "varsIgnorePattern": "^_",
      }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@stylistic/member-delimiter-style": ["error", {
        "multiline": {
          "delimiter": "semi",
          "requireLast": true,
        },
        "singleline": {
          "delimiter": "semi",
          "requireLast": false,
        },
      }],
      "@stylistic/semi": ["error", "always"],
      // pgcast's own: tsc copies an import into the `.d.ts` it ships as written, and TypeScript 4.1 to 4.4 cannot parse
      // `import { type X }` there (TS1005), `skipLibCheck` or not (#584).
      "no-restricted-syntax": ["error", {
        "selector": "ImportSpecifier[importKind='type'], ExportSpecifier[exportKind='type']",
        "message": "Write `import type { … }` (or `export type { … }`) apart from the values: tsc copies this line into the shipped `.d.ts`, and TypeScript 4.1 to 4.4 cannot parse `{ type X }` there (TS1005).",
      }],
    },
  },
  // The scripts and the docs site's code, outside the library: ES modules, with the recommended rules only, and Node's
  // globals for the `.mjs` scripts.
  {
    files: ["scripts/*.mjs", "website/*.mjs", "website/*.ts", "website/.vitepress/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["website/*.ts", "website/.vitepress/**/*.ts"],
    extends: [tseslint.configs.eslintRecommended],  // `no-undef` off: `tsc -p website/.vitepress` checks the names
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
);
