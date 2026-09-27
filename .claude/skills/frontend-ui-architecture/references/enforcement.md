# Enforcing the structure with lint

Rules that live only in prose drift. Once a structure is agreed, encode the load-bearing rules
as lint errors. This file lists the tools and a minimal configuration. Check versions in the
project before copying them: the tool landscape changes quickly.

## What to enforce first

| Rule | Tool |
|---|---|
| `struct-one-way`, `struct-no-cross-feature` | `import/no-restricted-paths` (or `import-x`), `eslint-plugin-boundaries`, or `dependency-cruiser` |
| cycles (often caused by barrels) | `import/no-cycle`, or `dependency-cruiser` `no-circular` |
| `split-no-nested-definitions`, `split-pure` | `eslint-plugin-react-hooks` `recommended` (`static-components`, `purity`, …) |
| `name-file-case` | `eslint-plugin-check-file` |
| `import-alias` ordering | `import/order` |
| dead files and exports left after refactors | `knip` (its Next.js plugin knows the App Router entry files) |

ESLint's core `no-restricted-imports` matches import strings only. It cannot tell *which file*
is importing, so it cannot express "features must not import other features".

## Minimal flat config (Next.js)

`next lint` was removed in Next.js 16. Run the ESLint CLI with a flat `eslint.config.mjs`.

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import importX from 'eslint-plugin-import-x';

const features = ['auth', 'billing', 'reviews']; // keep in sync with src/features/*

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-cycle': 'error',
      'import-x/no-restricted-paths': ['error', {
        zones: [
          // no feature imports another feature
          ...features.map((f) => ({
            target: `./src/features/${f}`,
            from: './src/features',
            except: [`./${f}`],
          })),
          // features and shared code never import app/
          { target: './src/features', from: './src/app' },
          // shared code never imports features or app/
          {
            target: ['./src/components', './src/hooks', './src/lib', './src/utils', './src/config', './src/types'],
            from: ['./src/features', './src/app'],
          },
        ],
      }],
    },
  },
  globalIgnores(['.next/**', 'node_modules/**']),
]);
```

This follows Bulletproof React's approach: one zone per feature plus one-way zones. It needs a
TypeScript import resolver so that `@/` paths resolve.

## Alternatives

- **dependency-cruiser** expresses "no cross-feature imports" as one rule with a capture group,
  instead of one zone per feature, and adds orphan and cycle reports:

  ```js
  { name: 'no-cross-feature', severity: 'error',
    from: { path: '^src/features/([^/]+)/' },
    to:   { path: '^src/features/([^/]+)/', pathNot: '^src/features/$1/' } }
  ```

- **eslint-plugin-boundaries** models element types (app, feature, shared) and which may import
  which, including entry-point-only access to a feature.
- **Steiger** is the official Feature-Sliced Design linter. Use it if, and only if, the project
  follows FSD. It is still in beta.

## Where the rules should also live

A skill loads on demand, while project docs such as `CLAUDE.md` are always in context. Put the
few rules that must never be broken (no cross-feature imports, no aggregating barrels, no
nested component definitions) both in the lint config and in the project's always-loaded
docs. Keep the rationale and examples in this skill.

Sources: Bulletproof React `.eslintrc.cjs`; `eslint-plugin-import` / `eslint-plugin-import-x`
rule docs; `eslint-plugin-boundaries`; `dependency-cruiser` rules reference; Steiger; knip;
react.dev `eslint-plugin-react-hooks`; Next.js "ESLint" and the 15.5 release notes; ESLint
`no-restricted-imports`; Next.js "AI agents" guide. The links are in the skill's
[README](../README.md#sources).
