# Naming, imports and barrel files

- [import-no-aggregating-barrel](#import-no-aggregating-barrel)
- [import-no-mixed-barrel](#import-no-mixed-barrel)
- [import-single-index (Convention)](#import-single-index-convention)
- [import-siblings-by-path](#import-siblings-by-path)
- [import-alias](#import-alias)
- [name-react-rules](#name-react-rules)
- [name-file-case (Convention)](#name-file-case-convention)

## import-no-aggregating-barrel

**HIGH.** In application code, do not create a folder-level `index.ts` that re-exports many
modules (`components/index.ts`, `features/x/index.ts` with `export *`). Importing one name from
it makes the bundler and dev server load every module it re-exports. One Next.js app went from
about 11k to 3.5k loaded modules (68% fewer) after removing such files. Barrels also invite
circular imports. `optimizePackageImports` fixes this only for listed third-party packages.

**Incorrect:**

```ts
// components/index.ts
export * from './Button';
export * from './DataGrid';      // heavy
export * from './Chart';         // heavy

// anywhere
import { Button } from '@/components';
```

**Correct:**

```ts
import { Button } from '@/components/Button';
```

Feature-Sliced Design is the exception: its per-slice `index.ts` public API is mandatory by
design. Use FSD's own linter to control the cost.

## import-no-mixed-barrel

**HIGH** (RSC). Never re-export server-only and client modules from the same file. A client
import pulls the whole file across the boundary: server components get treated as client
components, or server-only code leaks. If a slice must expose both, split the entry points
(for example `index.ts` and `index.server.ts`).

## import-single-index (Convention)

A per-component `index.ts` whose only content is a re-export of that one component
(`export { Card } from './Card'`) lets callers import the folder (`@/…/Card`) instead of
`@/…/Card/Card`. It costs one extra module and is **not** an aggregating barrel. Sources differ:
Comeau and Wieruch use it, while TkDodo and Bulletproof avoid all index files in app code.

**Default:** allowed, if it re-exports exactly one component and never uses `export *`. If the
project already uses or bans it, follow the project.

## import-siblings-by-path

**MEDIUM.** Inside a folder, import siblings by their file path (`./helpers`, `./SubPart`), never
through the folder's own `index`. Importing through the folder's own entry point is the
classic source of import cycles.

## import-alias

**MEDIUM.** Use one path alias, usually `@/` for `src/`, for imports that cross folders, and
relative paths for siblings in the same folder. Avoid `../../../`. More than one `../` usually
means the import should use the alias, or that the code is in the wrong place.

Order import groups consistently: built-ins, external packages, `@/` internal modules, then
relative imports. Let a linter (`import/order`) or a formatter do the ordering, not reviewers.

## name-react-rules

**MEDIUM.** React's own naming rules:

| Thing | Rule | Example |
|---|---|---|
| Component | PascalCase; must start with a capital letter | `FindingRow` |
| Hook | `use` + capital letter, and only if it calls hooks | `useFindingFilter` |
| Event handler (inside a component) | `handle` + event | `handleSelect` |
| Handler prop | `on` + event | `onSelect` |
| Next.js routing files | reserved lowercase names | `page.tsx`, `layout.tsx` |
| Private or grouping folders in `app/` | `_name` / `(name)` | `_components`, `(marketing)` |

Name a file or folder by what it is (`invoice-totals.ts`), not by its category (`misc.ts`,
`stuff/`). Boolean `is`/`has`/`should` prefixes are a common convention; no source mandates
them.

## name-file-case (Convention)

Sources disagree:

- PascalCase component files (Airbnb);
- kebab-case for every file (Bulletproof, enforced with `eslint-plugin-check-file`);
- snake_case (Google).

**Default:** PascalCase `.tsx` for component files, kebab-case for every other `.ts` file.
Whichever case the project picks, enforce it with a lint rule so it never comes up in review.
Some macOS and Windows file systems are case-insensitive, so renaming a file only by case
needs a two-step `git mv`.

Sources: TkDodo "Please Stop Using Barrel Files"; Marvin Hagemeister "The barrel file
debacle"; Vercel "How we optimized package imports"; Next.js `optimizePackageImports`;
Feature-Sliced Design "Public API" and "Usage with Next.js"; Josh Comeau; Robin Wieruch;
Bulletproof React "Project standards"; react.dev "Reusing Logic with Custom Hooks" and
"Responding to Events"; Airbnb React/JSX Style Guide; Google TypeScript Style Guide;
`eslint-plugin-import` `order`. The links are in the skill's [README](../README.md#sources).
