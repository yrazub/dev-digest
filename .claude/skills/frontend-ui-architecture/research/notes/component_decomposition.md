# React component decomposition and composition — annotated sources

Scope: when and how to split React components, composition patterns, the Server/Client boundary as a
decomposition axis, file layout / barrel files, purity. Target context: Next.js 15 App Router + React 19 +
TanStack Query, feature folders `_components/<Name>/` each with an `index.ts`.

Authority legend: **A** = official framework docs (react.dev, nextjs.org) · **B** = framework core-team
member or recognised expert writing under their own name (Dan Abramov, Kent C. Dodds, TkDodo, Shu Ding,
Marvin Hagemeister, martinfowler.com) · **C** = community/aggregator reference (patterns.dev).
All URLs below were fetched during this research (2026-09-27) and resolved, except where noted.

## 1. When to split a component

### Takeaway
Official guidance is "one component, one concern; decompose when it grows, and let the data model's shape
suggest the hierarchy". Expert guidance adds a counterweight: split when a concrete problem appears
(reuse, state tangle, performance, testing), not pre-emptively — premature splitting worsens prop drilling.

### Cited Findings
- react.dev "Thinking in React" (A, no date shown; React-team docs, current): three lenses for deciding
  component boundaries — programming (separation of concerns: "a component should ideally only be concerned
  with one thing. If it ends up growing, it should be decomposed into smaller subcomponents"), CSS (what you'd
  make class selectors for), design (the design's layers). Also: "Separate your UI into components, where each
  component matches one piece of your data model." Five-step process: break UI into hierarchy → static version
  → minimal complete state → where state lives → inverse data flow. — [react.dev: Thinking in React](https://react.dev/learn/thinking-in-react)
- react.dev "Your First Component" (A): multiple components may live in one file when "relatively small or
  tightly related"; move them to separate files when the file gets crowded. — [react.dev: Your First Component](https://react.dev/learn/your-first-component)
- Kent C. Dodds, "When to break up a component into multiple components", 2019-07-19 (B, older but still
  cited): split when you hit a real problem — whole-app re-renders on state change, needing reuse, state that
  is cognitively hard to track, hard-to-isolate tests, merge conflicts among engineers, integrating third-party
  libs/HOCs, wrapping imperative APIs declaratively. "When you experience one of the problems above, that's when
  you break your component into multiple smaller components. NOT BEFORE." Quotes Sandi Metz: "Duplication is
  far cheaper than the wrong abstraction." — [kentcdodds.com: When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)
- Kent C. Dodds, "Prop Drilling", 2018-05-21 (B, older): "breaking out render methods into multiple
  components unnecessarily aggravates prop drilling"; "Wait until you really need to reuse a block before
  breaking it out"; "Keep state as close to where it's relevant as possible." — [kentcdodds.com: Prop Drilling](https://kentcdodds.com/blog/prop-drilling)
- Dan Abramov, "Before You memo()", 2021-02-23 (B): splitting is also a performance tool — "move state down"
  (extract the part that depends on changing state into its own component) and "lift content up" (pass the
  static part as `children`, so React skips it on re-render). Advises looking to "split the parts that change
  from the parts that don't change" before reaching for `memo`/`useMemo`. — [overreacted.io: Before You memo()](https://overreacted.io/before-you-memo/)
- react.dev "Reusing Logic with Custom Hooks" (A): extract a hook for duplicated/Effect logic or to step
  outside React; don't extract trivial wrappers of one `useState`; keep hooks "focused on concrete high-level
  use cases" and avoid generic lifecycle hooks (`useMount`, `useEffectOnce`); don't prefix non-hook functions
  with `use`; hooks share logic, not state. — [react.dev: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Inferences
- **Disagreement (mild):** react.dev leans "decompose as it grows"; Dodds leans "don't split until a concrete
  problem". They converge on "don't split speculatively", but a skill should state a trigger list (Dodds) rather
  than a line-count rule.
- Sub-component vs render helper: none of the fetched primary sources gives a line-count threshold. The
  relevant hard rule is react.dev's "never nest component definitions" (§6); a render *helper function* called
  inline (`{renderRow(x)}`) is not a component and doesn't create identity problems, while a *component* must be
  top-level. Extracting a real component is what enables "move state down"/"lift content up" (Abramov).

### Gaps
- No authoritative source found that gives a numeric size heuristic (lines, props count). Any such rule in the
  skill would be a house convention, not a cited one.

## 2. Container/presentational → hooks → Server Components

### Takeaway
The container/presentational split (Abramov, 2015) was explicitly disavowed by its author in 2019 in favour of
hooks; today the "container" role is filled by custom hooks (client, e.g. TanStack Query hooks) or by Server
Components that fetch and pass props to client leaves.

### Cited Findings
- Dan Abramov, "Presentational and Container Components" (B; original 2015, canonical but superseded).
  2019 note at the top: "I wrote this article a long time ago and my views have since evolved. In particular,
  I don't suggest splitting your components like this anymore." Reason (per search excerpt of the same note):
  "The main reason I found it useful was because it let me separate complex stateful logic from other aspects of
  the component. Hooks let me do the same thing without an arbitrary division." Original traits: presentational =
  how things look, data via props, no Redux/Flux deps; container = how things work, stateful, often generated
  via HOCs like `connect()`. — [medium.com/@dan_abramov](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
  (Medium returns HTTP 403 to automated fetch; content verified via mirror [readmedium.com](https://readmedium.com/smart-and-dumb-components-7ca2f9a7c7d0)). Cite the medium.com URL.
- patterns.dev "Container/Presentational Pattern" (C): lists pros (separation, reusable/testable presentational
  parts) and cons; states "Hooks make it possible to achieve the same result without having to use the
  Container/Presentational pattern" and that modern React favours hooks. — [patterns.dev: Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/)
- Juntao Qiu, "Modularizing React Applications with Established UI Patterns", martinfowler.com, 2023-02-16 (B):
  "Separate view from no-view logic, split the no-view logic further by their responsibilities and place them in
  the right places." Refactoring steps: extract state into custom hooks → pure prop-only sub-components →
  domain model objects → strategy pattern for variant logic → isolated network/data layer (anti-corruption layer).
  — [martinfowler.com: Modularizing React Apps](https://martinfowler.com/articles/modularizing-react-apps.html)
- Next.js docs (A, v16.3.6, updated 2026-08-25): Server Components "fetch data from databases or APIs close to
  the source" and pass props to Client Components (`<Page>` fetches, `<LikeButton>` handles interactivity) —
  i.e. the server component plays the old container role. — [nextjs.org: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Next.js "Server and Client Boundary" guide (A, same version): with RSC "a Server Component can fetch data while
  rendering"; to stream, start the request in a Server Component and pass the pending promise to a Client
  Component that reads it with `use`. — [nextjs.org: Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary)

### Inferences
- For a TanStack-Query-on-the-client project: the modern equivalent of a "container" is a feature hook
  (`useFindings()` wrapping `useQuery`) consumed by the view component, not a wrapper component. Qiu's article is
  the best longer-form citation for "views stay dumb, logic in hooks/domain modules".

### Gaps
- Did not fetch a TkDodo/TanStack source on combining TanStack Query with RSC (prefetch + HydrationBoundary);
  another researcher may cover data fetching.

## 3. Composition patterns

### Takeaway
Prefer, in order: plain props → `children`/slot props ("lift content up") → context (for genuinely wide
concerns). Compound components and headless components/hooks are the established patterns for reusable UI
with shared implicit state; render props are largely superseded by hooks.

### Cited Findings
- react.dev "Passing Data Deeply with Context" → "Before you use context" (A): "Just because you need to pass
  some props several levels deep doesn't mean you should put that information into context." Alternatives first:
  (1) pass props — explicit data flow; (2) "Extract components and pass JSX as `children`" — if intermediate
  components only forward data, "this often means that you forgot to extract some components along the way"
  (`<Layout><Posts posts={posts} /></Layout>` instead of `<Layout posts={posts} />`). Context use cases: theming,
  current account, routing, managing state (reducer + context). — [react.dev: Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context)
- Kent C. Dodds, "Prop Drilling" (B, 2018): prop drilling is often fine because it's explicit; use context for
  values needed deep in the tree; "context is kinda taking us back to the days of global variables". —
  [kentcdodds.com: Prop Drilling](https://kentcdodds.com/blog/prop-drilling)
- Dan Abramov, "Before You memo()" (B, 2021): `children` as the "lift content up" composition technique. —
  [overreacted.io](https://overreacted.io/before-you-memo/)
- Kent C. Dodds, "React Hooks: Compound Components", 2019-02-18 (B): compound components share implicit state
  via context (`<Toggle><ToggleOn/><ToggleOff/><ToggleButton/></Toggle>`), analogous to `<select>`/`<option>`. —
  [kentcdodds.com: Compound Components with Hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- patterns.dev "Compound Pattern" (C): two implementations — Context, or `React.Children.map` + `cloneElement`;
  the latter only works on direct children and risks prop-name collisions (shallow merge). — [patterns.dev: Compound Pattern](https://www.patterns.dev/react/compound-pattern)
- Juntao Qiu, "Headless Component: a pattern for composing React UIs", martinfowler.com, 2023-11-07 (B): a
  headless component is usually a custom hook that owns behaviour/state/a11y and leaves rendering to the consumer
  ("provides the 'brains'… leaves the 'looks'"). Cites React Aria, Headless UI, TanStack (React) Table, Downshift.
  Cautions: learning curve; unnecessary indirection if overused; not every component needs it. —
  [martinfowler.com: Headless Component](https://martinfowler.com/articles/headless-component.html)
- Radix Primitives "Composition" guide (A for Radix): `asChild` merges Radix behaviour onto your own element;
  your component must spread all props onto the DOM node and accept a ref; you remain responsible for
  accessibility when changing element type. — [radix-ui.com: Composition](https://www.radix-ui.com/primitives/docs/guides/composition)
  (Note: guide still mentions `React.forwardRef`; in React 19 `ref` is a regular prop, so forwardRef is no
  longer required for function components — inference, not verified on the Radix page.)

### Inferences
- Render props: no 2024–26 primary source fetched here; patterns.dev and Abramov's 2019 note both frame hooks
  as the replacement for logic-sharing wrappers. Render props survive mainly as slot-like "render this item" APIs.
- Next.js adds a constraint to compound components (see §4): static-property subcomponents (`Menu.Item`) break
  across the server/client boundary.

### Gaps
- TanStack Table's intro page (`tanstack.com/table/latest/docs/introduction`) returned "not found" at fetch
  time; cite Qiu's article for the headless definition instead, or re-verify the TanStack URL.

## 4. Server vs Client Components as a decomposition axis (Next.js App Router)

### Takeaway
Official Next.js docs make the client boundary an explicit reason to split: keep pages/layouts as Server
Components, put `'use client'` on small interactive leaves, and pass server-rendered UI into client components
via `children`/slot props.

### Cited Findings
- nextjs.org "Server and Client Components" (A, v16.3.6, updated 2026-08-25):
  - Use Client Components for state/event handlers, effects, browser APIs, custom hooks; Server Components for
    data fetching near the source, secrets, less JS, better FCP.
  - "To reduce the size of your client JavaScript bundles, add `'use client'` to specific interactive components
    instead of marking large parts of your UI as Client Components." (Layout stays server; only `<Search/>` is client.)
  - Once a file has `'use client'`, "all of its imports and the components it directly renders are included in
    the client bundle" — but not Server Components passed as children/props.
  - Interleaving: "A common pattern is to use `children` to create a *slot* in a `<ClientComponent>`" (e.g.
    server `<Cart>` inside client `<Modal>`).
  - Context providers: wrap in a client component taking `children`; "render providers as deep as possible in the tree".
  - Wrap client-only third-party components in your own `'use client'` file; use `server-only` / `client-only`
    to prevent environment poisoning. Props to client components must be serializable.
  — [nextjs.org: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- nextjs.org "The Server and Client Boundary" guide (A, v16.3.6, updated 2026-08-25): code crosses via imports,
  data via serializable props; functions can't cross except Server Functions. Owner vs parent: a client parent
  can display a server child it never imported. **Compound components across the boundary:** static-property
  subcomponents (`Menu.Item`) become `undefined` when imported by a Server Component ("Element type is invalid") —
  "expose them as named exports instead of static properties." `'use client'` is only needed at the entry of a
  client subtree; wrap shared components in a client wrapper rather than adding the directive everywhere. Native
  HTML (`<details>`, `<form action>`) can give interactivity without a Client Component. —
  [nextjs.org: Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary)

### Inferences
- The older URL `nextjs.org/docs/app/building-your-application/rendering/composition-patterns` (Next 14 era) has
  been reorganised into the two pages above; cite those instead (not re-fetched).
- For this project (client data via TanStack Query), most `_components` will be client components; the rule
  "`'use client'` at the subtree entry, not every file" and "keep `page.tsx`/`layout.tsx` server where possible"
  still apply.

### Gaps
- Next.js 15 vs 16 differences for these pages were not diffed; the fetched docs are v16.3.6.

## 5. One component per file; barrel files / `index.ts`

### Takeaway
react.dev permits multiple small related components per file. Barrel files are criticised by three
authoritative sources for dev/test performance and circular imports in *app code*; Next.js's
`optimizePackageImports` fixes only *third-party package* barrels. The project's per-component `index.ts`
(one re-export each) is the mild form — it does not aggregate a folder, so the main module-graph blow-up
argument applies weakly, but TkDodo's "no index.ts in app code" stance still challenges it.

### Cited Findings
- react.dev "Your First Component" (A): multiple components per file are fine when small/tightly related. —
  [react.dev: Your First Component](https://react.dev/learn/your-first-component)
- Kent C. Dodds, "Colocation", 2019-06-17 (B): "Place code as close to where it's relevant as possible" —
  tests, state, and utilities next to the component that uses them; organise by feature, not file type. —
  [kentcdodds.com: Colocation](https://kentcdodds.com/blog/colocation)
- Dominik Dorfmeister (TkDodo, TanStack Query maintainer), "Please Stop Using Barrel Files", 2024-07-26 (B):
  circular imports when internal modules import from their own barrel; in their Next.js project pages loaded
  "over 11k modules, which took 5-10 seconds"; removing most internal barrels got it "down to about 3.5k modules -
  a reduction of 68%"; any non-re-export line in a barrel defeats optimisation. Exception: libraries' public entry
  point. "If you are writing app code, you're just making your life harder by putting `index.ts` files into
  arbitrary directories." — [tkdodo.eu: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- Marvin Hagemeister, "Speeding up the JavaScript ecosystem - The barrel file debacle", 2023-10-08 (B): module
  loading cost grows with graph size (500 modules ≈ 0.15 s, 10,000 ≈ 3.12 s, 50,000 ≈ 48.44 s); "It's a common
  misconception among JavaScript developers that modules would only be loaded when needed. This is not true."
  Recommends removing barrel files; reports 60–80% tooling speedups. Test runners with per-file processes pay it
  repeatedly. — [marvinh.dev: The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)
- Shu Ding (Vercel), "How we optimized package imports in Next.js", 2023-10-13 (B/A-adjacent): popular packages
  take "200~800ms just to import"; `optimizePackageImports` rewrites barrel imports to direct module imports for
  configured packages; reports 15–70% faster dev, ~28% faster builds, up to 40% faster cold starts. Targets
  third-party packages, not app-internal barrels. — [vercel.com: How we optimized package imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- Next.js `optimizePackageImports` reference (A, v16.3.6, updated 2025-12-19): still `experimental`, "not
  recommended for production"; applies to listed packages (default list includes `lucide-react`, `date-fns`,
  `@headlessui/react`, `recharts`, etc.). — [nextjs.org: optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)

### Inferences
- **Project fit (checked locally):** `client/src/app/**/_components/<Name>/index.ts` files each contain a single
  line, e.g. `export { AgentCard, AgentCard as default } from "./AgentCard";`. That is a per-component
  "folder entry point", not an aggregating barrel: importing `AgentCard` loads exactly one extra tiny module, so
  the 11k-module / O(n) graph explosion described by TkDodo and Hagemeister does not arise. The risks that remain:
  (a) circular imports if a sibling file inside the folder imports `./index` / the folder path — rule: inside a
  folder, import siblings by file path; (b) drift toward aggregating barrels (e.g. a `_components/index.ts` that
  re-exports all components) — which is exactly what the sources warn against; (c) a `'use client'` file
  re-exported through an index is fine, but a barrel mixing server and client exports pulls client modules into
  graphs unnecessarily (inference from Next's "code crosses through imports" rule).
- **Disagreement:** TkDodo's blanket "stop putting index.ts into directories" directly challenges the project
  convention; Hagemeister's and Vercel's evidence is about *large aggregating* barrels. A skill should record this
  as a deliberate trade-off (stable import path `…/_components/AgentCard`, easy file splitting inside the folder)
  and forbid multi-component barrels.

### Gaps
- No measurement found for the cost of single-re-export per-folder index files specifically.

## 6. Purity and nested component definitions

### Takeaway
Components must be pure (same inputs → same JSX, no mutation of pre-existing values during render); side
effects go in event handlers, `useEffect` last. Components must be defined at module top level, never inside
another component.

### Cited Findings
- react.dev "Keeping Components Pure" (A): pure = "minds its own business" + "same inputs, same output";
  StrictMode double-invokes components in development to surface impurity; local mutation of values created
  during render is fine; don't mutate props/state/context; side effects "usually belong inside event handlers",
  `useEffect` as last resort. — [react.dev: Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- react.dev "Your First Component" pitfall (A): "Components can render other components, but **you must never
  nest their definitions**" — it is "very slow and causes bugs"; declare every component at top level and pass
  data via props. — [react.dev: Your First Component](https://react.dev/learn/your-first-component)

### Inferences
- Nested definitions create a new component type every render, so React remounts the subtree and loses its
  state (react.dev links this to the state-preservation docs; the "Preserving and Resetting State" page was not
  separately fetched). This is also why extracting sub-components to top level in the same file (or its own
  file) is preferred over inline component closures.

### Gaps
- React Compiler / "Rules of React" reference page (react.dev/reference/rules) not fetched; it formalises the
  same purity rules and would be a good additional A-grade citation.
