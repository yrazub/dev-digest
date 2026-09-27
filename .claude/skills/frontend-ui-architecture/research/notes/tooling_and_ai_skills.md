# Tooling that enforces React/frontend architecture boundaries, and AI-agent skills/rules for React code organization

Data snapshot: 2026-09-27. GitHub stars / last push from the GitHub REST API (`api.github.com/repos/...`); npm versions from `registry.npmjs.org`; weekly downloads from `api.npmjs.org/downloads/point/last-week/...`. All URLs below were checked to return HTTP 200 (npmjs.com package pages return 403 to scripted requests, so registry/GitHub URLs are cited instead).

Target-repo context verified locally: `client/package.json` has `next ^15.1.3`, `react ^19.0.0`, `@tanstack/react-query ^5.62.8` and **no ESLint dependency, no `eslint.config.*`, and no `lint` script** — so any enforcement tool would be a fresh addition, not a tweak to an existing config. `.claude/skills/` already contains `react-best-practices` and `next-best-practices`.

## (a) Which tools enforce React/frontend architecture boundaries, and how does Bulletproof React configure them?

### Takeaway
The mature, actively maintained options are `import/no-restricted-paths` + `import/no-cycle` (eslint-plugin-import or its faster fork import-x) for simple zone rules, eslint-plugin-boundaries for element-type rules, and dependency-cruiser for regex/group-based rules and cycle/orphan detection outside ESLint; Steiger is the official FSD linter (still beta). Bulletproof React, the most popular reference, uses only `import/no-restricted-paths` (cross-feature ban + unidirectional app → features → shared) plus `import/no-cycle`.

### Cited Findings

**Summary table (snapshot 2026-09-27)**

| Tool | Latest version (date) | Weekly npm downloads | GitHub stars / last push | Status |
|---|---|---|---|---|
| eslint-plugin-import | 2.32.0 (2025-06-20) | ~69.7M | 5,947 / 2026-08-23 | Maintained but slow release cadence (last release > 1 year old) |
| eslint-plugin-import-x | 4.17.1 (2026-06-28) | ~7.6M | 769 / 2026-09-20 | Active fork |
| eslint-plugin-boundaries | 7.2.0 (2026-08-09) | ~1.8M | 992 / 2026-09-27 | Active |
| dependency-cruiser | 18.4.0 (2026-09-20) | ~4.6M | 7,222 / 2026-09-23 | Active |
| steiger | 0.7.0 (2026-09-25) | ~102K | 430 / 2026-09-25 | Active, beta (0.x) |
| @feature-sliced/steiger-plugin | 0.8.0 (2026-09-25) | ~122K | (same repo) | Active |
| @conarti/eslint-plugin-feature-sliced | 2.0.1 (2026-09-18) | ~14K | 53 / 2026-09-19 | Active, small community project |
| knip | 6.38.0 (2026-09-23) | ~17.3M | 12,357 / 2026-09-23 | Active |
| eslint-plugin-react-hooks | 7.1.1 (2026-04-17) | ~111.6M | (facebook/react) | Active, official |
| eslint-config-next | 16.3.6 (2026-09-22) | ~37.1M | (vercel/next.js, 142,757) | Active, official |
| eslint-plugin-react-compiler | 19.1.0-rc.2 (2025-05-14) | ~1.5M | — | **Stale — superseded by eslint-plugin-react-hooks** |

Sources for the table: [eslint-plugin-boundaries repo](https://github.com/javierbrea/eslint-plugin-boundaries), [eslint-plugin-import repo](https://github.com/import-js/eslint-plugin-import), [eslint-plugin-import-x repo](https://github.com/un-ts/eslint-plugin-import-x), [dependency-cruiser repo](https://github.com/sverweij/dependency-cruiser), [Steiger repo](https://github.com/feature-sliced/steiger), [conarti/eslint-plugin-feature-sliced repo](https://github.com/conarti/eslint-plugin-feature-sliced), [knip repo](https://github.com/webpro-nl/knip), [npm registry](https://registry.npmjs.org/eslint-plugin-boundaries), [npm downloads API](https://api.npmjs.org/downloads/point/last-week/eslint-plugin-boundaries).

**Bulletproof React (alan2207, 35,896 stars, last push 2026-05-14)**
- Recommends a `src/` layout of `app/ assets/ components/ config/ features/ hooks/ lib/ stores/ testing/ types/ utils/`, and says to "organize most of the code within the features folder"; a feature may contain `api/ assets/ components/ hooks/ stores/ types/ utils/`, and "You don't need all of these folders for every feature." — [Bulletproof React: project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Advises against feature barrel files: they "can cause issues for Vite to do tree shaking … Therefore, it is recommended to import the files directly." — [project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Advises against cross-feature imports: "compose different features at the application level." — [project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Actual config uses `import/no-restricted-paths` with three zone groups: (1) one zone per feature, `target: './src/features/<x>', from: './src/features', except: ['./<x>']` (bans cross-feature imports); (2) `target: './src/features', from: './src/app'` (features cannot import app); (3) `target: ['./src/components','./src/hooks','./src/lib','./src/types','./src/utils'], from: ['./src/features','./src/app']` (shared code cannot import features/app). It also enables `'import/no-cycle': 'error'`. — [apps/react-vite/.eslintrc.cjs](https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/.eslintrc.cjs); the Next.js app uses the same zones — [apps/nextjs-app/.eslintrc.cjs](https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/.eslintrc.cjs)
- Note: those configs are legacy `.eslintrc.cjs` (ESLint 8 eslintrc format), not flat config — [apps/nextjs-app/.eslintrc.cjs](https://github.com/alan2207/bulletproof-react/blob/master/apps/nextjs-app/.eslintrc.cjs)

**eslint-plugin-import `no-restricted-paths` / `no-cycle`**
- `no-restricted-paths` takes `zones` of `{ target, from, except, message }`, i.e. file-location-based rules (importer path vs imported path) — [rule docs](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md); `no-cycle` — [rule docs](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md)
- The same rule exists in the import-x fork, which "aims to provide a more performant" alternative — [import-x no-restricted-paths](https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-restricted-paths.md); [import-x repo](https://github.com/un-ts/eslint-plugin-import-x)

**ESLint core `no-restricted-imports`**
- Supports `paths` (exact module names, `importNames`, `allowImportNames`, custom `message`) and `patterns` (gitignore-style `group` or `regex`, with `!` negation, `caseSensitive`) — [ESLint docs](https://eslint.org/docs/latest/rules/no-restricted-imports)
- Limitation: it matches the import specifier only and cannot make restrictions depend on the importing file's location (use per-file `overrides`/flat-config `files` blocks, or `no-restricted-paths`/boundaries for that) — [ESLint docs](https://eslint.org/docs/latest/rules/no-restricted-imports)
- typescript-eslint's extension adds `allowTypeImports` to permit `import type` while blocking runtime imports — [typescript-eslint no-restricted-imports](https://typescript-eslint.io/rules/no-restricted-imports/)
- Practical use for a skill: banning deep imports into a feature's internals (e.g. `@/features/*/*`) or banning a library outside one wrapper module.

**eslint-plugin-boundaries (javierbrea)**
- Classifies files into "elements" (`boundaries/elements: [{ type, pattern }]`) and enforces allowed dependencies between element types; rules include `boundaries/dependencies`, `boundaries/entry-point`, `boundaries/no-private`, `boundaries/no-unknown`, `boundaries/external` — [GitHub README](https://github.com/javierbrea/eslint-plugin-boundaries)
- Official docs site is jsboundaries.dev; v7 is the current major, introducing "file descriptors, multi-dimensional classification, and array queries", with a v6→v7 migration guide — [JS Boundaries docs](https://www.jsboundaries.dev/)
- Needs an import resolver (TypeScript resolver) to classify path-aliased imports — [GitHub README](https://github.com/javierbrea/eslint-plugin-boundaries)

**dependency-cruiser (sverweij)**
- Rules are `forbidden`, `allowed`, `required`, with `from`/`to` regex `path`/`pathNot` conditions; group capture (`$1`) expresses "no cross-feature imports" in one rule: `from: { path: "^src/features/([^/]+)/.+" }, to: { path: "^src/features/([^/]+)/.+", pathNot: "^src/features/$1/.+" }` — [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- Also offers `circular`, `orphan`, `reachable`, `couldNotResolve` conditions; `--init` generates starter rules including `no-circular` and `no-orphans` — [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- Runs as a separate CLI (not ESLint), and can visualize the graph — [repo](https://github.com/sverweij/dependency-cruiser)

**Steiger + @feature-sliced/steiger-plugin (official FSD linter)**
- "Universal file structure and project architecture linter"; run with `npx steiger ./src` (`--watch` available); zero-config, optional `steiger.config.ts` via `defineConfig()` — [Steiger repo](https://github.com/feature-sliced/steiger)
- FSD plugin rules include `forbidden-imports`, `public-api`, `no-segmentless-slices`, `insignificant-slice`, `excessive-slicing`, `no-cross-imports` (~20 rules) — [Steiger repo](https://github.com/feature-sliced/steiger)
- Status: "beta … some APIs may change" — [Steiger repo](https://github.com/feature-sliced/steiger)
- FSD with Next.js: keep Next's `app/` at the project root and FSD in `src/`; rename FSD `app`/`pages` layers to `_app`/`_pages`; re-export pages (`export { ExamplePage as default } from '@/_pages/example'`); use `index.server.ts` as a server-only public API — [FSD: Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- FSD methodology repo: 2,371 stars, last push 2026-09-23 — [feature-sliced/documentation](https://github.com/feature-sliced/documentation); site — [feature-sliced.design](https://feature-sliced.design/)

**@conarti/eslint-plugin-feature-sliced**
- Rules: `layers-slices` ("A file may import only from layers below its own", cross-slice only via `@x`), `absolute-relative`, `public-api` (slice reachable only through its `index`), `no-cross-segment-reexport`; bundles import-x `order` preconfigured for FSD — [repo](https://github.com/conarti/eslint-plugin-feature-sliced)
- v2.x requires ESLint 9 flat config; ESLint 8 users stay on 1.x — [repo](https://github.com/conarti/eslint-plugin-feature-sliced)
- Community project (53 stars, ~14K weekly downloads); does not reference Steiger — [repo](https://github.com/conarti/eslint-plugin-feature-sliced)

**eslint-plugin-react-hooks (incl. React Compiler rules)**
- `recommended` preset now has 17 rules: `rules-of-hooks`, `exhaustive-deps` plus compiler-derived rules `component-hook-factories`, `config`, `error-boundaries`, `gating`, `globals`, `immutability`, `incompatible-library`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `unsupported-syntax`, `use-memo` — [react.dev: eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
- "React Compiler diagnostics are automatically surfaced by this ESLint plugin, and can be used even if your app hasn't adopted the compiler yet." — [react.dev](https://react.dev/reference/eslint-plugin-react-hooks)
- Compiler rules were merged into eslint-plugin-react-hooks from 6.0.0-rc.1; the standalone `eslint-plugin-react-compiler` is superseded (its last release is 19.1.0-rc.2, 2025-05-14) — [facebook/react package](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks); [expo issue #44237 noting the switch](https://github.com/expo/expo/issues/44237); version date from [npm registry](https://registry.npmjs.org/eslint-plugin-react-compiler)
- Relevance to a code-organization skill: `static-components` and `component-hook-factories` flag components/hooks defined inside other components — a file-organization smell. — [react.dev](https://react.dev/reference/eslint-plugin-react-hooks)

**Next.js ESLint config**
- `eslint-config-next` bundles recommended sets from `eslint-plugin-react`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`; presets `eslint-config-next`, `/core-web-vitals`, `/typescript`; flat-config `eslint.config.mjs` with `defineConfig([...nextVitals, ...nextTs, globalIgnores([...])])` (docs version 16.3.6, lastUpdated 2026-08-25) — [Next.js docs: ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)
- The `@next/next/*` rules are about Next primitives (fonts, scripts, `<img>`, `<head>`, `no-async-client-component`), not folder architecture — [Next.js docs: ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)
- `next lint` was deprecated in 15.5 and removed in 16.0 in favor of the ESLint CLI; a codemod migrates — [Next.js 15.5 blog](https://nextjs.org/blog/next-15-5); [Next.js docs: ESLint, version table](https://nextjs.org/docs/app/api-reference/config/eslint)
- Official App Router project-structure/colocation doc — [Next.js: Project structure](https://nextjs.org/docs/app/getting-started/project-structure)

**knip (webpro-nl)**
- Finds unused files, dependencies and exports; 12,357 stars — [knip repo](https://github.com/webpro-nl/knip); [knip.dev](https://knip.dev/)
- Next.js plugin auto-activates when `next` is a dependency and treats `{,src/}app/**/{layout,page,route,template}.{js,jsx,ts,tsx}` (plus manifest/robots/sitemap/image files) as entry points; "Custom `config` or `entry` options override default values, they are not merged." — [knip: Next.js plugin](https://knip.dev/reference/plugins/next)

### Inferences
- For a small Next.js App Router client with no ESLint today, the lowest-friction enforcement path is Bulletproof-style `import/no-restricted-paths` zones + `import/no-cycle` (or import-x equivalents) inside a flat `eslint.config.mjs` built on `eslint-config-next`; eslint-plugin-boundaries becomes worth it once there are more than ~2–3 element types or entry-point/private-file rules are needed.
- dependency-cruiser's `$1` group matching expresses "no cross-feature imports" in one rule instead of one zone per feature (Bulletproof's approach needs a new zone every time a feature is added), which is a maintenance advantage.
- Steiger/FSD tooling only pays off if the repo adopts FSD's layer vocabulary; with Next.js it also requires the `_app`/`_pages` renaming, a heavy change for an existing codebase.
- Bulletproof's advice against barrel files agrees with Vercel's `bundle-barrel-imports` rule (see section b), so a skill can state "no feature-level barrel re-exports" with two independent sources.
- A skill can point at these tools as the "deterministic escalation" of its rules (the skill describes where things go; lint enforces it), which matches Anthropic's advice to prefer scripts/validators for deterministic checks.

### Gaps
- Could not confirm from the changelog whether `boundaries/element-types` was renamed to `boundaries/dependencies` in v6 or v7 (CHANGELOG path not found at `master`); the README lists `boundaries/dependencies` as the core rule. Check the [v6→v7 migration guide](https://www.jsboundaries.dev/) before citing old rule names.
- Did not verify whether eslint-plugin-import 2.32 fully supports ESLint 9 flat config without compat shims; import-x is commonly used for flat config, but no primary source was fetched on this.
- Bulletproof React has no flat-config version of its import restrictions in the repo (as of last push 2026-05-14).
- `@feature-sliced/eslint-config` (older official FSD ESLint config) status was not checked.

## (b) What existing AI-agent skills / rule files cover React code organization, and what format do the good ones use?

### Takeaway
Vercel's `agent-skills` repo is the strongest model: a short SKILL.md index with a priority/impact table and rule IDs, plus one file per rule under `rules/` with frontmatter (`title`, `impact`, `tags`) and Incorrect/Correct code pairs and a reference link. Neither Vercel nor Anthropic ships a skill specifically about React folder/file organization; the closest is Vercel's `composition-patterns`. `vercel-labs/next-skills` has been retired in favor of skills inside `vercel/next.js` and bundled docs.

### Cited Findings

**vercel-labs/agent-skills (31,608 stars, last push 2026-08-28)**
- Skills in `skills/`: `composition-patterns`, `deploy-to-vercel`, `react-best-practices`, `react-native-skills`, `react-view-transitions`, `vercel-cli-with-tokens`, `vercel-optimize`, `web-design-guidelines`, `writing-guidelines` — [repo](https://github.com/vercel-labs/agent-skills)
- `react-best-practices` (skill name `vercel-react-best-practices`): frontmatter has `name`, `description` ("…This skill should be used when writing, reviewing, or refactoring React/Next.js code… Triggers on tasks involving…"), `license: MIT`, `metadata: {author, version}`; body = "When to Apply" list + "Rule Categories by Priority" table (Priority / Category / Impact CRITICAL→LOW / rule-ID prefix like `async-`, `bundle-`, `rerender-`) + a Quick Reference listing every rule ID with a one-line summary; says it "Contains 70 rules across 8 categories" — [SKILL.md](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- File layout: `SKILL.md`, `AGENTS.md` (compiled full document), `README.md`, `metadata.json` (`organization: "Vercel Engineering"`, `date: "January 2026"`, `references: [...]`), `rules/_sections.md`, `rules/_template.md`, and one `rules/<prefix>-<name>.md` per rule — [react-best-practices dir](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- Rule template: frontmatter `title`, `impact` (e.g. MEDIUM), `impactDescription`, `tags`; body "**Incorrect (…):**" code block, "**Correct (…):**" code block, and "Reference: [link]" — [rules/_template.md](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- Includes `bundle-barrel-imports` — "Import directly, avoid barrel files" — [SKILL.md](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- `composition-patterns` (name `vercel-composition-patterns`): "React composition patterns that scale. Use when refactoring components with boolean prop proliferation…"; categories `architecture-` (HIGH), `state-`, `patterns-`, `react19-`; rules such as `architecture-avoid-boolean-props`, `architecture-compound-components`, `patterns-explicit-variants`, `state-lift-state`, `react19-no-forwardref` — [composition-patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns)

**vercel-labs/next-skills (982 stars, last push 2026-09-16) — retired**
- README: "Next.js Agent Skills have moved" to `vercel/next.js/skills`; `next-best-practices` "is no longer a skill. This knowledge is now delivered through the bundled docs and the auto-generated `AGENTS.md` / `CLAUDE.md` written by `next dev` (Next.js 16.3+)"; `next-upgrade` also removed; old local copies "will not receive updates" — [vercel-labs/next-skills README](https://github.com/vercel-labs/next-skills)
- Current Next.js skills are workflows: `next-dev-loop`, `next-cache-components-adoption`, `next-cache-components-optimizer`, `next-partial-prefetching-adoption`, `next-partial-prefetching-optimizer` — [vercel/next.js/skills](https://github.com/vercel/next.js/tree/canary/skills)
- Next.js position: "Framework knowledge comes from the bundled docs, not from Skills. Benchmark results show that always-available context outperforms on-demand retrieval. Skills cover the tasks that are workflows rather than lookups." — [Next.js: AI agents guide](https://nextjs.org/docs/app/guides/ai-agents) (lastUpdated 2026-09-07)
- On Next ≤16.1, `npx @next/codemod@canary agents-md` downloads version-matched docs to `.next-docs/` and indexes them in `AGENTS.md` — [Next.js: AI agents guide](https://nextjs.org/docs/app/guides/ai-agents)

**anthropics/skills (178,612 stars, last push 2026-09-24)**
- Skills include `frontend-design`, `web-artifacts-builder`, `webapp-testing`, `skill-creator`, `mcp-builder`, `claude-api`, document skills (`docx`, `pdf`, `pptx`, `xlsx`), among others; none is a React code-organization skill — [anthropics/skills](https://github.com/anthropics/skills)
- `skill-creator` is Anthropic's skill for creating/evaluating skills — [skill-creator/SKILL.md](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)

**PatrickJS/awesome-cursorrules (40,839 stars, last push 2026-05-30)**
- Collection of community rule files under `rules/`, now in Cursor's `.mdc` Project Rules format with frontmatter `description`, `globs`, `alwaysApply`; legacy `.cursorrules` superseded by `.cursor/rules/*.mdc` — [repo](https://github.com/PatrickJS/awesome-cursorrules); [rules/](https://github.com/PatrickJS/awesome-cursorrules/tree/main/rules)
- Includes many React/Next.js variants (Next.js 15 + React 19, TanStack Query v5, shadcn/ui, etc.) — [repo](https://github.com/PatrickJS/awesome-cursorrules)
- Community-contributed; quality varies per file and there is no review of accuracy beyond contribution guidelines (my assessment; the repo's own contributing guide asks for original, reusable rules) — [repo](https://github.com/PatrickJS/awesome-cursorrules)

**Agent Skills open specification (agentskills.io)**
- Frontmatter: required `name` (≤64 chars, lowercase/digits/hyphens, no leading/trailing or double hyphen, must match directory) and `description` (≤1024 chars, what + when + keywords); optional `license`, `compatibility` (≤500), `metadata` (string map), `allowed-tools` (experimental) — [agentskills.io specification](https://agentskills.io/specification)
- Conventional optional dirs `scripts/`, `references/`, `assets/`; progressive disclosure budgets: metadata ~100 tokens, SKILL.md body < 5000 tokens recommended, resources on demand; "Keep your main `SKILL.md` under 500 lines"; "Keep file references one level deep" — [agentskills.io specification](https://agentskills.io/specification)
- `skills-ref validate ./my-skill` validates frontmatter — [agentskills.io specification](https://agentskills.io/specification)

### Inferences
- Best format to copy for a code-organization skill: Vercel's pattern (SKILL.md = index with categories, impact/severity, rule IDs; one reference file per rule with Incorrect/Correct examples and a source link). With only a handful of rules, a single `references.md`/`examples.md` pair (as the target repo's convention allows) is a lighter equivalent.
- The Next.js team's "always-available context beats on-demand retrieval" finding suggests the handful of highest-value placement rules (e.g. "no cross-feature imports", "where constants/utils go") might belong in `client/CLAUDE.md` too, with the skill holding the detail and examples.
- The repo's existing `next-best-practices` skill appears to be a copy of the now-retired `vercel-labs/next-skills` skill (name match; not verified by diff) and will not receive updates.
- No widely adopted, dedicated "React folder structure" Claude skill was found among the official collections; the gap the new skill would fill is real.

### Gaps
- Did not find a specific, widely starred third-party Claude Code skill focused solely on React project structure (2025–2026); searched only official collections and awesome-cursorrules. Marketplaces like skills.sh were not surveyed systematically.
- No reliable adoption metrics (install counts) for individual skills were found; star counts are per-repository, not per-skill.
- Did not diff the local `.claude/skills/next-best-practices` against the retired Vercel version.

## (c) What is Anthropic's official guidance on writing effective skills?

### Takeaway
Anthropic's guidance: write a third-person description stating what + when (with trigger keywords), keep SKILL.md concise and under 500 lines, use progressive disclosure with reference files linked one level deep from SKILL.md, give a default instead of many options, use concrete examples and checklists/feedback loops, and build evaluations before writing extensive content.

### Cited Findings
- "The context window is a public good"; "Default assumption: Claude is already very smart. Only add context Claude doesn't already have." — [Skill authoring best practices (platform.claude.com)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Match "degrees of freedom" to task fragility: high freedom (text heuristics) when "Decisions depend on context", low freedom (exact scripts) when operations are fragile — [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- `name`: ≤64 chars, lowercase/numbers/hyphens, no "anthropic"/"claude"; gerund names suggested (`processing-pdfs`), noun phrases acceptable; avoid vague names like `helper`, `utils` — [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- `description`: ≤1,024 chars; "Always write in third person"; include both what the Skill does and when to use it, with specific key terms; Claude chooses among "potentially 100+ available Skills" by description — [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Progressive disclosure: SKILL.md is an overview "like a table of contents"; patterns are high-level guide with references, domain-specific `reference/` files, conditional details; "Keep references one level deep from SKILL.md"; reference files over 100 lines should start with a table of contents — [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Content: avoid time-sensitive info (use an "Old patterns" section), use consistent terminology, "Avoid offering too many options" — provide a default with an escape hatch; examples pattern with input/output pairs; checklists for multi-step workflows; validator → fix → repeat feedback loops — [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- "Create evaluations BEFORE writing extensive documentation"; build three scenarios, measure baseline without the skill; iterate with "Claude A" (author) and "Claude B" (tester); checklist includes "At least three evaluations created" and testing with Haiku, Sonnet and Opus — [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Claude Code specifics: skills at `.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/` (personal); frontmatter also supports `disable-model-invocation`, `user-invocable: false` (background knowledge only), `allowed-tools`, `context: fork`; "the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"; "Keep `SKILL.md` under 500 lines"; supporting files like `reference.md`, `examples.md` should be linked from SKILL.md; once invoked, SKILL.md "stays there across later turns… Claude Code does not re-read the skill file", so write it as standing guidance — [Claude Code docs: Skills](https://code.claude.com/docs/en/skills)
- Anthropic engineering blog "Equipping agents for the real world with Agent Skills" (Barry Zhang, Keith Lazuka, Mahesh Murag; 2025-10-16): three levels of disclosure (metadata → SKILL.md body → linked files), "Start with evaluation", split SKILL.md when contexts become mutually exclusive, monitor triggering and refine name/description — [Anthropic engineering blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

### Inferences
- For the new skill: name like `organizing-react-code` or `react-code-organization` (noun phrase acceptable); a third-person description naming concrete triggers ("where to put a new component/hook/constant/util", "splitting a large component file", "feature folder", "colocation") and explicitly deferring hooks/state anti-patterns to the existing `react-best-practices` skill to avoid overlapping triggers.
- Code organization is a "high freedom / heuristic" domain, so decision tables ("if used by one feature → colocate; by 2+ → shared") fit better than rigid scripts; the deterministic part (import boundaries) can point to lint rules from section (a).
- Keep SKILL.md well under 500 lines, with `examples.md` (Incorrect/Correct pairs in Vercel style) and `references.md` (the sources list) linked one level deep.

### Gaps
- Anthropic docs do not prescribe severity levels for rule-style skills; the CRITICAL→LOW impact scheme comes from Vercel, not Anthropic.
- The `when_to_use` frontmatter field is mentioned in the Claude Code docs' truncation note but its full semantics were not captured in the fetched summary.
