# React / Next.js Project Folder Structure: Where Components Live

Context for the report writer: the target project is Next.js 15 App Router + React 19 + TanStack Query + next-intl, already using `src/app/**/_components/<Name>/` (Name.tsx, index.ts, styles.ts, constants.ts, helpers.ts, Name.test.tsx) and `src/lib/hooks/` per API resource. Every URL below was fetched and resolved on 2026-09-27 unless marked otherwise.

## Source list (annotated)

| # | Source | Author / org | Date | Authority |
|---|---|---|---|---|
| 1 | https://nextjs.org/docs/app/getting-started/project-structure | Vercel / Next.js team | lastUpdated 2026-07-21, docs version 16.3.6 | Official framework docs, highest for Next.js |
| 2 | https://legacy.reactjs.org/docs/faq-structure.html | React team (Meta) | Legacy docs (pre-2023, archived); no update date shown | Official but legacy; still the only official React statement on file structure |
| 3 | https://react-file-structure.surge.sh/ | Dan Abramov | Undated (links a 2018 tweet) | Canonical, humorous one-liner from a React core member |
| 4 | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | Alan Alickovic (alan2207) | Living repo; no date on page | Very widely cited community reference architecture (not official) |
| 5 | https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src | same | same | Next.js App Router variant of #4 |
| 6 | https://feature-sliced.design/docs/get-started/overview | Feature-Sliced Design community | No date shown | Formal methodology with its own docs/tooling; community standard, strongest in RU/CIS ecosystem |
| 7 | https://feature-sliced.design/docs/reference/public-api | FSD | No date shown | same |
| 8 | https://feature-sliced.design/docs/guides/tech/with-nextjs | FSD | No date shown | same |
| 9 | https://dev.to/algoorgoal/feature-sliced-design-review-22k0 | "Chan" (algoorgoal) | 2024-07-01 | Low-authority practitioner review; useful for Next.js-specific criticism |
| 10 | https://kentcdodds.com/blog/colocation | Kent C. Dodds | 2019-06-17 | Older but canonical principle source |
| 11 | https://www.robinwieruch.de/react-folder-structure/ | Robin Wieruch | Updated 2026-05-05 | Well-known practitioner, current |
| 12 | https://www.joshwcomeau.com/react/file-structure/ | Josh W. Comeau | Published 2022-03-15, updated 2025-12-03 | Well-known practitioner, current |
| 13 | https://tkdodo.eu/blog/please-stop-using-barrel-files | Dominik Dorfmeister (TkDodo, TanStack Query maintainer) | 2024-07-26 | High practitioner authority; directly relevant to index.ts usage |

## Feature-based vs layer-based (type-based) structure

### Takeaway
No official source mandates one: React's legacy docs list both and say "don't overthink it", and Next.js calls itself "unopinionated" and offers three strategies. Community reference architectures (Bulletproof React, FSD, Wieruch at scale) push feature-based grouping with one-way import rules for mid/large apps. Josh Comeau is the notable dissenter who argues for type-based folders.

### Cited Findings
- Official React (legacy) lists two approaches: "Grouping by features or routes" ("Locate CSS, JS, and tests together inside folders grouped by feature or route") and "Grouping by file type". It notes that most teams end up with a hybrid. — [React legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- React legacy FAQ on nesting: "Consider limiting yourself to a maximum of three or four nested folders within a single project." — [React legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- React legacy FAQ: "Don't spend more than five minutes on choosing a file structure. Pick any of the above approaches (or come up with your own) and start writing code!" It also advises keeping files that change together close to each other. — [React legacy FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- Dan Abramov: "move files around until it feels right", followed by "this is not a joke" (linking his tweet). — [react-file-structure.surge.sh](https://react-file-structure.surge.sh/)
- Next.js: "Next.js is **unopinionated** about how you organize and colocate your project files." and "The simplest takeaway is to choose a strategy that works for you and your team and be consistent across the project." — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Wieruch describes a progression in five steps: single file → multiple files → folder per component → technical folders (`components/`, `hooks/`, `context/`, `utils/`, `lib/`, `types/`) for mid-size apps → `features/` for large apps. He adds domain folders once `features/` passes about 10 entries, then package folders and app folders in monorepos. "Since every React project grows in size over time, most of the folder structures evolve very naturally as well." — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Wieruch rules for large apps: "Code flows in one direction. From shared utilities into features, and from features into pages. Never the other way around." Features should not import from each other. Use singular names (`customer`, not `customers`). — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Comeau organizes "by function, not by feature" ("I want a 'components' directory, a 'hooks' directory, a 'helpers' directory, and so on"). He argues that "Real life isn't nicely segmented... categorization is actually _really hard_. Every time you create a component, you have to decide where that component belongs." — [Comeau](https://www.joshwcomeau.com/react/file-structure/)
- Kent C. Dodds: "Place code as close to where it's relevant as possible", and "Things that change together should be located as close as reasonable". Central utils folders tend to collect orphaned code, so keep utilities near where they are used. — [Kent C. Dodds, Colocation](https://kentcdodds.com/blog/colocation)

### Inferences
- Disagreement: Bulletproof, FSD and Wieruch (large-app stage) favor feature grouping, while Comeau explicitly rejects it. React and Next.js official docs stay neutral. A skill should present feature and colocated grouping as the default for route-heavy apps, with type-based shared folders for truly shared code (a hybrid). That matches the React FAQ's remark about hybrids.
- A usable rule: size decides. Type folders fit small and mid apps; feature or route slices with import rules fit large ones (Wieruch's progression).

### Gaps
- The current react.dev docs have no file-structure page that I could find. The only official React statement is the legacy FAQ, and nothing I found says react.dev replaced or retracted it.
- I found no quantitative studies comparing the approaches. All evidence is expert opinion.

## Bulletproof React

### Takeaway
Bulletproof uses `src/{app, assets, components, config, features, hooks, lib, stores, testing, types, utils}`. Features are self-contained with optional subfolders. Imports run one way (shared → features → app), with no cross-feature imports, enforced by ESLint `import/no-restricted-paths`. Feature barrel files are now discouraged.

### Cited Findings
- Top-level tree: `app` (routes, app.tsx, provider.tsx, router.tsx), `assets`, `components` (shared), `config`, `features`, `hooks` (shared), `lib` (preconfigured libraries), `stores`, `testing`, `types`, `utils`. — [Bulletproof project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- A feature may contain `api` (API requests and hooks), `assets`, `components`, `hooks`, `stores`, `types`, `utils`. "You don't need all of these folders for every feature. Only include the ones that are necessary." — [Bulletproof](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- On cross-feature imports: "It might not be a good idea to import across the features. Instead, compose different features at the application level." — [Bulletproof](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Import direction: "The shared parts can be used by any part of the codebase, but the features can only import from shared parts and the app can import from features and shared parts." This is enforced with `import/no-restricted-paths`. — [Bulletproof](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- On barrel files: "In the past, it was recommended to use barrel files to export all files from a feature. However, it can cause issues for Vite to do tree shaking and can lead to performance issues." — [Bulletproof](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- The Next.js variant `apps/nextjs-app/src` contains `app/`, `components/`, `config/`, `features/`, `hooks/`, `lib/`, `styles/`, `testing/`, `types/`, `utils/`. Its `app/` holds route folders (`app`, `auth`, `public/discussions/[discussionId]`) plus `layout.tsx`, `page.tsx`, `not-found.tsx`, `provider.tsx`. In other words, it follows Next.js's "store project files outside of app" strategy. — [Bulletproof nextjs-app/src](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src), [src/app](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src/app)

### Inferences
- Bulletproof puts API hooks inside each feature (`features/x/api`). The target project instead has a central `src/lib/hooks/` per API resource, which is closer to a type-based or shared-layer approach. Neither violates Bulletproof's direction rule as long as `lib/hooks` never imports from `app/**/_components`.
- The target's `app/**/_components` layout does not match Bulletproof's Next.js app, which keeps components outside `app/`. It does match Next.js's official third strategy.

### Gaps
- The repo page shows no last-updated date. I did not verify the commit history date.
- The full ESLint config body was not captured. The doc only says it uses `import/no-restricted-paths`.

## Feature-Sliced Design (FSD)

### Takeaway
FSD is a formal, rule-heavy methodology. Layers run app > (processes, deprecated) > pages > widgets > features > entities > shared. Slices are business domains; segments are `ui/api/model/lib/config`. A module imports only from layers strictly below it, same-layer slices do not import each other, and every slice exposes a public API through an index file. Its strengths are enforced boundaries and predictability. Criticisms are the learning curve, overkill for small apps, and friction with the Next.js App Router over naming and client/server barrels.

### Cited Findings
- Layers: App, Processes (deprecated), Pages, Widgets, Features, Entities, Shared. "Layers **App** and **Shared**, unlike other layers, do not have slices and are divided into segments directly." — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Segments: `ui` (UI components, formatters, styles), `api` (backend interactions), `model` (schemas, stores, business logic), `lib` (library code), `config` (configuration, feature flags). — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- Import rule: "Modules on one layer can only know about and import from modules from the layers strictly below." Also: "Slices cannot use other slices on the same layer." — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- FSD says it suits "projects and teams of any size". It is not needed if the current architecture works without friction. — [FSD overview](https://feature-sliced.design/docs/get-started/overview)
- The public API is "a _contract_ between a group of modules, like a slice, and the code that uses it", implemented as an index file of re-exports. Wildcard `export *` is discouraged because it "hurts the discoverability of a slice". Deep imports bypass the contract. Cross-entity references use `entities/A/@x/B.ts`. — [FSD public API](https://feature-sliced.design/docs/reference/public-api)
- FSD itself acknowledges index-file costs: circular imports, tree-shaking problems from large `shared/ui` barrels, and "Having a large amount of index files in a project can slow down the development server". It recommends separate index files per component in shared layers. — [FSD public API](https://feature-sliced.design/docs/reference/public-api)
- Next.js integration: put Next's `app/` at the project root and FSD code in `src/`. "Rename **both** `app` and `pages` FSD layers to `_app` and `_pages`, regardless of which router you use." Route files re-export, e.g. `export { ExamplePage as default, metadata } from '@/_pages/example';`. Add `index.server.ts` for server-only modules. — [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- Criticism (practitioner review): the learning curve (e.g. deciding `lib` vs `model`), and for Next.js, "if server components and client components are exported by a single file, the server components are marked as client components". Listed pros: one-way dependencies and a maximum of three directory levels (layer/slice/segment). — [Chan, dev.to 2024](https://dev.to/algoorgoal/feature-sliced-design-review-22k0)
- Other commonly repeated criticisms, all from low-authority Medium/blog aggregations: overkill for small or MVP projects, and one feature's code ends up spread across several layers. — [search-surfaced: Medium "Drawbacks of FSD"](https://medium.com/@lightxdesign55/the-drawbacks-of-feature-sliced-design-b19206b96cb7) (not fetched; treat as low authority)

### Inferences
- FSD conflicts with the target layout. FSD keeps UI out of Next's `app/` (route files only re-export), whereas the target colocates `_components` inside route segments.
- FSD's `api` segment per entity or feature is conceptually closer to the target's per-resource hooks, though the target keeps them in `lib/hooks` rather than per slice.

### Gaps
- The FSD docs pages show no publication dates. The FSD v2 release date was not verified.
- I found no high-authority critique of FSD from an English-language core-team figure such as Abramov, Dodds or TkDodo.

## Next.js App Router official guidance

### Takeaway
Next.js 16 docs, updated July 2026, cover several points. Anything in `app/` is non-routable unless it is a `page` or `route` file, so colocation is safe. `_private` folders are optional, and their stated purposes include separating UI from routing logic. `(groups)` organize routes without changing the URL. `src/` is optional. Three example strategies are given: outside `app`, top-level inside `app`, and split by feature or route.

### Cited Findings
- "A route is **not publicly accessible** until a `page.js` or `route.js` file is added" and "project files can be **safely colocated** inside route segments in the `app` directory without accidentally being routable". Also: "While you **can** colocate your project files in `app` you don't **have** to." — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Private folders (`_folderName`) opt "the folder and all its subfolders" out of routing. The docs say they are "not required for colocation" but useful for "Separating UI logic from routing logic", "Consistently organizing internal files across a project and the Next.js ecosystem", "Sorting and grouping files in code editors", and "Avoiding potential naming conflicts with future Next.js file conventions". The example table lists `app/blog/_components/Post.tsx` ("Not routable; safe place for UI utilities") and `app/blog/_lib/data.ts`. — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- Route groups `(folderName)` are omitted from the URL. They are useful for organizing "by site section, intent, or team" and for nested or multiple root layouts. — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- The `src` folder "separates application code from project configuration files". — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)
- The three strategies: (1) "Store project files outside of `app`", which keeps `app` "purely for routing purposes"; (2) "Store project files in top-level folders inside of `app`"; (3) "Split project files by feature or route", which "stores globally shared application code in the root `app` directory and **splits** more specific application code into the route segments that use them". The `components` and `lib` names "have no special framework significance". — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- The target's `src/app/**/_components/` combined with shared `src/lib/hooks/` is a hybrid of strategies 3 and 1 using the recommended `_components` private-folder name. It fits the official docs directly.

### Gaps
- The Next.js docs set no rules on nesting depth, index files or component-folder internals.

## Component folder conventions (folder per component, index.ts, co-located files, nesting)

### Takeaway
Comeau and Wieruch both give each component its own folder with an `index` public entry and sibling helper, constants, types and test files. That matches the target's `<Name>/{Name.tsx, index.ts, constants.ts, helpers.ts, Name.test.tsx}`. The contested part is `index.ts` barrels. Comeau notes App Router needs `export { default }` only. TkDodo and Bulletproof argue against barrels in apps, and FSD warns about their performance cost.

### Cited Findings
- Comeau's component folder holds `FileViewer.tsx`, `FileViewer.helpers.ts`, `FileViewer.types.ts`, subcomponents (`Directory.tsx`, `File.tsx`, `Sidebar.tsx`) and `index.ts`. The index is `export * from './FileViewer'; export { default } from './FileViewer';`, but for Next.js App Router he uses only `export { default } from './FileViewer';`. Supporting files use dot notation (`Widget.constants.ts`, `Widget.helpers.ts`). "Helpers" are project-specific and "utils" are generic. He recommends `@/` path aliases over deep relative imports. — [Comeau](https://www.joshwcomeau.com/react/file-structure/)
- Comeau defends barrels in apps: "My _entire project_ has ~180 barrel files, out of ~1200 total TS/JS files... the bundler will spend most of its time dealing with third-party dependencies." — [Comeau](https://www.joshwcomeau.com/react/file-structure/); contradicted by [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- Wieruch's folder per component: `list/{index.js (public API), component.js, test.js, style.css}`. He prefers short names but accepts the redundant `list.js`/`list.test.js`. He advises: "avoid nesting more than two levels". A hook used by only one component stays with that component; only reusable hooks go to `hooks/`. On barrels: they are "getting out of fashion in JavaScript, because they make tree shaking harder for bundlers", though he still uses them as public APIs that export only the interface. — [Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- TkDodo on a Next.js project: "I have seen pages that were loading over 11k modules, which took 5-10 seconds to start-up the page. After we started to get rid of most of our internal barrel files, we got that down to about 3.5k modules - a reduction of 68%." A barrel that re-exports a module which imports back from the barrel creates a circular import. Next.js `optimizePackageImports` cannot optimize a barrel that has even one line that is not a re-export. Barrels are still fine for libraries, which need a single entry point. — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- Kent C. Dodds: tests belong next to the code they test rather than in a mirrored `test/` tree, and styles belong near their components. He also argues against ESLint rules that forbid more than one component per file. — [Kent C. Dodds](https://kentcdodds.com/blog/colocation)
- Nesting limits vary by source: React legacy says 3–4 nested folders max ([React FAQ](https://legacy.reactjs.org/docs/faq-structure.html)), Wieruch says no more than 2 levels ([Wieruch](https://www.robinwieruch.de/react-folder-structure/)), and FSD caps it structurally at layer/slice/segment ([Chan review](https://dev.to/algoorgoal/feature-sliced-design-review-22k0)).

### Inferences
- The target's per-component `index.ts` is a one-module barrel, the "tiny" kind Comeau and FSD (per-component index in shared) accept. It avoids TkDodo's main complaint, which is large multi-module barrels. The safe App Router form is `export { default } from './Name'` or a named re-export of a single component, with no `export *` mixing server and client code.
- Co-located `Name.test.tsx`, `constants.ts` and `helpers.ts` are supported by Dodds and Comeau. The target uses plain `constants.ts`/`helpers.ts` where Comeau uses `Name.constants.ts`; both are conventions, and neither source mandates the other.
- Where sources disagree: barrels (Comeau and Wieruch for; TkDodo and Bulletproof against; FSD requires them but warns about the cost); feature vs type grouping (Comeau against features); where UI lives in Next.js (inside `app/` under official strategy 3, outside under Bulletproof and FSD).

### Gaps
- I found no official Next.js or React guidance on the internals of a component folder (index files, file naming).
- `new-component` (Comeau's CLI) was mentioned but not evaluated.
- next-intl-specific structure (e.g. `[locale]` segment, `messages/`) was out of scope and not researched.
