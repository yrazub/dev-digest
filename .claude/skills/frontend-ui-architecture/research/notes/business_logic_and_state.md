# Where business logic, state and data access live in a React / Next.js frontend

Context for the report writer: target project is Next.js 15 App Router + React 19 + TanStack Query v5 + Zod
contracts, with the rule "all data goes through `src/lib/hooks/<resource>.ts` → `src/lib/api.ts`; no fetch in
components; don't mirror server state into React state". Each section notes which sources support or refine it.

Authority scale used below: **A** = official docs of the library/framework (react.dev, nextjs.org, tanstack.com,
redux.js.org); **B** = library maintainer or widely-cited recognised expert (TkDodo = TanStack Query maintainer;
Kent C. Dodds; martinfowler.com); **C** = individual practitioner blog, well-known; **D** = Medium/DEV opinion piece.
All URLs below were fetched or returned HTTP 200 on 2026-09-27 unless marked otherwise.

## Source index (quick reference)

| # | Source | Author / org | Date | Auth. | Fresh? |
|---|---|---|---|---|---|
| 1 | [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team (react.dev) | living doc (React 19.x) | A | current |
| 2 | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | React team | living doc | A | current |
| 3 | [Separating Events from Effects](https://react.dev/learn/separating-events-from-effects) | React team | living doc; `useEffectEvent` ref at [react.dev/reference/react/useEffectEvent](https://react.dev/reference/react/useEffectEvent) | A | current |
| 4 | [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | React team | living doc | A | current |
| 5 | [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components) / [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context) | React team | living doc | A | current (URLs verified 200; content not re-fetched) |
| 6 | [Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | Juntao Qiu, on martinfowler.com | 2023-02-16 | B | slightly older, canonical |
| 7 | [Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | Alex Bespoyasov | 2021-09-02 | C | older, canonical for the style |
| 8 | [Clean Architecture for Frontend Sounds Smart — Until You Ship](https://medium.com/@mernstackdevbykevin/clean-architecture-for-frontend-sounds-smart-until-you-ship-62f9ccf54030) | "mernstackdevbykevin" (Medium) | not verified | D | opinion |
| 9 | [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Kent C. Dodds | 2019 (older-but-canonical; exact date not verified) | B | older, canonical |
| 10 | [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Kent C. Dodds | ~2020 (exact date not verified) | B | older, canonical |
| 11 | [Practical React Query](https://tkdodo.eu/blog/practical-react-query) | Dominik Dorfmeister (TkDodo), TanStack Query maintainer | 2020-11-16, updated 2023-10-21 | B | canonical, updated for v5 |
| 12 | [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | TkDodo | ~2021 (date not captured) | B | canonical |
| 13 | [The Query Options API](https://tkdodo.eu/blog/the-query-options-api) | TkDodo | 2024-01-17 | B | v5, fresh |
| 14 | [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) | TkDodo | 2026-02-23 | B | freshest |
| 15 | [React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms) | TkDodo | ~2022 (date not captured) | B | canonical |
| 16 | [Don't over useState](https://tkdodo.eu/blog/dont-over-use-state) | TkDodo | ~2022 (date not captured) | B | canonical |
| 17 | [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand) | TkDodo | 2022-11-20 | B | older, still standard |
| 18 | [Does TanStack Query replace Redux, MobX or other global state managers?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state) | TanStack | living doc (v5) | A | current |
| 19 | [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) | TanStack | living doc (v5) | A | current |
| 20 | [Query Options guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) | TanStack | living doc (v5) | A | current (URL verified 200) |
| 21 | [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) | Vercel / Next.js | lastUpdated 2026-08-25, docs v16.3.6 | A | fresh |
| 22 | [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) | Vercel / Next.js | lastUpdated 2026-09-07, v16.3.6 | A | fresh |
| 23 | [How to create forms with Server Actions](https://nextjs.org/docs/app/guides/forms) | Vercel / Next.js | lastUpdated 2026-08-25, v16.3.6 | A | fresh |
| 24 | [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Vercel / Next.js | living doc | A | URL verified 200 (content not fetched) |
| 25 | [Redux Style Guide](https://redux.js.org/style-guide/) + [FAQ: Organizing State](https://redux.js.org/faq/organizing-state) | Redux maintainers (Mark Erikson et al.) | living doc | A | current |
| 26 | [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params), [nuqs](https://nuqs.dev) | Vercel; nuqs (47ng) | living | A / C | URLs verified 200, content not fetched |

Note: Next.js docs are now versioned at 16.x; the target project is on 15. The DAL / `server-only` / Server Action
security guidance is not version-specific in substance, but `proxy.ts` (formerly `middleware.ts`) and `use cache`
mentions are 16-era.

## Separating business/domain logic from UI (custom hooks, pure modules, layered architectures, over-layering)

### Takeaway
Official React guidance makes custom hooks the unit for sharing *stateful* logic, and plain functions (no `use`
prefix) the unit for non-stateful logic; the layered view → hooks → domain models → network split (Qiu/Fowler) and
clean architecture (Bespoyasov) are recognised patterns, but both authors themselves warn to apply them only when
the domain logic is substantial.

### Cited Findings
- Custom hooks "let you share stateful logic between components"; they share *logic*, not state — each call has independent state. — [react.dev: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Naming rule: only functions that call hooks get the `use` prefix; a pure helper like `getSorted(items)` must *not* be named `useSorted`. This implies pure domain logic stays in plain functions. — [react.dev: Reusing Logic](https://react.dev/learn/reusing-logic-with-custom-hooks)
- When to extract: duplicated stateful logic, and especially whenever you write an Effect ("stepping outside React"); do *not* extract every tiny duplication, and avoid generic lifecycle hooks like `useMount()` / `useEffectOnce()` because they hide the reactivity model. — [react.dev: Reusing Logic](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Benefit framed as: components express *what* they do, not *how*; migrating to new React APIs means changing one hook. — [react.dev: Reusing Logic](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Qiu/Fowler layers: (1) View — presentational components receiving data and callbacks via props; (2) Hooks — state and side effects; (3) Models — domain objects encapsulating business logic (e.g. a `PaymentMethod` class); (4) Network/Gateway — abstracts data fetching; (5) Strategy — polymorphic objects for variant logic (e.g. per-country). Core framing: React "is a library (not a framework) that helps you build the user interface", so treat the frontend like ordinary software. — [martinfowler.com, Juntao Qiu, 2023-02-16](https://martinfowler.com/articles/modularizing-react-apps.html)
- Qiu's own caveat: "Keep things all together nice and tidy for small and cohesive components, so you don't have to look in multiple places to understand the overall behaviour." — [martinfowler.com](https://martinfowler.com/articles/modularizing-react-apps.html)
- Bespoyasov's clean architecture: Domain (entities + pure transformations, independent) → Application (use cases + ports/interfaces) → Adapters (UI framework, API, storage). Dependency rule: "Only the outer layers can depend on the inner layers." — [bespoyasov.me, 2021-09-02](https://bespoyasov.me/blog/clean-architecture-on-frontend/)
- Bespoyasov's stated costs: more design time, more verbosity and bundle size, harder onboarding when over-engineered; pragmatic violations are acceptable. Minimum he keeps even in simplified form: an extracted independent domain layer + the dependency direction. — [bespoyasov.me](https://bespoyasov.me/blog/clean-architecture-on-frontend/)
- Criticism (low authority, opinion): in production React/Next.js apps clean architecture is "often overengineered complexity disguised as best practice"; anecdote of a small team shipping faster by "violating" the principles. — [Medium opinion piece](https://medium.com/@mernstackdevbykevin/clean-architecture-for-frontend-sounds-smart-until-you-ship-62f9ccf54030) (seen via search result snippet; not fully fetched)
- Related anti-over-abstraction principle: Kent C. Dodds' "AHA programming" (avoid hasty abstractions) — [kentcdodds.com/blog/aha-programming](https://kentcdodds.com/blog/aha-programming) (URL verified 200; content not re-fetched in this session)

### Inferences
- Consensus shape for a mid-sized app: **pure functions/modules for domain rules** (testable without React) + **custom hooks as the adapter that wires those rules to React state and server data** + **presentational components**. Fowler/Qiu and react.dev agree on this; clean architecture adds ports/use-case layers on top, which is where the over-layering criticism bites.
- The target project's `src/lib/hooks/<resource>.ts` → `src/lib/api.ts` split is essentially Qiu's "hooks layer → network/gateway layer", without a separate models layer. That is consistent with Qiu's own caveat for apps whose logic is mostly CRUD over server data; a `models`/domain folder is justified only when non-trivial client-side rules appear (e.g. severity aggregation, derived counts).
- Disagreement: Bespoyasov puts domain at the centre with UI as an adapter; react.dev/TkDodo put the server cache and hooks at the centre and treat "domain" as mostly server-owned. For a thin client over an API (like DevDigest), the latter is the more proportionate reading.

### Gaps
- Dan Abramov's well-known update note on "Presentational and Container Components" (hooks replacing the container split) could not be fetched (Medium returned 403), so it is not cited.
- No 2024–2026 first-party (react.dev) statement on "domain layer" terminology; react.dev only talks about hooks vs plain functions.

## Effects: logic belongs in event handlers or render, not effects

### Takeaway
react.dev is explicit: derive data during render, handle user actions in event handlers, and reserve Effects for
synchronising with external systems; data fetching in Effects is allowed but frameworks/libraries are preferred.

### Cited Findings
- "You don't need Effects to transform data for rendering" — compute derived values at top level during render (e.g. `const fullName = firstName + ' ' + lastName`). — [react.dev: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- "You don't need Effects to handle user events… By the time an Effect runs, you don't know what the user did." POST-on-click belongs in the click handler. — [react.dev](https://react.dev/learn/you-might-not-need-an-effect)
- Expensive derivations → `useMemo`, not state + Effect; reset state on identity change with `key`, not an Effect; shared logic between handlers → a plain function called from both handlers. — [react.dev](https://react.dev/learn/you-might-not-need-an-effect)
- Rule of thumb: "Code that runs because a component was *displayed* should be in Effects, the rest should be in events." Effects are for external systems (non-React widgets, browser APIs, network, subscriptions via `useSyncExternalStore`). — [react.dev](https://react.dev/learn/you-might-not-need-an-effect)
- Decision question: "Why does this code need to run?" — specific interaction → event handler; keep something synchronised → Effect. Non-reactive logic inside an Effect → `useEffectEvent`; "never suppress the dependency linter". — [react.dev: Separating Events from Effects](https://react.dev/learn/separating-events-from-effects); API ref [useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- TkDodo: "Whenever a state setter function is only used synchronously in an effect, get rid of the state!" Effects should sync React with external systems, not sync two React states. — [tkdodo.eu: Don't over useState](https://tkdodo.eu/blog/dont-over-use-state)

### Inferences
- These directly support the target rule "don't mirror server state into React state": the typical violation is `useEffect(() => setX(query.data), [query.data])`, which is exactly the "setter only used in an effect" smell.
- A skill rule could be phrased: *no `useEffect` whose only job is `setState` from props/query data; no `useEffect` triggered by a flag set in a handler — do the work in the handler (or in a `useMutation` `onSuccess`).*

### Gaps
- Exact React version in which `useEffectEvent` became stable was not verified in this session (react.dev now documents it as a normal API reference page).

## State placement: structure, colocation, lifting, server vs client state, URL as state

### Takeaway
Keep state minimal and as close to its use as possible, lift only to the nearest common parent, and treat server
data as a cache owned by a server-state library rather than as application state; global client state is what
remains, and is usually small.

### Cited Findings
- Five structuring principles: group related state; avoid contradictions (single `status` instead of multiple booleans); avoid redundant state (compute from props/state during render); avoid duplication (store `selectedId`, not a copy of the selected object); avoid deep nesting (flatten/normalise). "Make your state as simple as it can be—but no simpler." — [react.dev: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- Don't mirror props in state — the state won't update when the prop changes; only do it deliberately with an `initialX`/`defaultX` prop name. — [react.dev: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- Lifting state up to the closest common parent is the official mechanism for sharing; reducer + context is the documented next step for deep trees. — [react.dev: Sharing State](https://react.dev/learn/sharing-state-between-components), [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context) (URLs verified, content known from docs, not re-fetched)
- "Place code as close to where it's relevant as possible." Decision tree: single component → keep there; one child → move down; siblings → lift to closest common parent; prop drilling → composition, then Context placed near usage; only then global store. "people put things into a global Redux store… that don't really need to be global." — [Kent C. Dodds: State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) (2019, older-but-canonical)
- Two categories: **server cache** vs **UI state**; "We make a mistake when we combine the two. Server cache has inherently different problems from UI state and therefore needs to be managed differently." Context is a last resort after lifting and composition; React Query is "a cache", not a state manager. — [Kent C. Dodds: Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) (~2020)
- TanStack's own docs: after moving async data into Query, a sample global store shrinks from 4 server-derived fields + 2 client fields to just the 2 client fields (`themeMode`, `sidebarStatus`); but "TanStack Query is not a replacement for local/client state management", and apps with heavy synchronous client state (design tools, music production) may still need a client store. — [TanStack: Does this replace client state?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state)
- TkDodo notes most app state is server state or URL state; a client store should cover the rest. — [tkdodo.eu: Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
- URL as state: Next.js exposes `useSearchParams` for reading query-string state in Client Components; `nuqs` is a type-safe search-params state library. — [nextjs.org: useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params), [nuqs.dev](https://nuqs.dev) (URLs verified 200; content not fetched in this session)

### Inferences
- Precedence ladder a skill can encode: **derived in render > local `useState` > lifted to common parent > URL (for shareable/filter/selection state) > Context near usage > global store**, with **server data always in TanStack Query**, never in any of the above.
- The target rule "don't mirror server state into React state" is supported by react.dev (no redundant/duplicated state), Kent C. Dodds (don't combine server cache and UI state), TkDodo (don't copy query data to local state) and TanStack docs. The one sanctioned exception is form initial values (see Forms section).

### Gaps
- Did not fetch a first-party article dedicated to "URL as state" (e.g. a Next.js guide on filters in searchParams); only API refs verified. Exact publication dates of the two Kent C. Dodds posts could not be reliably extracted.

## Data layer: TanStack Query as the server-state layer, keys, queryOptions, custom hooks, API client

### Takeaway
TanStack Query is the server-state layer; the maintainer's guidance has shifted in v5 from "custom hook per query"
toward **`queryOptions` factories colocated per feature**, with hooks as a thin optional wrapper; keys live with
their query functions, hierarchically structured.

### Cited Findings
- Server data is "borrowed" and differs from client state; query keys act like dependency arrays (key change → refetch), so filters in the key replace manual effect orchestration; `enabled` handles dependent/conditional queries. — [TkDodo: Practical React Query (updated 2023-10-21)](https://tkdodo.eu/blog/practical-react-query)
- Best practices listed: don't copy query data into local state (you lose background updates); create custom hooks wrapping queries; don't use the query cache as local state; usually tune `staleTime` (default 0) rather than `gcTime` (default 5 min). — [Practical React Query](https://tkdodo.eu/blog/practical-react-query)
- Keys: always arrays; hierarchical generic → specific (`['todos','list',{filters}]`, `['todos','detail',1]`) so invalidation can target subtrees; colocate keys with their feature rather than a global `utils` file; use a per-feature **query key factory** (`todoKeys.all / lists() / detail(id)`). — [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
- v5 single-object API enables sharing configs between hooks and imperative calls (prefetch); `queryOptions` gives typo detection and ties `queryFn` return type to the key so `getQueryData` is typed. "The `queryKey` defines the dependencies to our `queryFn`… So why define keys in one central place while having the functions far away?" — [TkDodo: The Query Options API, 2024-01-17](https://tkdodo.eu/blog/the-query-options-api); official: [TanStack Query Options guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)
- 2026 update: "Since v5, my preferred way to create Query abstractions is not with custom hooks anymore but with `queryOptions`." Reasons: hooks only work in components/hooks (not route loaders, event handlers, server prefetch); hooks share logic, not configuration; hooks couple you to `useQuery` vs `useSuspenseQuery`. Keep abstractions non-configurable and compose at call site: `useQuery({ ...invoiceOptions(1), select })`. — [TkDodo: Creating Query Abstractions, 2026-02-23](https://tkdodo.eu/blog/creating-query-abstractions)
- Next.js docs list React Query/SWR (or React `use` with a promise passed from a Server Component) as the ways to fetch in Client Components. — [nextjs.org: Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)

### Inferences
- **Disagreement over time (within the same author):** 2020/2023 "Practical React Query" says *create custom hooks per query*; 2024 and 2026 posts say *prefer `queryOptions` factories, hooks optional*. The target project's `src/lib/hooks/<resource>.ts` rule is compatible if each resource file exports `xxxOptions()` / key factory **and** thin `useXxx()` hooks built from them — the options object becomes the reusable unit (for `prefetchQuery`, `invalidateQueries`, `getQueryData`), the hook the convenience for components.
- "No fetch in components; go through `src/lib/api.ts`" matches Qiu's gateway layer and TkDodo's pattern where `queryFn` calls a typed API function; nothing in the sources contradicts it. Parsing responses with the shared Zod contract inside `api.ts` (not in components) keeps one validation point — this is an inference, not a quoted rule (see TkDodo's [Type-safe React Query](https://tkdodo.eu/blog/type-safe-react-query), URL verified, content not fetched).
- Key factories should live in the same `<resource>.ts` file as the options/hooks (colocation), not in a global keys file.

### Gaps
- Did not fetch TkDodo's "Mastering Mutations" ([URL verified](https://tkdodo.eu/blog/mastering-mutations-in-react-query)) — invalidation-vs-setQueryData guidance for mutations is not captured here.
- Exact dates for "Effective React Query Keys", "React Query and Forms", "Don't over useState" were not extracted (page markup didn't expose them).

## Next.js App Router: Server Components, Data Access Layer, Server Actions, `server-only`

### Takeaway
For new projects Next.js recommends a server-only **Data Access Layer** returning minimal DTOs, `import 'server-only'`
to fence server code, thin `"use server"` actions that delegate to the DAL and re-check auth, and choosing one
data-fetching approach per codebase; TanStack recommends not introducing React Query into a fresh RSC app until
needed, and never rendering the same data in both a Server and a Client Component.

### Cited Findings
- Three approaches: external HTTP APIs (existing large apps, "Zero Trust"), Data Access Layer (new projects), component-level data access (prototypes). "We recommend choosing one data fetching approach and avoiding mixing them." — [nextjs.org: Data Security (2026-08-25)](https://nextjs.org/docs/app/guides/data-security)
- DAL should: only run on the server; perform authorization checks; return safe, minimal DTOs. Only the DAL should access `process.env`; audit that DB packages/env vars aren't imported outside it. — [nextjs.org: Data Security](https://nextjs.org/docs/app/guides/data-security)
- `import 'server-only'` causes a build error if the module is imported into client code, keeping "proprietary code or internal business logic" on the server. — [nextjs.org: Data Security](https://nextjs.org/docs/app/guides/data-security)
- Server Actions are reachable by direct POST; re-verify authentication *and* authorization inside every action; validate all client input; return only what the UI needs; keep actions thin and delegate to a `server-only` DAL; no mutations as render side-effects. — [nextjs.org: Data Security](https://nextjs.org/docs/app/guides/data-security)
- Server Components fetch with `fetch` or an ORM directly; identical `fetch` calls are memoized so you "can fetch data in the component that needs it instead of drilling props"; non-fetch access is deduped with `React.cache`; keep preload functions next to the consuming component. — [nextjs.org: Fetching Data (2026-09-07)](https://nextjs.org/docs/app/getting-started/fetching-data)
- TanStack + RSC: prefetch in Server Components, pass dehydrated state through `HydrationBoundary`, new `QueryClient` per request on the server, singleton in browser. Data ownership: avoid rendering the same data in both server and client components — "React Query has no idea of how to revalidate the Server Component". For new RSC apps, "start out with any tools for data fetching your framework provides you with and avoid bringing in React Query until you actually need it." — [TanStack: Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)

### Inferences
- **Tension with the target rule:** Next.js docs normalise fetching in Server Components; the target project routes *all* data through client-side TanStack hooks over a separate Fastify API. This corresponds to Next.js's "External HTTP APIs" approach used in a client-heavy way, and is legitimate under "choose one approach and don't mix" — but a skill should state it as a deliberate project choice, not as a universal React/Next rule. If RSC prefetching is added later, the TanStack prefetch + `HydrationBoundary` pattern (reusing the same `queryOptions`) is the way to keep one source of truth.
- The DAL / `server-only` / Server Action guidance is largely irrelevant when the backend is a separate Fastify service, except: any Next.js route handler or server-side code that reads secrets should import `server-only`.

### Gaps
- Server and Client Components page ([URL verified](https://nextjs.org/docs/app/getting-started/server-and-client-components)) was not re-fetched; its "preventing environment poisoning" section is referenced only via the Data Security page.
- Docs are 16.x; no Next.js-15-pinned docs version was checked.

## Global client state libraries (Zustand / Jotai / Redux Toolkit) and feature organisation

### Takeaway
A global store is justified only for genuinely global, synchronous client state; all sources agree server data
should not live there (RTK Query / TanStack Query instead), stores should be organised by feature, and actions should
model events that encapsulate the logic.

### Cited Findings
- Redux Style Guide (priority B, strongly recommended): feature folders with single-file "slice" logic (`features/todos/todosSlice.ts` next to `Todos.tsx`) instead of folder-by-type; put logic in reducers, not in dispatch sites; model actions as events (`foodOrdered`) not setters; treat reducers as state machines; keep state minimal and derive with selectors; normalise relational data. — [redux.js.org/style-guide](https://redux.js.org/style-guide/)
- Redux (priority C): use RTK Query for data fetching; avoid putting form state in Redux (keep in local state, dispatch on submit); evaluate per piece of state whether it belongs in Redux — global shared data yes, local UI (form input, modals, hover) no. — [redux.js.org/style-guide](https://redux.js.org/style-guide/), [FAQ: Organizing State](https://redux.js.org/faq/organizing-state)
- Zustand (TkDodo): export only custom hooks, not the store; atomic selectors returning stable values; separate `actions` namespace; model actions as events and keep business logic in the store; many small focused stores rather than one; combine with `useQuery` / `useParams` in custom hooks. — [tkdodo.eu: Working with Zustand, 2022-11-20](https://tkdodo.eu/blog/working-with-zustand)
- Kent C. Dodds: Context with multiple logical providers suffices for most apps; Jotai for specialised atomic-performance cases, which "most apps won't need". — [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react)
- TanStack: with server state moved out, global client state is typically tiny (theme, sidebar). — [TanStack docs](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state)

### Inferences
- **Disagreement:** Redux mandates one store per app; TkDodo recommends many small Zustand stores. Both agree on "logic in the store/reducer, components dispatch events".
- For the target project (no global store today), the evidence supports *not* adding one until a piece of client-only state is needed across distant routes and cannot live in the URL or a near-usage Context.

### Gaps
- No Jotai or Zustand official docs page was successfully fetched (the Zustand "flux-inspired practice" URL returned 404 — do not cite it).

## Form logic and validation placement (Zod schemas as contracts)

### Takeaway
Form edit state is local client state; server data may seed a form deliberately; validation belongs at the trust
boundary (server) with the same schema library reused on the client for UX.

### Cited Findings
- Server state is a snapshot the frontend doesn't own; copying it into form initial state is acceptable "if you are doing it deliberately", e.g. single-user forms with `staleTime: Infinity`; for collaborative/large forms, keep them separate and derive displayed value = user edit ?? server value; after mutation, invalidate and reset form state. — [TkDodo: React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms)
- Redux: keep form edits in local component state until submission. — [Redux Style Guide](https://redux.js.org/style-guide/)
- Next.js: client-side validation via HTML attributes; server-side validation with a schema library like Zod/Valibot via `safeParse`, returning `error.flatten().fieldErrors`; display with `useActionState`; always verify auth inside each action. — [nextjs.org: Forms guide (2026-08-25)](https://nextjs.org/docs/app/guides/forms)
- Always validate client input (form data, URL params, headers, searchParams). — [nextjs.org: Data Security](https://nextjs.org/docs/app/guides/data-security)

### Inferences
- The target project's "contracts defined once in `@devdigest/shared` (Zod)" aligns with this: the server validates with the contract; the client should import the same schema (from the vendored copy) for form validation/`z.infer` types rather than redeclaring shapes. The sources support schema reuse implicitly (Next shows Zod at the boundary) but none of the fetched sources explicitly prescribes "share one Zod schema between client and server" — that is an inference/project convention.
- The TkDodo "forms exception" is the one documented, sanctioned case of copying server state into React state; a skill should name it explicitly so the "don't mirror server state" rule isn't applied dogmatically.

### Gaps
- React Hook Form + zodResolver docs ([react-hook-form.com](https://react-hook-form.com/get-started), URL verified) were not fetched; no source here states where the `resolver`/schema file should live.
