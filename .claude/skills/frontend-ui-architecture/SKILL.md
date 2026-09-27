---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React and Next.js (App Router) apps — where components, hooks, constants, helpers/utils, types and business logic live; when and how to split a component; feature vs shared folders and one-way import rules; barrel/index.ts files; file naming and import style; enforcing boundaries with lint. Use when creating files or folders in a React/Next.js codebase, deciding where a piece of code belongs, extracting or splitting a component, moving code into a shared folder, reviewing a change for structure, or setting up architecture lint rules. Does not cover hook misuse, state anti-patterns or render performance — those belong to a React best-practices skill."
metadata:
  version: "1.0.0"
  updated: "2026-09-27"
---

# Frontend UI architecture

Rules for deciding **where frontend code lives and how it is cut into pieces**. They apply to
any React / Next.js App Router codebase.

**The project's own documents win.** If the repository documents a structure (a `CLAUDE.md`,
an architecture doc, an existing lint config), follow it and use this skill only for the
questions it leaves open. Items marked *Convention* below have no single right answer. Pick
one, write it down in the project, and apply it consistently.

## Core principles

1. **Colocate first.** Put code next to its only consumer: the same file, or a sibling file in
   the same folder. "Things that change together should be located as close as reasonable."
2. **Promote on real reuse.** Move code up to the *nearest common ancestor* only when a second
   real consumer appears, never in anticipation of one.
3. **Dependencies flow one way.** Import direction is `shared → features → app/routes`. Features
   never import each other; they are composed at the route or app level.
4. **Split on a named trigger, not by habit.** Extract a component, hook or helper when a concrete
   problem appears (see [component-splitting.md](references/component-splitting.md)).
5. **Logic has three homes.** Domain rules go in plain functions. React wiring goes in hooks.
   Server data goes in a server-state cache. Components receive data and callbacks and render.

## Where does this code go?

Answer these questions in order and stop at the first *yes*.

| # | Question | Put it… |
|---|---|---|
| 1 | Is it a routing file (`page`, `layout`, `route`, `loading`, `error`)? | in `app/`, and keep it thin: it composes, it does not compute |
| 2 | Is it used by exactly one component? | in that component's file or folder (`constants.ts`, `helpers.ts`, `types.ts`, `use-x.ts`) |
| 3 | Is it used by several components of one feature or route? | at the root of that feature (`features/<f>/…` or the route's `_components/`, `_lib/`) |
| 4 | Is it used by two or more features? | in the shared layer: `components/`, `hooks/`, `lib/`, `utils/`, `config/`, `types/` |
| 5 | Does it need a sibling feature's internals? | nowhere yet. Compose both features in the route, or move the shared part down into the shared layer |

Default layout, used only when the project has none:

```
src/
  app/                    routes only; route-private UI in app/**/_components/
  features/<feature>/     add once the app outgrows flat folders
    components/  hooks/  api/  lib/  constants.ts  types.ts
  components/             shared UI (primitives, layout chrome)
  hooks/                  shared hooks
  lib/                    configured libraries: API client, query client, i18n
  utils/                  small, pure, framework-free functions
  config/                 env access and app-wide constants
  types/                  only truly global types
```

Grow into this layout step by step rather than scaffolding it all at once. See
[folder-structure.md](references/folder-structure.md).

## Rules

Impact: **CRITICAL** (causes bugs or architecture rot), **HIGH** (causes scaling or
maintainability pain), **MEDIUM** (hurts readability), **LOW** (style). *Convention* marks a
choice to make once per project.

### Structure — [folder-structure.md](references/folder-structure.md)

| ID | Rule | Impact |
|---|---|---|
| `struct-one-way` | Imports go shared → features → app; never the reverse | CRITICAL |
| `struct-no-cross-feature` | A feature never imports another feature | CRITICAL |
| `struct-colocate` | Code starts next to its only consumer | HIGH |
| `struct-promote` | Promote to the nearest common ancestor on the second real consumer | HIGH |
| `struct-thin-routes` | Route files compose components; logic lives in components, hooks and helpers | HIGH |
| `struct-private-folders` | Non-route code inside `app/` goes in `_private` folders | MEDIUM |
| `struct-grow-by-size` | Move from flat folders to feature folders as the app grows, not before | MEDIUM |
| `struct-shallow` | Keep nesting at 3–4 levels or fewer below `src/` | LOW |
| `struct-feature-vs-type` | Feature folders vs type folders — *Convention* | — |

### Components — [component-splitting.md](references/component-splitting.md)

| ID | Rule | Impact |
|---|---|---|
| `split-no-nested-definitions` | Never define a component inside another component | CRITICAL |
| `split-pure` | Rendering is pure; side effects go in handlers or effects | CRITICAL |
| `split-on-trigger` | Split for reuse, re-render cost, tangled state, hard-to-test logic or a client boundary | HIGH |
| `split-client-leaves` | `'use client'` on small interactive leaves, not on whole pages | HIGH |
| `split-named-subcomponents` | Compound parts are named exports, not static properties (`Menu.Item`) | HIGH |
| `split-hooks-not-containers` | Use a custom hook or a Server Component instead of a container/presentational split | MEDIUM |
| `split-composition-order` | Props, then `children`/slots, then context | MEDIUM |
| `split-one-per-file` | One exported component per file; small private helpers may share it | MEDIUM |
| `split-size-limit` | Line or prop limits — *Convention*; no source gives a number | — |

### Constants, helpers, types — [constants-helpers-types.md](references/constants-helpers-types.md)

| ID | Rule | Impact |
|---|---|---|
| `place-env-literal` | Read `process.env.NEXT_PUBLIC_X` by literal property access only | CRITICAL |
| `place-constants-local` | A constant starts in its consumer's file or `constants.ts`, and moves to `config/` only when app-wide | HIGH |
| `place-as-const` | Use `as const` objects or schema enums, not TypeScript `enum` | HIGH |
| `place-no-dumping-ground` | Shared `utils/` holds focused modules, never a grab-bag `utils.ts` | HIGH |
| `place-helper-not-hook` | A function that calls no hooks is a helper, without the `use` prefix | HIGH |
| `place-lib-vs-utils` | `lib/` wraps configured libraries; `utils/` holds pure generic functions | MEDIUM |
| `place-types-colocated` | Types live next to their use; `types/` only for truly global types | MEDIUM |
| `place-schema-type-name` | A runtime schema and its inferred type share one name | MEDIUM |

### Logic, state and data — [logic-and-data.md](references/logic-and-data.md)

| ID | Rule | Impact |
|---|---|---|
| `logic-pure-domain` | Business rules are plain, framework-free, unit-tested functions | CRITICAL |
| `logic-no-effect-derivation` | Derive values during render and handle events in handlers; effects only sync external systems | CRITICAL |
| `logic-no-server-state-copy` | Never copy server data into `useState`; form initial values are the one exception | CRITICAL |
| `logic-one-data-path` | Pick one data-fetching approach and one API client per app | HIGH |
| `logic-hooks-wire` | Custom hooks connect domain functions to React and to data | HIGH |
| `logic-server-only` | Server-only data access is guarded with `import 'server-only'` | HIGH |
| `logic-state-ladder` | Place state as low as possible: derived → local → lifted → URL → context → store | HIGH |
| `logic-query-options` | Data modules export query-key factories and `queryOptions`; hooks stay thin | MEDIUM |
| `logic-layers-proportionate` | Add domain or gateway layers only when real client-side rules exist | MEDIUM |

### Naming and imports — [naming-and-imports.md](references/naming-and-imports.md)

| ID | Rule | Impact |
|---|---|---|
| `import-no-aggregating-barrel` | No folder-level `index.ts` that re-exports many modules in app code | HIGH |
| `import-no-mixed-barrel` | Never re-export server and client modules from one file | HIGH |
| `import-siblings-by-path` | Inside a folder, import siblings by file path, never through its own `index` | MEDIUM |
| `import-alias` | Use `@/` for cross-folder imports and relative paths for siblings | MEDIUM |
| `name-react-rules` | Components are PascalCase, hooks `useX`, handlers `handleX`, handler props `onX` | MEDIUM |
| `name-file-case` | File-name case — *Convention*; enforce it with a linter | — |
| `import-single-index` | A one-line per-component `index.ts` — *Convention* | — |

### Enforcement — [enforcement.md](references/enforcement.md)

Once a structure is agreed, encode `struct-one-way`, `struct-no-cross-feature`,
`import-no-aggregating-barrel` and cycles as lint rules. A rule that only lives in prose drifts.

## How to apply

- **Writing code:** walk the "Where does this code go?" table before creating any file.
  Name any new folder by what it contains (`invoice-totals.ts`), not by what kind of thing it is
  (`misc.ts`).
- **Reviewing:** check CRITICAL and HIGH rules first. Cite the rule ID and the reference file,
  for example: "`struct-no-cross-feature`: `features/billing` imports `features/auth/hooks`."
- **Refactoring:** move code one rung at a time: file → folder → feature → shared. Update imports
  in the same change, and never leave a re-export shim at the old path.
- **Conventions:** if the project has not picked one, pick the default given in the reference
  file, say that you did, and suggest recording it in the project's docs.
