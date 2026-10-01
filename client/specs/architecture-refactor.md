# Architecture refactor — client (frontend UI architecture)

**Status:** draft · umbrella: [`../../specs/architecture-refactor.md`](../../specs/architecture-refactor.md)

Rules are cited by their `frontend-ui-architecture` skill ID. Where `client/CLAUDE.md` or
`docs/` already sets a convention, the project's rule wins.

## Audit

**Already compliant:**

- routes are colocated in `_components/<Name>/`;
- nothing in `components/` or `lib/` imports from `app/` (`struct-one-way`);
- `fetch` is called only in `lib/api.ts` (`logic-one-data-path`);
- `NEXT_PUBLIC_API_BASE` is read by literal property access (`place-env-literal`);
- no nested component definitions were found;
- `FindingsPopover` sits at the nearest common ancestor of its two consumers,
  `pulls/_components/` (`struct-promote`).

| Rule | Impact | Finding |
|---|---|---|
| `import-no-aggregating-barrel` | HIGH | `lib/hooks/index.ts` re-exports 5 modules with `export *`. Callers mix both paths: PR-detail `page.tsx` imports `usePullDetail` from `lib/hooks` and `usePrReviews` from `lib/hooks/reviews` |
| project convention (`CLAUDE.md`: one hook file per API resource) | HIGH | `lib/hooks/core.ts` bundles settings, secrets, repos, pulls and context hooks. `core` names a kind, not a resource (`place-no-dumping-ground`) |
| `struct-thin-routes` | HIGH | `app/repos/[repoId]/pulls/[number]/page.tsx` (185 lines): 10 data hooks, query invalidation and finding aggregation inside the route file |
| `logic-no-server-state-copy` / `logic-no-effect-derivation` | HIGH | `ConfigTab.tsx` copies 7 agent fields into `useState` and re-syncs them in a `useEffect`. Form initial values are allowed, but the reset should be a `key` on the component, not an effect |
| `place-lib-vs-utils` | MEDIUM | `lib/` mixes configured libraries (`api`, `providers`, `toast`, `theme`, `repo-context`) with pure functions (`format-cost`, `github-urls`, `model-label`) and a type re-export file |
| `import-alias` | MEDIUM | 52 imports climb 3 or more levels (`../../../../../../../lib/hooks`) even though `@/*` is configured |
| enforcement | HIGH | The package has no lint tool at all, so none of these rules is machine-checked |

## C1 — hooks: one file per resource, no aggregating barrel *(suggested first client step)*

**Status:** implemented. `pnpm typecheck`, `pnpm test` (58) and `pnpm build` are green. The only
imports still climbing 3 or more levels are the test fixtures' `messages/en/*.json`, which sit
outside `src/` and so are out of reach of `@/`.

- Split `lib/hooks/core.ts` into `settings.ts` (settings, test connection, secrets status),
  `repos.ts`, `pulls.ts` and `context.ts`. The existing `agents`, `reviews`, `trace` and
  `repo-intel` files stay as they are.
- Delete `lib/hooks/index.ts`. Every caller imports `@/lib/hooks/<resource>`.
- In the same pass, rewrite imports with 3 or more `../` to `@/…`. It is mechanical, and the files
  are already open.
- Update `client/CLAUDE.md` and `docs/data-flow.md`, which still say "Hooks are re-exported from
  `@/lib/hooks`".

**Risk:** low. It is pure moves plus imports, and `pnpm typecheck` catches every broken path.
Component tests mock `fetch` at the network level, so they are unaffected.
**Done when:** `pnpm typecheck` and `pnpm test` are green, `grep -rE "from ['\"]@/lib/hooks['\"]"`
returns nothing, and no import climbs 3 or more levels outside `vendor/`.

## Later phases (outline)

- **C2 — `lib/` vs `utils/`.** Move `format-cost`, `github-urls` and `model-label` (with its test)
  to `src/utils/`. Replace `lib/types.ts` with direct `@devdigest/shared` imports, and move
  `PrRowView` next to the PR-list route that uses it. Record the `lib/` vs `utils/` convention in
  `client/CLAUDE.md`.
- **C3 — thin the PR-detail route.** Move the data wiring (queries, invalidation, number→id
  resolution, finding aggregation) into a colocated `usePrDetail` hook under the route's
  `_components/`. `page.tsx` then only composes. In `ConfigTab`, drop the re-sync effect and let
  the parent pass `key={agent.id + agent.updated_at}`. An `e2e` flow over PR detail is the safety
  net here, because component tests do not cover the page file.
- **C4 — enforcement.** Encode `struct-one-way`, "no app route imports a sibling route's
  `_components`", "no aggregating barrels" and `no-circular` as lint rules. The cheapest option is
  dependency-cruiser, which mirrors the server setup. It is a dev-dependency change (`pnpm add -D`
  inside `client/`, which updates the lockfile), so it needs an explicit go-ahead.
