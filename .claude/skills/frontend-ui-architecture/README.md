# frontend-ui-architecture

**Version 1.0.0** · updated 2026-09-27

A Claude Code skill that answers *where frontend code lives and how it is cut into pieces* in
React and Next.js App Router apps: folder structure, component splitting, constants, helpers
and utils, types, business logic, state and data placement, naming, imports and barrel files,
and lint enforcement of all of the above.

It covers organization only. Hook misuse, state anti-patterns and render performance are out of
scope and belong to a React best-practices skill. The skill is project-agnostic: a project's own
documented conventions always take precedence.

## Layout

| File | Purpose |
|---|---|
| [SKILL.md](SKILL.md) | Entry point: core principles, the "Where does this code go?" procedure and the rule index |
| [references/folder-structure.md](references/folder-structure.md) | `struct-*`: layouts, growth stages, one-way imports, colocation and promotion |
| [references/component-splitting.md](references/component-splitting.md) | `split-*`: when to split, purity, the client boundary, composition |
| [references/constants-helpers-types.md](references/constants-helpers-types.md) | `place-*`: constants, env, `as const`, helpers vs hooks, `lib`/`utils`, types |
| [references/logic-and-data.md](references/logic-and-data.md) | `logic-*`: domain functions, hooks, effects, the state ladder, the data layer |
| [references/naming-and-imports.md](references/naming-and-imports.md) | `import-*` / `name-*`: barrels, aliases, naming |
| [references/enforcement.md](references/enforcement.md) | Lint tooling and a flat-config example |
| [evals/evals.json](evals/evals.json) | Scenarios for checking that the skill triggers and changes behaviour |
| [evals/results-1.0.0.md](evals/results-1.0.0.md) | Results of the v1.0.0 run: with the skill vs a baseline, plus a trigger check |
| [research/report.md](research/report.md) | The research report the skill was built from |
| [research/notes/](research/notes/) | Raw research notes by topic, with quotes and gaps |

`SKILL.md` stays short and links to each reference file one level deep, following Anthropic's
skill-authoring guidance. Rule IDs and impact levels follow the format of Vercel's
`agent-skills`.

## Versioning

The version is kept in `metadata.version` in the `SKILL.md` frontmatter and in this file; bump
both together.

- **MAJOR:** a rule is removed or reversed, or a default convention changes.
- **MINOR:** new rules or reference files.
- **PATCH:** wording, examples or source fixes.

### Changelog

- **1.0.0** (2026-09-27). First version, built from the research in `research/`.

## Updating the skill

1. Re-check the time-sensitive sources: the Next.js docs version, TanStack Query guidance and
   lint tool versions.
2. Change the rule in its reference file and the index row in `SKILL.md`.
3. Add or adjust a scenario in `evals/evals.json`.
4. Bump the version, and add a changelog line.

## Sources

Every source consulted while building the skill is listed below, grouped by topic.
**Authority grades.** **A** = official documentation of the framework, library, language or tool. **B** = a library maintainer, framework core-team member or widely cited recognised expert writing under their own name, or a de facto reference architecture or style guide. **C** = a known practitioner blog or community aggregator. **D** = a low-authority opinion piece (Medium/DEV), useful only to show that a criticism exists.

**Question tags.** **Q1** folder structure and where components live · **Q2** splitting and composing components · **Q3** constants and configuration · **Q4** utils, helpers and lib · **Q5** types placement · **Q6** business and domain logic · **Q7** state placement · **Q8** data layer and server state · **Q9** naming · **Q10** imports, aliases and boundaries · **Q11** barrel and `index.ts` files · **Q12** enforcement tooling · **Q13** skill format and authoring.

The notes' dates were taken from the pages on 2026-09-27. "Living" means the page shows no date. "URL only" means the link was checked (HTTP 200) but its content was not fetched, so cite it only for the narrow claim listed.

### 1. Official React documentation

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [React FAQ: File Structure (legacy)](https://legacy.reactjs.org/docs/faq-structure.html) | React team (Meta) | Archived, pre-2023 | A (legacy) | Q1 |
| [Thinking in React](https://react.dev/learn/thinking-in-react) | React team | Living | A | Q2, Q7 |
| [Your First Component](https://react.dev/learn/your-first-component) | React team | Living | A | Q2, Q11 |
| [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) | React team | Living | A | Q2 |
| [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) | React team | Living | A | Q2, Q7 |
| [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team | Living | A | Q2, Q4, Q6, Q9 |
| [Responding to Events](https://react.dev/learn/responding-to-events) | React team | Living | A | Q9 |
| [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team | Living | A | Q6, Q7 |
| [Separating Events from Effects](https://react.dev/learn/separating-events-from-effects) | React team | Living | A | Q6 |
| [useEffectEvent reference](https://react.dev/reference/react/useEffectEvent) | React team | Living | A | Q6 |
| [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | React team | Living | A | Q7 |
| [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) | React team | Living (URL only) | A | Q7 |
| [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context) | React team | Living (URL only) | A | Q7 |
| [eslint-plugin-react-hooks reference](https://react.dev/reference/eslint-plugin-react-hooks) | React team | Living; plugin 7.1.1 (2026-04-17) | A | Q2, Q12 |
| [facebook/react: eslint-plugin-react-hooks package](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks) | Meta | Living | A | Q12 |

### 2. Official Next.js and Vercel documentation

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure) | Vercel / Next.js | Updated 2026-07-21 (v16.3.6) | A | Q1, Q4, Q5, Q9 |
| [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Vercel / Next.js | Updated 2026-08-25 (v16.3.6) | A | Q2, Q8 |
| [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) | Vercel / Next.js | Updated 2026-08-25 (v16.3.6) | A | Q2, Q11 |
| [Environment Variables](https://nextjs.org/docs/app/guides/environment-variables) | Vercel / Next.js | Updated 2026-08-25 (v16.3.6) | A | Q3 |
| [Data Security](https://nextjs.org/docs/app/guides/data-security) | Vercel / Next.js | Updated 2026-08-25 (v16.3.6) | A | Q6, Q8 |
| [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) | Vercel / Next.js | Updated 2026-09-07 (v16.3.6) | A | Q8 |
| [Forms with Server Actions](https://nextjs.org/docs/app/guides/forms) | Vercel / Next.js | Updated 2026-08-25 (v16.3.6) | A | Q6, Q8 |
| [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params) | Vercel / Next.js | Living (URL only) | A | Q7 |
| [optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) | Vercel / Next.js | Updated 2025-12-19; experimental | A | Q11 |
| [ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint) | Vercel / Next.js | Updated 2026-08-25 (v16.3.6) | A | Q12 |
| [Next.js 15.5 release (next lint deprecation)](https://nextjs.org/blog/next-15-5) | Vercel | 2025 | A | Q12 |
| [AI agents guide](https://nextjs.org/docs/app/guides/ai-agents) | Vercel / Next.js | Updated 2026-09-07 | A | Q13 |
| [How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) | Shu Ding (Vercel) | 2023-10-13 | B | Q11 |

### 3. Folder-structure reference architectures and practitioners

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [Bulletproof React: project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic | Living; repo last push 2026-05-14, ~36k stars | B | Q1, Q3, Q4, Q5, Q10, Q11 |
| [Bulletproof React: project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) | Alan Alickovic | Living | B | Q9, Q10, Q12 |
| [Bulletproof React: Next.js app `src/`](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src) | Alan Alickovic | Living | B | Q1 |
| [Bulletproof React: Next.js app `src/app`](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src/app) | Alan Alickovic | Living | B | Q1 |
| [FSD: Overview](https://feature-sliced.design/docs/get-started/overview) | Feature-Sliced Design core team | Living | B | Q1, Q10 |
| [FSD: Public API](https://feature-sliced.design/docs/reference/public-api) | FSD core team | Living | B | Q10, Q11 |
| [FSD: Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) | FSD core team | Living | B | Q1, Q11 |
| [FSD: Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | FSD core team | Living | B | Q3, Q4, Q5 |
| [FSD: Layers](https://feature-sliced.design/docs/reference/layers) | FSD core team | Living | B | Q3, Q4, Q10 |
| [feature-sliced/documentation repo](https://github.com/feature-sliced/documentation) / [feature-sliced.design](https://feature-sliced.design/) | FSD core team | Last push 2026-09-23, 2,371 stars | B | Q1 |
| [Feature-Sliced Design review](https://dev.to/algoorgoal/feature-sliced-design-review-22k0) | "Chan" (algoorgoal) | 2024-07-01 | C | Q1, Q11 (FSD criticism in Next.js) |
| [The drawbacks of Feature-Sliced Design](https://medium.com/@lightxdesign55/the-drawbacks-of-feature-sliced-design-b19206b96cb7) | Medium author "lightxdesign55" | Undated (not fetched) | D | Q1 (evidence that the criticism exists) |
| [React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch | Updated 2026-05-05 | B | Q1, Q2, Q10, Q11 |
| [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Josh W. Comeau | 2022-03-15, updated 2025-12-03 | B | Q1, Q4, Q9, Q10, Q11 |
| [React file structure (one-liner)](https://react-file-structure.surge.sh/) | Dan Abramov | Undated (links a 2018 tweet) | B | Q1 |
| [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds | 2019-06-17 | B | Q1, Q3, Q4, Q11 |

### 4. Component decomposition and composition

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [When to break up a component into multiple components](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) | Kent C. Dodds | 2019-07-19 | B | Q2 |
| [Prop Drilling](https://kentcdodds.com/blog/prop-drilling) | Kent C. Dodds | 2018-05-21 | B | Q2, Q7 |
| [React Hooks: Compound Components](https://kentcdodds.com/blog/compound-components-with-react-hooks) | Kent C. Dodds | 2019-02-18 | B | Q2 |
| [Before You memo()](https://overreacted.io/before-you-memo/) | Dan Abramov | 2021-02-23 | B | Q2, Q7 |
| [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | Dan Abramov | 2015, with 2019 retraction note | B (superseded) | Q2, Q6. Medium returns 403 to fetchers; content was verified through the [readmedium.com mirror](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0). Cite the medium.com URL |
| [Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) | patterns.dev | Living | C | Q2 |
| [Compound Pattern](https://www.patterns.dev/react/compound-pattern) | patterns.dev | Living | C | Q2 |
| [Headless Component](https://martinfowler.com/articles/headless-component.html) | Juntao Qiu (martinfowler.com) | 2023-11-07 | B | Q2, Q6 |
| [Radix Primitives: Composition (`asChild`)](https://www.radix-ui.com/primitives/docs/guides/composition) | Radix / WorkOS | Living | A (for Radix) | Q2 |

### 5. Business logic, architecture layers and state

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu (martinfowler.com) | 2023-02-16 | B | Q2, Q6, Q8 |
| [Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | Alex Bespoyasov | 2021-09-02 | C | Q6 |
| [Clean Architecture for Frontend Sounds Smart — Until You Ship](https://medium.com/@mernstackdevbykevin/clean-architecture-for-frontend-sounds-smart-until-you-ship-62f9ccf54030) | Medium author "mernstackdevbykevin" | Undated (search snippet only) | D | Q6 (evidence that the over-layering criticism exists) |
| [AHA Programming](https://kentcdodds.com/blog/aha-programming) | Kent C. Dodds | 2020-06-22 | B | Q4, Q6 |
| [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Kent C. Dodds | 2019 (exact date unverified) | B | Q7 |
| [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Kent C. Dodds | ~2020 (exact date unverified) | B | Q7, Q8 |
| [Don't over useState](https://tkdodo.eu/blog/dont-over-use-state) | Dominik Dorfmeister (TkDodo) | ~2022 | B | Q6, Q7 |
| [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand) | TkDodo | 2022-11-20 | B | Q7 |
| [Redux Style Guide](https://redux.js.org/style-guide/) | Redux maintainers (Mark Erikson et al.) | Living | A | Q1, Q6, Q7 |
| [Redux FAQ: Organizing State](https://redux.js.org/faq/organizing-state) | Redux maintainers | Living | A | Q7 |
| [nuqs (type-safe URL search-params state)](https://nuqs.dev) | 47ng (François Best) | Living (URL only) | C | Q7 |

### 6. Server state and the data layer (TanStack Query)

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [Practical React Query](https://tkdodo.eu/blog/practical-react-query) | TkDodo (TanStack Query maintainer) | 2020-11-16, updated 2023-10-21 | B | Q7, Q8 |
| [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | TkDodo | ~2021 | B | Q8 |
| [The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | TkDodo | 2024-01-17 | B | Q8 |
| [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | TkDodo | 2026-02-23 | B | Q8 |
| [React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms) | TkDodo | ~2022 | B | Q6, Q7 |
| [Type-safe React Query](https://tkdodo.eu/blog/type-safe-react-query) | TkDodo | URL only | B | Q8 (Zod parsing in `queryFn`, not verified) |
| [Mastering Mutations in React Query](https://tkdodo.eu/blog/mastering-mutations-in-react-query) | TkDodo | URL only | B | Q8 (invalidation, not captured) |
| [Does TanStack Query replace global state managers?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state) | TanStack | Living (v5) | A | Q7, Q8 |
| [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) | TanStack | Living (v5) | A | Q8 |
| [Query Options guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) | TanStack | Living (v5, URL only) | A | Q8 |
| [React Hook Form: Get Started](https://react-hook-form.com/get-started) | React Hook Form | Living (URL only) | A | Q6 (form resolver placement, not researched) |

### 7. Constants, types and TypeScript conventions

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [TypeScript Handbook: Enums](https://www.typescriptlang.org/docs/handbook/enums.html) | Microsoft (TS team) | Living | A | Q3 |
| [Why I don't like TypeScript enums](https://www.totaltypescript.com/why-i-dont-like-typescript-enums) | Matt Pocock | Pre-2024 | B | Q3 |
| [erasableSyntaxOnly](https://www.totaltypescript.com/erasable-syntax-only) | Matt Pocock | Early 2025 (TS 5.8) | B | Q3 |
| [Total TypeScript Essentials: Modules, Scripts and Declaration Files](https://www.totaltypescript.com/books/total-typescript-essentials/modules-scripts-and-declaration-files) | Matt Pocock | 2024 | B | Q5 |
| [Zod: Basics (`z.infer`)](https://zod.dev/basics) | Colin McDonnell / Zod | Living (v4) | A | Q5 |
| [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) | Google | Living | B | Q3, Q5, Q9, Q10 |
| [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) | Airbnb | Undated, class-component era (~2016–2019) | B (aged) | Q9 |
| [typescript-eslint: no-magic-numbers](https://typescript-eslint.io/rules/no-magic-numbers/) | typescript-eslint | Living | A | Q3, Q12 |

### 8. Barrel files and module-graph performance

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | TkDodo | 2024-07-26 | B | Q11 |
| [Speeding up the JavaScript ecosystem: The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) | Marvin Hagemeister | 2023-10-08 | B | Q11 |

The following sources also address Q11 and are listed in their primary sections to avoid duplication: Comeau (pro), Wieruch (qualified pro), FSD Public API (required, with costs), Bulletproof project-structure (against), Shu Ding / `optimizePackageImports` (third-party packages only), and Vercel `bundle-barrel-imports` (against).

### 9. Enforcement tooling

| Source | Author / org | Date / version (2026-09-27 snapshot) | Grade | Answers |
|---|---|---|---|---|
| [Bulletproof React: react-vite `.eslintrc.cjs`](https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/.eslintrc.cjs) | Alan Alickovic | Living; legacy eslintrc format | B | Q10, Q12 |
| [Bulletproof React: nextjs-app `.eslintrc.cjs`](https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/.eslintrc.cjs) | Alan Alickovic | Living; legacy eslintrc format | B | Q10, Q12 |
| [eslint-plugin-import repo](https://github.com/import-js/eslint-plugin-import) | import-js | 2.32.0 (2025-06-20); ~69.7M/week; 5,947 stars | A (tool) | Q12 |
| [import/no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | import-js | Living | A (tool) | Q10, Q12 |
| [import/no-cycle](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md) | import-js | Living | A (tool) | Q11, Q12 |
| [import/order](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md) | import-js | Living | A (tool) | Q10, Q12 |
| [eslint-plugin-import-x repo](https://github.com/un-ts/eslint-plugin-import-x) | un-ts | 4.17.1 (2026-06-28); ~7.6M/week; 769 stars | A (tool) | Q12 |
| [import-x no-restricted-paths](https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-restricted-paths.md) | un-ts | Living | A (tool) | Q10, Q12 |
| [ESLint: no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports) | ESLint | Living | A | Q10, Q12 |
| [typescript-eslint: no-restricted-imports](https://typescript-eslint.io/rules/no-restricted-imports/) | typescript-eslint | Living | A | Q10, Q12 |
| [eslint-plugin-boundaries repo](https://github.com/javierbrea/eslint-plugin-boundaries) | Javier Brea | 7.2.0 (2026-08-09); ~1.8M/week; 992 stars | A (tool) | Q10, Q12 |
| [JS Boundaries docs](https://www.jsboundaries.dev/) | Javier Brea | v7 living | A (tool) | Q12 |
| [dependency-cruiser repo](https://github.com/sverweij/dependency-cruiser) | Sander Verweij | 18.4.0 (2026-09-20); ~4.6M/week; 7,222 stars | A (tool) | Q12 |
| [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | Sander Verweij | Living | A (tool) | Q10, Q12 |
| [Steiger (FSD linter)](https://github.com/feature-sliced/steiger) | FSD core team | 0.7.0 (2026-09-25), beta; plugin 0.8.0 | A (tool) | Q12 |
| [@conarti/eslint-plugin-feature-sliced](https://github.com/conarti/eslint-plugin-feature-sliced) | conarti | 2.0.1 (2026-09-18); ~14K/week; 53 stars | C | Q12 |
| [knip repo](https://github.com/webpro-nl/knip) / [knip.dev](https://knip.dev/) | Lars Kappert (webpro-nl) | 6.38.0 (2026-09-23); ~17.3M/week; 12,357 stars | A (tool) | Q12 |
| [knip: Next.js plugin](https://knip.dev/reference/plugins/next) | webpro-nl | Living | A (tool) | Q12 |
| [npm registry: eslint-plugin-react-compiler](https://registry.npmjs.org/eslint-plugin-react-compiler) | npm | Last release 19.1.0-rc.2 (2025-05-14) | A (data) | Q12 (plugin superseded) |
| [expo/expo issue #44237](https://github.com/expo/expo/issues/44237) | Expo | 2025–2026 | C | Q12 (switch to react-hooks plugin) |
| [npm registry: eslint-plugin-boundaries](https://registry.npmjs.org/eslint-plugin-boundaries) / [npm downloads API](https://api.npmjs.org/downloads/point/last-week/eslint-plugin-boundaries) | npm | 2026-09-27 snapshot | A (data) | Q12 (version and download metrics) |

### 10. Skill format and authoring guidance

| Source | Author / org | Date | Grade | Answers |
|---|---|---|---|---|
| [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Anthropic | Living | A | Q13 |
| [Claude Code: Skills](https://code.claude.com/docs/en/skills) | Anthropic | Living | A | Q13 |
| [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | Barry Zhang, Keith Lazuka, Mahesh Murag (Anthropic) | 2025-10-16 | A | Q13 |
| [Agent Skills specification](https://agentskills.io/specification) | agentskills.io | Living | A | Q13 |
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic | Last push 2026-09-24, 178,612 stars | A | Q13 (no React organisation skill exists) |
| [skill-creator SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) | Anthropic | Living | A | Q13 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Vercel Engineering | Last push 2026-08-28, 31,608 stars | B | Q13 |
| [agent-skills: react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | Vercel Engineering | metadata "January 2026" | B | Q11, Q13 (format model; `bundle-barrel-imports`) |
| [agent-skills: composition-patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) | Vercel Engineering | 2026 | B | Q2, Q13 |
| [vercel-labs/next-skills (retired)](https://github.com/vercel-labs/next-skills) | Vercel | Last push 2026-09-16 | B | Q13 |
| [vercel/next.js skills](https://github.com/vercel/next.js/tree/canary/skills) | Vercel | Living | A | Q13 |
| [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) / [rules/](https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules) | Patrick Ellis and community | Last push 2026-05-30, 40,839 stars | C (quality varies) | Q13 |

### Source caveats

Do not cite the TanStack Table introduction page (`tanstack.com/table/latest/docs/introduction`), which returned "not found". Do not cite the Zustand "flux-inspired practice" page, which returned 404. Cite Qiu's Headless Component article and TkDodo's Zustand post instead. Before quoting Google's file-naming rule as normative, re-check the wording of its "File names" section; the notes inferred snake_case from an import example. The "rule of three" is not in Dodds's AHA post, so attribute it to Fowler's *Refactoring* only after verification. Next.js pages were read at docs v16.3.6. The project-structure, boundary and env-var guidance also holds for Next.js 15, but the `next lint` removal is specific to 16. Both Medium D-grade sources were seen only as search results. Cite them only as evidence that a criticism exists, never for facts.
