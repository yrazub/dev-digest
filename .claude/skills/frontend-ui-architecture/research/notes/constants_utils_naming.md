# Constants, utilities/helpers, types, configuration and naming in a React / TypeScript frontend

Scope note: every URL below was fetched during this session (2026-09-27) and resolved. Dates are the
page's own date where one was shown; "undated" means the page did not show one. Authority tiers:
**T1** = official docs of the tool/language; **T2** = widely adopted style guide or reference
architecture; **T3** = recognised practitioner (single author, opinion).

Target-project context used for "supports / conflicts" notes: per-component `constants.ts`,
`helpers.ts`, `styles.ts` (exports `s`); kebab-case `.ts` files, PascalCase `.tsx` components;
`snake_case` contract fields inferred from shared Zod schemas.

### Source register (quick reference)

| # | Source | Author / org | Date | Tier |
|---|---|---|---|---|
| 1 | https://www.typescriptlang.org/docs/handbook/enums.html | Microsoft (TS team) | undated, living docs | T1 |
| 2 | https://www.totaltypescript.com/why-i-dont-like-typescript-enums | Matt Pocock | undated (pre-2024) | T3 (highly cited) |
| 3 | https://www.totaltypescript.com/erasable-syntax-only | Matt Pocock | early 2025 (written just before TS 5.8, which shipped Mar 2025) | T3 |
| 4 | https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files | Matt Pocock | book, 2024 | T3 |
| 5 | https://nextjs.org/docs/app/guides/environment-variables | Vercel | lastUpdated 2026-08-25 (v16.3.6) | T1 |
| 6 | https://nextjs.org/docs/app/getting-started/project-structure | Vercel | lastUpdated 2026-07-21 (v16.3.6) | T1 |
| 7 | https://react.dev/learn/reusing-logic-with-custom-hooks | Meta / React team | undated, living docs | T1 |
| 8 | https://react.dev/learn/responding-to-events | Meta / React team | undated, living docs | T1 |
| 9 | https://google.github.io/styleguide/tsguide.html | Google | undated, living | T2 |
| 10 | https://github.com/airbnb/javascript/tree/master/react | Airbnb | undated; class-component era (~2016-2019), old but canonical | T2 (aged) |
| 11 | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | Alan Alickovic | living repo | T2 (reference architecture, ~30k+ stars) |
| 12 | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md | Alan Alickovic | living repo | T2 |
| 13 | https://feature-sliced.design/docs/reference/slices-segments | FSD core team | living docs | T2 (methodology) |
| 14 | https://feature-sliced.design/docs/reference/layers | FSD core team | living docs | T2 |
| 15 | https://kentcdodds.com/blog/colocation | Kent C. Dodds | 2019-06-17 | T3 (canonical, older) |
| 16 | https://kentcdodds.com/blog/aha-programming | Kent C. Dodds | 2020-06-22 | T3 (canonical, older) |
| 17 | https://zod.dev/basics | Colin McDonnell / Zod | living docs (v4) | T1 |
| 18 | https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md | import-js | living docs | T1 (tool) |
| 19 | https://typescript-eslint.io/rules/no-magic-numbers/ | typescript-eslint | living docs | T1 (tool) |

## Constants: where they live, enum vs `as const`, env config, magic numbers

### Takeaway
There is no official "constants folder" rule. The sources agree on two things. Keep a constant next to its only
consumer (colocation) and move it to a shared `config/` folder only when it is global or comes from the environment.
Prefer `as const` objects to TypeScript `enum`s: the TS handbook calls this a legitimate modern alternative,
Pocock argues for it strongly, and TS 5.8's `erasableSyntaxOnly` flag enforces it. Google is the one dissent.

### Cited Findings
- TS handbook ("Objects vs Enums"): "In modern TypeScript, you may not need an enum when an object with `as const` could suffice." It shows `const ODirection = { Up: 0, … } as const` and derives the union type with `typeof ODirection[keyof typeof ODirection]`. It also says: "The biggest argument in favour of this format over TypeScript's `enum` is that it keeps your codebase aligned with the state of JavaScript." The same page lists `const enum` pitfalls: `isolatedModules` and ambient const enums in `.d.ts` files. — [TS Handbook: Enums](https://www.typescriptlang.org/docs/handbook/enums.html)
- Pocock gives these reasons against enums. Numeric enums get reverse mappings (6 keys vs 3) and accept raw numbers. Enums are nominal: "you can't use an enum in place of another enum, even if the values are the same". They break the "just JavaScript with types" model. His advice is not to add enums to new codebases, to use `as const` instead, and to use string enums only if you must use enums at all. — [Pocock, Why I don't like enums](https://www.totaltypescript.com/why-i-dont-like-typescript-enums)
- TS 5.8 added `erasableSyntaxOnly`, which "marks enums, namespaces and class parameter properties as errors". The reason is that Node's native TypeScript support "by default, only supports erasable syntax". Pocock doubts these features "should ever have been part of TypeScript". — [Pocock, erasableSyntaxOnly](https://www.totaltypescript.com/erasable-syntax-only)
- **Disagreement:** Google's style guide still allows enums. It bans only `const enum` ("Code must not use `const enum`; use plain `enum` instead") and does not recommend `as const` as a replacement. — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- Constant naming: Google uses `CONSTANT_CASE` for "global constant values, including enum values", at module scope only. "If a value can be instantiated more than once over the lifetime of the program (e.g. a local variable declared within a function…) then it must use `lowerCamelCase`." — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- Placement: Bulletproof React has a top-level `config/` for "global configurations and environment variables". Feature folders do *not* get a `constants/` segment. The allowed segments are api, assets, components, hooks, stores, types and utils, and "Only include the ones that are necessary." — [Bulletproof React, project-structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD has a standard `config` segment ("configuration files and feature flags") in every slice. `shared/config` holds "environment variables, feature flags, and global configuration", and `shared/routes` holds route constants. — [FSD slices-segments](https://feature-sliced.design/docs/reference/slices-segments); [FSD layers](https://feature-sliced.design/docs/reference/layers)
- Colocation principle: "Place code as close to where it's relevant as possible", and "Things that change together should be located as close as reasonable" (Dodds, attributing the second line to Dan Abramov). — [Kent C. Dodds, Colocation (2019)](https://kentcdodds.com/blog/colocation)
- Next.js env rules. Variables without the `NEXT_PUBLIC_` prefix "are only available in the Node.js environment". `NEXT_PUBLIC_` values are "inline[d]… at build time" and "frozen with the value evaluated at build time". Dynamic lookups (`process.env[varName]`, or `const env = process.env; env.X`) are "NOT inlined". The load order is `process.env` → `.env.$(NODE_ENV).local` → `.env.local` (skipped in test) → `.env.$(NODE_ENV)` → `.env`. With a `src/` folder, `.env*` files stay in the project root. — [Next.js env vars (2026-08-25)](https://nextjs.org/docs/app/guides/environment-variables)
- Magic numbers: `@typescript-eslint/no-magic-numbers` extends the core rule and adds TS options (`ignoreEnums`, `ignoreNumericLiteralTypes`, `ignoreReadonlyClassProperties`, `ignoreTypeIndexes`). All default to `false`. — [typescript-eslint no-magic-numbers](https://typescript-eslint.io/rules/no-magic-numbers/)

### Inferences
- The project's per-component `constants.ts` matches colocation (Dodds) and FSD's per-slice `config` segment in spirit. The difference is the name: FSD would call it `config`, and Bulletproof would leave it as a module-level `const` in the component file or put it in feature `utils`. No T1 or T2 source names a per-component `constants.ts`, so it is a local convention and does not break any rule.
- Because of the Next.js inlining rules, a client `config/env.ts` should read each `process.env.NEXT_PUBLIC_X` with a literal property access. Destructuring or indexing `process.env` silently yields `undefined` in the browser.
- Enum values in shared Zod contracts (e.g. `Severity` = `CRITICAL`) fit the `as const` / `z.enum` approach. `z.enum` produces a string-literal union rather than a TS `enum`, so it is compatible with `erasableSyntaxOnly`.

### Gaps
- I found no official React or Next.js guidance on a `constants/` folder specifically. Next.js calls itself "unopinionated" (see the Next.js project-structure page).
- I found no authoritative source on the case for exported constant objects (`CONSTANT_CASE` vs `camelCase` for `as const` maps). Google covers only the general module-scope rule.

## Utils vs helpers vs lib: definitions, the dumping-ground anti-pattern, and when to promote

### Takeaway
The terms have no shared standard definition. Bulletproof splits `lib/` (preconfigured third-party libraries) from `utils/`
(shared functions). FSD rejects "utils/helpers" as names and requires each `shared/lib` module to have one focus. Dodds warns
that early extraction into `utils/` leaves orphaned code, and his AHA principle says to wait for repetition before abstracting.

### Cited Findings
- Bulletproof React defines `lib` as "Preconfigured reusable libraries" and `utils` as "Shared utility functions", both top-level. A feature may have its own `utils` ("Feature utility functions"). — [Bulletproof project-structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD: `shared/lib` "should not be treated as helpers or utilities. Instead, every library in this folder should have one area of focus, for example, dates, colors, text manipulation." — [FSD layers](https://feature-sliced.design/docs/reference/layers)
- FSD: segment names should describe "the purpose of the content, not its essence… `components`, `hooks`, and `types` are bad segment names." The standard slice segment `lib` is "library code that other modules on this slice need". — [FSD slices-segments](https://feature-sliced.design/docs/reference/slices-segments)
- Next.js uses `components`/`lib` only as "generalized placeholders" with "no special framework significance… your projects might use other folders like `ui`, `utils`, `hooks`, `styles`". It shows `app/blog/_lib/data.ts` as "Not routable; safe place for utils". — [Next.js project structure (2026-07-21)](https://nextjs.org/docs/app/getting-started/project-structure)
- Dodds: moving code to `utils/` preemptively means that when the original component is deleted, the utility often stays behind unused and still has to be maintained. Keep functions in the file that needs them until they are actually shared. — [Dodds, Colocation](https://kentcdodds.com/blog/colocation)
- AHA ("Avoid Hasty Abstractions"): "prefer duplication over the wrong abstraction" (Sandi Metz), and "Optimize for change first". Dodds says you shouldn't be dogmatic about when to abstract; write the abstraction "when it *feels* right". He cites Conlin Durbin's WET idea (tolerate writing something twice, not three times). — [Dodds, AHA Programming (2020)](https://kentcdodds.com/blog/aha-programming)
- React: a function that doesn't call Hooks should not be a Hook. "Write it as a regular function without the `use` prefix", e.g. `getSorted(items)` rather than `useSorted`. This is the React-docs basis for keeping pure helpers separate from hooks. — [react.dev custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Inferences
- The project's per-component `helpers.ts` is colocation (Dodds) at the smallest scale. It fits Bulletproof's feature-level `utils` and FSD's slice `lib`, with a different file name. FSD would push back on the generic name "helpers" at the `shared` level, but not for a single component's private module.
- A "promote on second or third use" rule is supported by AHA/WET and colocation together: stay local until a second real consumer appears, then move the helper up to the nearest common ancestor (feature `utils`, then `shared/lib/<focus>`). The exact threshold (2 vs 3) is a judgement call; AHA refuses a fixed number.
- Pure, hook-free helpers can be unit-tested without rendering, which follows from the react.dev naming rule. None of the sources states the testability argument directly.

### Gaps
- No T1 source defines "helper" vs "util" as distinct terms. The difference is conventional only.
- The phrase "rule of three" is not in Dodds's AHA post; the post rejects fixed thresholds. Attribute "rule of three" to its classic origin (Fowler, *Refactoring*, crediting Don Roberts) only after verifying it, which I did not do here.

## Types placement: colocated vs `types/`, contract types via `z.infer`, `.d.ts`

### Takeaway
Keep types in ordinary `.ts` files next to their use. Put shared types in a `types/` folder (Bulletproof) or the `model`/`api`
segment (FSD). Don't author your own `.d.ts` files or global types. Derive contract types from Zod schemas with `z.infer`,
under the same name as the schema.

### Cited Findings
- Bulletproof: top-level `types` = "Shared TypeScript types", plus an optional feature-level `types`. — [Bulletproof project-structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- **Disagreement:** FSD calls `types` a "bad segment name". Types go in `model` ("schemas, interfaces, stores, and business logic") or `api` ("request functions, data types, mappers"). — [FSD slices-segments](https://feature-sliced.design/docs/reference/slices-segments)
- Pocock/Total TypeScript on declaration files: "A 'declaration file'? Sounds like where you put your type declarations. But this is a bad idea. `skipLibCheck` will ignore these files." Instead, "put your types in regular TypeScript files". On `declare global`: "I don't recommend you do this. Polluting the global scope with types can turn your project into a mess of implicit dependencies." — [Total TypeScript Essentials, ch. Modules/Scripts/Declaration Files](https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files)
- Zod: "extract this type with the `z.infer<>` utility". Use `z.input`/`z.output` when transforms make the two sides differ. The docs' own pattern gives the schema and type one name: `const Player = z.object(...)`, `type Player = z.infer<typeof Player>`. — [zod.dev basics](https://zod.dev/basics)
- **Partial disagreement:** Google says "use interfaces instead of a type alias for the object literal expression". That conflicts with deriving object types from `z.infer`, which always yields a type alias. — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- Next.js marks `next-env.d.ts` as generated ("should not be tracked by version control"). Framework-generated `.d.ts` files are the legitimate case. — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- The project's rule (contract types defined once in shared Zod and inferred under the same PascalCase name) matches Zod's documented pattern and Pocock's "types in regular .ts files". It departs only from Google's interface preference, which applies to hand-written object types and not to inferred ones.
- `snake_case` contract fields are not addressed by any of these sources. Google's `lowerCamelCase` for properties would nominally conflict, but it governs identifiers you author, not wire formats. The project's "convert at the boundary, never rename a contract field" rule is a defensible local exception.

### Gaps
- I found no T1 statement on "colocated `types.ts` per component vs a global `types/` folder". The guidance is inferred from colocation (Dodds) and the Bulletproof/FSD structures.

## Naming: files, components, hooks, handlers, booleans

### Takeaway
React's official rules cover only three things: capitalised component names, `use` + capital letter for hooks (and only for functions
that call hooks), and `handleX` handlers passed as `onX` props. File-name case is where the sources actually disagree: Airbnb says
PascalCase, Bulletproof says kebab-case everywhere, and Google says snake_case.

### Cited Findings
- react.dev: "React component names must start with a capital letter". "Hook names must start with `use` followed by a capital letter". Functions that don't call Hooks should not use the prefix. Name hooks for "concrete high-level use cases" and avoid "lifecycle" wrappers like `useMount` or `useEffectOnce`. — [react.dev custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- react.dev: handlers are named "`handle` followed by the name of the event" (`handleClick`). "Event handler props should start with `on`, followed by a capital letter" (`onClick`, and app-specific ones like `onPlayMovie`). — [react.dev responding to events](https://react.dev/learn/responding-to-events)
- Airbnb (aged, class-component era): "Use PascalCase for filenames" (`ReservationCard.jsx`), `.jsx` extension, "Use the filename as the component name", camelCase props, and "Do not use underscore prefix for internal methods". — [Airbnb React/JSX guide](https://github.com/airbnb/javascript/tree/master/react)
- Bulletproof: "all files should be named in `kebab-case`", enforced for `.ts` and `.tsx` alike by `eslint-plugin-check-file` (`'**/*.{ts,tsx}': 'KEBAB_CASE'`, with `ignoreMiddleExtensions: true`), and kebab-case folders too. — [Bulletproof project-standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- Google: UpperCamelCase for "class / interface / type / enum / decorator / type parameters / component functions in TSX". lowerCamelCase for variables, functions and properties. The guide's import example uses snake_case file names (`import * as fooBar from './foo_bar'`). — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- Next.js routing files are lowercase reserved names (`page`, `layout`, `loading`, `error`, `route`, `not-found`, `global-error`, `template`, `default`). Private folders use `_folderName`, and route groups use `(group)`. — [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- The project's split (kebab-case `.ts`, PascalCase `.tsx` components) is a hybrid. Its component half follows Airbnb, and its non-component half follows Bulletproof and the lowercase style of Next.js reserved files. It conflicts with Bulletproof's all-kebab rule and with Google's snake_case. A `check-file` config can enforce the hybrid with two globs.
- The project's `styles.ts` exporting `s` does not match any convention in these sources. It is consistent with Google's lowerCamelCase for module values, but a one-letter export name has no external support.

### Gaps
- None of the T1/T2 sources fetched states a boolean-naming rule (`is`/`has`/`should`). It is common practice, but I have no citation for it here.
- Google's file-naming rule was read from the guide's import example. Re-check the exact wording of its "File names" section before quoting it as a normative rule.

## Imports: path aliases, ordering, deep relatives, cross-feature restrictions

### Takeaway
Bulletproof and Next.js use `@/*` aliases. Google prefers relative imports inside a project but caps the number of `../` steps. Bulletproof
and FSD both enforce one-way dependency (shared → features → app) and ban feature-to-feature imports with lint rules.
`eslint-plugin-import`'s `import/order` handles ordering.

### Cited Findings
- Bulletproof: set `"paths": { "@/*": ["./src/*"] }` in tsconfig so that "files can be moved around without updating import paths". — [Bulletproof project-standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- **Disagreement:** Google says "Code should use relative imports (`./foo`) rather than absolute imports `path/to/foo` when referring to files within the same (logical) project", but also "Consider limiting the number of parent steps (`../../../`)". Google also says "Do not use default exports". — [Google TS Style Guide](https://google.github.io/styleguide/tsguide.html)
- Bulletproof: "Features should not import from other features"; instead "compose different features at the application level". Code flows "shared -> features -> app", enforced with `import/no-restricted-paths`. It also advises against barrel files because they hurt Vite tree-shaking ("import the files directly"). — [Bulletproof project-structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD: "A module (file) in a slice can only import other slices when they are located on layers strictly below". Shared and App are exceptions whose segments may reference each other. — [FSD layers](https://feature-sliced.design/docs/reference/layers)
- `import/order` groups imports by default as `["builtin", "external", "parent", "sibling", "index"]`. `pathGroups` (e.g. `{ "pattern": "@/**", "group": "external", "position": "after" }`) slots aliases in. `newlines-between: "always"` and `alphabetize` are optional. — [eslint-plugin-import order](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md)

### Inferences
- For a Next.js client, the `@/` alias plus Bulletproof-style `no-restricted-paths` is the most widely cited combination. Google's relative-first stance comes from a monorepo/Bazel setting and fits app code less well.
- Bulletproof's anti-barrel advice cuts against the `index.ts` public API that FSD requires for each slice. This is a real disagreement between the two main reference architectures.

### Gaps
- I did not fetch the TS handbook's `paths`/module-resolution page or the Next.js "absolute imports and module path aliases" page. Verify those URLs before citing them for `@/` configuration.
- I found no 2024-2026 practitioner post on import ordering beyond the tool docs.
