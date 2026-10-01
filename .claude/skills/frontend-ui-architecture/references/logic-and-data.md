# Business logic, state and data

- [The three homes of logic](#the-three-homes-of-logic)
- [logic-pure-domain](#logic-pure-domain)
- [logic-hooks-wire](#logic-hooks-wire)
- [logic-no-effect-derivation](#logic-no-effect-derivation)
- [logic-state-ladder](#logic-state-ladder)
- [logic-no-server-state-copy](#logic-no-server-state-copy)
- [logic-one-data-path and logic-server-only](#logic-one-data-path-and-logic-server-only)
- [logic-query-options](#logic-query-options)
- [logic-layers-proportionate](#logic-layers-proportionate)

## The three homes of logic

| Kind of logic | Home | Knows about React? |
|---|---|---|
| Business rules: calculations, validation, mapping, decisions | pure functions in `features/<f>/lib/` or the component's `helpers.ts` | no |
| Wiring: state, effects, data fetching, subscriptions | custom hooks (`use-x.ts`) | yes |
| Rendering and user events | components and their event handlers | yes |
| Server data | a server-state cache (TanStack Query, SWR) or Server Components | — |

A component body that holds a thirty-line `reduce` of business rules is a sign that logic has
not found its home yet.

## logic-pure-domain

**CRITICAL.** Business rules are plain TypeScript functions: no hooks, no JSX, no `fetch`. They
are unit-tested without rendering anything.

**Incorrect:**

```tsx
function RunCard({ run }: Props) {
  const score = run.findings.reduce((acc, f) =>
    acc + (f.severity === 'CRITICAL' ? 10 : f.severity === 'WARNING' ? 3 : 1), 0);
  const verdict = score > 20 ? 'request_changes' : 'approve';
  ...
}
```

**Correct:**

```ts
// features/review/lib/verdict.ts
const WEIGHT = { CRITICAL: 10, WARNING: 3, SUGGESTION: 1 } as const;
export function riskScore(findings: Finding[]) {
  return findings.reduce((acc, f) => acc + WEIGHT[f.severity], 0);
}
export function verdictFor(findings: Finding[]) {
  return riskScore(findings) > 20 ? 'request_changes' : 'approve';
}
```

```tsx
function RunCard({ run }: Props) {
  const verdict = verdictFor(run.findings);
  ...
}
```

## logic-hooks-wire

**HIGH.** A custom hook shares *stateful logic*, not state. It connects domain functions to
React state and data. Name hooks after their purpose (`useFindingFilter`), not their lifecycle:
avoid `useMount` and `useEffectOnce` wrappers. A hook used by one component lives in that
component's folder. It is promoted per `struct-promote` when a second consumer appears.

## logic-no-effect-derivation

**CRITICAL.** Ask *why* the code runs:

- because the component is displayed → compute it **during render**;
- because the user did something → do it **in the event handler**;
- to keep in sync with an external system (DOM API, socket, non-React widget) → an **effect**.

**Incorrect:**

```tsx
const [visible, setVisible] = useState<Finding[]>([]);
useEffect(() => { setVisible(findings.filter((f) => f.severity === filter)); }, [findings, filter]);
```

**Correct:**

```tsx
const visible = filterBySeverity(findings, filter);   // derive during render
```

"Whenever a state setter function is only used synchronously in an effect, get rid of the
state." Add `useMemo` only when the computation has been measured to be expensive.

## logic-state-ladder

**HIGH.** Put each piece of state on the lowest rung that works:

1. **Derived.** Compute it from existing props or state; store nothing.
2. **Local `useState`/`useReducer`** in the component that uses it.
3. **Lifted** to the nearest common parent of the components that share it.
4. **The URL** (search params) for state that should survive a reload or be shareable, such as
   filters, tabs and pagination.
5. **Context**, provided near the subtree that reads it.
6. **A global client store**, only for truly app-wide, frequently changing client state. Organise
   the store by feature, with small stores that export hooks.

State placed too high re-renders too much and couples unrelated components.

## logic-no-server-state-copy

**CRITICAL.** Server data and UI state are different kinds of state. Server data lives in the
cache; never mirror it into `useState`, context or a store.

**Incorrect:**

```tsx
const { data } = useReviews();
const [reviews, setReviews] = useState(data);
useEffect(() => setReviews(data), [data]);
```

**Correct:** read `data` directly. To reshape it, derive it during render or use the cache's
`select`. To change it, run a mutation and invalidate or update the cache.

The one sanctioned exception: **seeding a form's initial values** from server data, done
deliberately, with the form owning the draft from then on.

## logic-one-data-path and logic-server-only

**HIGH.** Pick one data-fetching approach per app and one API client, and route every request
through them. Examples: "Server Components fetch through a server-only data access layer", or
"client components use query hooks over a single `api` wrapper". Components never call `fetch`
directly, and there is never a second HTTP client.

In Next.js, server-only data access lives in modules that start with `import 'server-only'`,
return minimal DTOs, and re-check authorisation. Server Actions stay thin: validate the input
with a schema, check authorisation, then call the data layer. Do not render the same data in
both a Server Component and a client query.

## logic-query-options

**MEDIUM** (TanStack Query). Keep each resource's queries in one module. That module exports:

- a **query-key factory**, hierarchical from general to specific;
- **`queryOptions`** builders, which work in `useQuery`, in prefetching, in route loaders and
  in event handlers;
- optionally, thin `useX` hooks built on those options.

```ts
// data/reviews.ts
export const reviewKeys = {
  all: ['reviews'] as const,
  list: (repo: string) => [...reviewKeys.all, 'list', repo] as const,
  detail: (id: string) => [...reviewKeys.all, 'detail', id] as const,
};

export const reviewOptions = (id: string) =>
  queryOptions({ queryKey: reviewKeys.detail(id), queryFn: () => api.getReview(id) });

export const useReview = (id: string) => useQuery(reviewOptions(id));
```

Callers compose options at the call site, for example
`useQuery({ ...reviewOptions(id), select: toSummary })`. They do not need a new hook for every
variation.

## logic-layers-proportionate

**MEDIUM.** Layered designs such as view → hooks → domain models → gateway (Fowler / Qiu), or
clean architecture with use cases and ports (Bespoyasov), pay off when the client holds real
business rules. For a thin client over an API, hooks plus a gateway (the API client) are
enough. Add a domain layer when non-trivial client-side rules appear, not before. Even the
authors of those designs warn against applying them to small apps.

Sources: react.dev ("You Might Not Need an Effect", "Separating Events from Effects",
"Choosing the State Structure", "Reusing Logic with Custom Hooks"); Next.js ("Data Security",
"Fetching Data", "Forms"); TanStack Query docs; TkDodo ("Practical React Query", "Effective
React Query Keys", "The Query Options API", "Creating Query Abstractions", "Don't over
useState", "React Query and Forms", "Working with Zustand"); Kent C. Dodds ("State
Colocation", "Application State Management"); Juntao Qiu ("Modularizing React
Applications"); Alex Bespoyasov ("Clean Architecture on Frontend"); Redux Style Guide. The
links are in the skill's [README](../README.md#sources).
