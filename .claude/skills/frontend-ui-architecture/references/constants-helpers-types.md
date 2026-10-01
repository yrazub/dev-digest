# Constants, helpers, utils and types

- [place-env-literal](#place-env-literal)
- [place-constants-local](#place-constants-local)
- [place-as-const](#place-as-const)
- [place-helper-not-hook](#place-helper-not-hook)
- [place-no-dumping-ground and place-lib-vs-utils](#place-no-dumping-ground-and-place-lib-vs-utils)
- [place-types-colocated and place-schema-type-name](#place-types-colocated-and-place-schema-type-name)

## place-env-literal

**CRITICAL** (Next.js). `NEXT_PUBLIC_*` values are inlined at build time, and only literal
property access is replaced. Dynamic lookups and destructuring come out `undefined` in the
browser.

**Incorrect:**

```ts
const { NEXT_PUBLIC_API_BASE } = process.env;
const get = (name: string) => process.env[name];
```

**Correct:** read every variable once, literally, in a single config module.

```ts
// config/env.ts
export const env = {
  apiBase: process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001',
} as const;
```

Server-only secrets never get the `NEXT_PUBLIC_` prefix and are read only in server code.

## place-constants-local

**HIGH.** A constant lives where it is used and moves only as far as its consumers require:

| Scope | Location |
|---|---|
| one component | top of that file, or the component folder's `constants.ts` |
| one feature | `features/<f>/constants.ts` (or the feature's `config`) |
| whole app (env, feature flags, app-wide limits) | `config/` |

Declare constants at module level, never inside a component body, where they would be
re-created on every render. Name module-level constants in `CONSTANT_CASE`
(`MAX_VISIBLE_FINDINGS`). A named constant replaces every unexplained magic number or string
in logic. Obvious values such as `0`, `1` and `''` stay inline.

**Incorrect:** a global `src/constants.ts` that holds page sizes, colour maps, route names and
retry counts for every feature.
**Correct:** each feature owns its own constants, and `config/` keeps only the app-wide ones.

## place-as-const

**HIGH.** Use an `as const` object, or an enum from the runtime schema library, not a
TypeScript `enum`. Enums have reverse mappings and nominal typing, and TS 5.8's
`erasableSyntaxOnly` rejects them.

```ts
// Incorrect
enum Severity { Critical = 'CRITICAL', Warning = 'WARNING' }

// Correct
export const SEVERITY = { CRITICAL: 'CRITICAL', WARNING: 'WARNING' } as const;
export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY];

// Correct, when values come from an API contract
export const Severity = z.enum(['CRITICAL', 'WARNING']);
export type Severity = z.infer<typeof Severity>;
```

If a contract already defines the enum, import it. Never redeclare it locally.

## place-helper-not-hook

**HIGH.** Only a function that calls hooks is a hook and takes the `use` prefix. Everything
else is a helper: a plain function named after what it does.

```ts
// Incorrect — calls no hooks
export function useSortedFindings(list: Finding[]) { return [...list].sort(bySeverity); }

// Correct
export function sortFindings(list: Finding[]) { return [...list].sort(bySeverity); }
```

Helpers are pure where possible: input in, output out, no React and no I/O. That keeps them
unit-testable without rendering.

## place-no-dumping-ground and place-lib-vs-utils

**HIGH.** A shared `utils/` folder rots into a grab-bag unless each module has one focus.

- Name files by subject: `utils/format-currency.ts`, `utils/date-range.ts`. Never
  `utils/helpers.ts`, `utils/misc.ts` or `utils/index.ts` holding forty functions.
- A function enters `utils/` only after passing `struct-promote`, meaning it has two or more real
  consumers across features.
- A function that encodes business rules is domain logic, not a utility. It belongs with its
  feature (see [logic-and-data.md](logic-and-data.md)).

**MEDIUM.** Keep this split between the shared folders:

| Folder | Holds |
|---|---|
| `lib/` | configured third-party or infrastructure wrappers: API client, query client, i18n setup, logger |
| `utils/` | small, generic, pure functions with no knowledge of the product |
| `helpers.ts` (colocated) | pure functions that serve one component or feature |

The words "helper" and "util" have no official definition. The table above is one common
reading. If the project uses a different one, follow the project.

## place-types-colocated and place-schema-type-name

**MEDIUM.** Types sit next to the code that uses them, either inline or in a sibling `types.ts`.
A top-level `types/` folder holds only types used across the whole app. Types for data that
crosses an API boundary come from the shared contract, never from a local copy.

Write types in ordinary `.ts` files, not hand-written `.d.ts` files. `skipLibCheck` silently
skips those, and `declare global` creates implicit dependencies.

When a runtime schema exists, the schema and its inferred type share one name:

```ts
export const Finding = z.object({ id: z.string(), severity: Severity });
export type Finding = z.infer<typeof Finding>;
```

Sources: Next.js "Environment variables"; TypeScript Handbook "Enums"; Matt Pocock ("Why I
don't like enums", "erasableSyntaxOnly", "Total TypeScript Essentials"); Google TypeScript Style
Guide; react.dev "Reusing Logic with Custom Hooks"; Bulletproof React; Feature-Sliced Design
"Layers"; Kent C. Dodds "AHA Programming"; zod.dev. The links are in the skill's
[README](../README.md#sources).
