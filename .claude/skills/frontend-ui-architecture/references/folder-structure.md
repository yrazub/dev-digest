# Folder structure

- [What the frameworks say](#what-the-frameworks-say)
- [Growing the structure by size](#growing-the-structure-by-size)
- [struct-one-way and struct-no-cross-feature](#struct-one-way-and-struct-no-cross-feature)
- [struct-colocate and struct-promote](#struct-colocate-and-struct-promote)
- [struct-thin-routes and struct-private-folders](#struct-thin-routes-and-struct-private-folders)
- [The component folder](#the-component-folder)
- [struct-feature-vs-type (Convention)](#struct-feature-vs-type-convention)

## What the frameworks say

Neither React nor Next.js prescribes a layout. React's legacy FAQ lists "group by feature or
route" and "group by file type", suggests a nesting limit of three or four folders, and says
"don't spend more than five minutes" on the choice. Next.js calls itself "unopinionated" and
documents three strategies:

1. project files outside `app/`, with `app/` used purely for routing;
2. project files in top-level folders inside `app/`;
3. project files split by feature or route, colocated next to the segment that uses them.

All three are legitimate. What matters is that one is chosen and kept.

## Growing the structure by size

Do not scaffold a large-app structure on day one. Move up a stage only when the current one
hurts.

| Stage | Shape | Move on when… |
|---|---|---|
| 1 | One file per component, flat `components/` | files collect private helpers and tests |
| 2 | A folder per component (`Name/Name.tsx`, siblings) | `components/` holds dozens of unrelated folders |
| 3 | Technical folders: `components/`, `hooks/`, `lib/`, `utils/` | components cluster around distinct product areas |
| 4 | `features/<feature>/` plus a shared layer | `features/` passes about ten entries |
| 5 | Domain groups of features | — |

Feature-Sliced Design (app › pages › widgets › features › entities › shared) is a formalised
stage 4–5. Adopt it deliberately and with its linter, or not at all. In Next.js it clashes
with `app/` (its layers must be renamed `_app`/`_pages`) and with colocating UI inside route
folders.

## struct-one-way and struct-no-cross-feature

**CRITICAL.** Imports flow in one direction only:

```
shared (components/, hooks/, lib/, utils/, config/, types/)
   ↓
features/<feature>/
   ↓
app/ (routes, layouts, providers)
```

- Shared code never imports from `features/` or `app/`.
- Features never import from `app/`.
- A feature never imports from another feature.

**Incorrect:**

```ts
// features/billing/components/InvoiceHeader.tsx
import { useCurrentUser } from '@/features/auth/hooks/use-current-user';
```

**Correct:** compose at the route, or move the shared piece down.

```tsx
// app/billing/page.tsx — the route composes both features
import { CurrentUserBadge } from '@/features/auth/components/CurrentUserBadge';
import { InvoiceHeader } from '@/features/billing/components/InvoiceHeader';

export default function BillingPage() {
  return <InvoiceHeader userSlot={<CurrentUserBadge />} />;
}
```

If two features both need `useCurrentUser`, it is not feature code. It belongs in the shared
layer (`hooks/use-current-user.ts`, or `lib/auth/`).

Why: sideways imports turn features into one tangled module, so no feature can be changed,
tested or deleted alone. Enforce this with lint; see [enforcement.md](enforcement.md).

## struct-colocate and struct-promote

**HIGH.** "Place code as close to where it's relevant as possible." Tests, styles, constants,
helpers, types and single-use hooks sit next to the component that uses them.

The moment a second, real consumer appears, promote the code to the **nearest common
ancestor** of both consumers. That is not automatically the global `utils/`:

| Consumers | Destination |
|---|---|
| one component | that component's file or folder |
| two components in one feature | `features/<f>/lib/` or `features/<f>/hooks/` |
| two components in one route | the route's `_components/` or `_lib/` |
| two features | the shared layer |

Do not promote on a *hypothetical* consumer. "Duplication is far cheaper than the wrong
abstraction": a small duplicate is cheaper than a shared helper grown to fit two callers that
disagree. Whether to promote on the second or the third use is a judgement call; no source
fixes the number.

**Incorrect:** a helper used only by `InvoiceTable` lives in `src/utils/format-invoice-row.ts`.
**Correct:** it lives in `InvoiceTable/helpers.ts`, and moves out when a second component
imports it.

## struct-thin-routes and struct-private-folders

**HIGH / MEDIUM.** A route file (`page.tsx`, `layout.tsx`) reads params, fetches or prefetches
at the top level where that is the chosen data path, and composes components. Filtering,
formatting, mapping and interaction logic live in components, hooks or helpers.

Anything non-routable inside `app/` goes in a folder prefixed with `_`, such as
`app/blog/_components/Post.tsx`. That opts the folder out of routing and separates UI logic
from routing logic. Use route groups `(group)` to organise segments without changing URLs.

```
app/reviews/
  page.tsx                   thin: composes <ReviewsTable/>
  _components/
    ReviewsTable/
      ReviewsTable.tsx
      ReviewsTable.test.tsx
      helpers.ts
      constants.ts
```

## The component folder

When a component outgrows one file, give it a folder. The common pattern:

```
Name/
  Name.tsx          the component (named export)
  Name.test.tsx     colocated test
  helpers.ts        pure functions used only here      (or Name.helpers.ts)
  constants.ts      constants used only here           (or Name.constants.ts)
  types.ts          types used only here, if non-trivial
  use-name-x.ts     a hook used only by this component
  SubPart.tsx       a private child component
```

Whether siblings are named `helpers.ts` or `Name.helpers.ts`, and whether the folder gets an
`index.ts`, are conventions; see [naming-and-imports.md](naming-and-imports.md). A private
child component that gains a second consumer is promoted like any other code.

## struct-feature-vs-type (Convention)

- **Feature/route grouping** (Bulletproof React, FSD, Next.js strategy 3, Wieruch at scale):
  everything for one product area sits together, and deleting a feature is deleting a folder.
- **Type grouping** (Josh Comeau): `components/`, `hooks/`, `helpers/` at the top, because
  "categorization is actually really hard".

**Default:** a hybrid. Use a shared layer organised by type, plus feature or route folders for
product code. No source has measured one against the other; both are expert judgement.

Sources: React legacy FAQ; Next.js "Project structure"; Bulletproof React; Feature-Sliced
Design; Kent C. Dodds "Colocation"; Robin Wieruch "React Folder Structure"; Josh Comeau
"Delightful React File/Directory Structure". The links are in the skill's
[README](../README.md#sources).
