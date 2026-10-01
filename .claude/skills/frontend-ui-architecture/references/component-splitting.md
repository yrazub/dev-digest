# Splitting and composing components

- [split-no-nested-definitions](#split-no-nested-definitions)
- [split-pure](#split-pure)
- [split-on-trigger](#split-on-trigger)
- [split-client-leaves](#split-client-leaves)
- [split-named-subcomponents](#split-named-subcomponents)
- [split-hooks-not-containers](#split-hooks-not-containers)
- [split-composition-order](#split-composition-order)
- [split-one-per-file and split-size-limit](#split-one-per-file-and-split-size-limit)

## split-no-nested-definitions

**CRITICAL.** Never define a component inside another component's body. A nested definition
creates a new component type on every render, so React unmounts and remounts it, and its state
and DOM are lost each time. `eslint-plugin-react-hooks` flags this as `static-components`.

**Incorrect:**

```tsx
function FindingList({ findings }: Props) {
  function Row({ f }: { f: Finding }) {          // new type every render
    return <li>{f.title}</li>;
  }
  return <ul>{findings.map((f) => <Row key={f.id} f={f} />)}</ul>;
}
```

**Correct:** define it at module level, and pass what it needs as props.

```tsx
function FindingRow({ finding }: { finding: Finding }) {
  return <li>{finding.title}</li>;
}

export function FindingList({ findings }: Props) {
  return <ul>{findings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>;
}
```

The same applies to helper functions that need no closure: put them outside the component
(or in `helpers.ts`), so they are not re-created on each render and can be tested alone.

## split-pure

**CRITICAL.** Given the same props, state and context, a component returns the same JSX and
changes nothing outside itself while rendering. It does not mutate props or module variables,
fetch, write to storage or touch the DOM during render. Side effects go in event handlers, or
in an effect when they synchronise with an external system.

## split-on-trigger

**HIGH.** Split a component when one of these concrete problems appears, and not before:

| Trigger | Typical extraction |
|---|---|
| A second place needs the same UI | a component, promoted per `struct-promote` |
| One part re-renders often and drags the rest along | move state down into a child, or lift static content up as `children` |
| The state or logic is hard to follow | a custom hook, or pure helpers |
| The logic is hard to test through the UI | pure helpers in `helpers.ts` |
| A client-only interaction sits inside server-rendered UI | a small `'use client'` leaf |
| An imperative library needs wrapping | a component that owns it |
| The file causes constant merge conflicts | components split along ownership lines |

Splitting early "unnecessarily aggravates prop drilling". Every extracted layer adds props to
thread through. Before reaching for `memo`, try the two structural fixes: **move state down**
and **lift content up**.

**Incorrect:** a list page split in advance into `ListHeader`, `ListBody`, `ListFooter` and
`ListWrapper`, which only forward twelve props to each other.
**Correct:** one component until a trigger fires. Then extract the part that fired it.

## split-client-leaves

**HIGH** (Next.js App Router). Everything a `'use client'` file imports ships to the browser, so
put the directive on small interactive components rather than on a page or layout.

- Server Components fetch and compose. Client leaves handle interaction.
- Pass server-rendered UI into a client component through `children` or other slot props.
- Render context providers as deep in the tree as possible, not at the root by reflex.
- A hook or a browser API makes a file a client component, along with everything it imports.

**Incorrect:**

```tsx
'use client';                      // whole page is now client JS
export default function Page() { /* data + table + one toggle */ }
```

**Correct:**

```tsx
// page.tsx — Server Component
export default async function Page() {
  const rows = await getRows();
  return <Table rows={rows} toolbar={<DensityToggle />} />;
}

// DensityToggle.tsx
'use client';
export function DensityToggle() { /* useState, onClick */ }
```

## split-named-subcomponents

**HIGH** (RSC). A compound subcomponent attached as a static property (`Menu.Item = Item`)
becomes `undefined` when a Server Component imports it through the client boundary. Export
every part by name instead.

```tsx
// Incorrect
Menu.Item = MenuItem;
// usage: <Menu.Item />

// Correct
export { Menu, MenuItem, MenuSeparator };
// usage: <MenuItem />
```

## split-hooks-not-containers

**MEDIUM.** Do not split components into "containers" that fetch and "presentational"
components that render. The pattern's author withdrew it in 2019: "I don't suggest splitting
your components like this anymore". Put stateful logic in a custom hook instead, or fetch
in a Server Component and pass props to interactive leaves.

```tsx
// Correct (client)
export function ReviewPanel({ id }: { id: string }) {
  const { data, isPending } = useReview(id);       // hook = the "container" role
  if (isPending) return <Spinner />;
  return <ReviewSummary review={data} />;
}
```

Presentational components still exist; they simply need no container wrapper.

## split-composition-order

**MEDIUM.** To get data deep into the tree, try these in order:

1. **Props.** Explicit props are the easiest to follow.
2. **`children` or slot props.** Intermediate components that only forward data usually mean a
   component was never extracted. Pass the finished JSX instead.
3. **Context.** Use it for values many distant components read: theme, current user, locale, or
   the internal state of a compound component.
4. **A store.** Use one only for client state that is truly global and frequently updated.

Headless components apply the same principle: a hook supplies the behaviour ("the brains") and
the consumer supplies the markup ("the looks").

## split-one-per-file and split-size-limit

**MEDIUM.** Each file exports one public component. Small private components that exist only to
serve it may stay in the same file until they grow or gain a consumer.

**Convention:** no source gives a line-count or prop-count threshold. If the project wants one,
for example "review files over ~200 lines" or "more than ~7 props suggests two components",
record it as a house rule and treat it as a prompt to check the triggers above, not as an
automatic split.

Sources: react.dev ("Thinking in React", "Your First Component", "Keeping Components Pure",
"Passing Data Deeply with Context"); Next.js "Server and Client Components" and "Server and
Client Boundary"; Kent C. Dodds ("When to break up a component", "Prop drilling", "Compound
components"); Dan Abramov ("Presentational and Container Components", "Before You memo()");
Juntao Qiu ("Headless Component"). The links are in the skill's [README](../README.md#sources).
