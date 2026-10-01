# Enforcement with dependency-cruiser

A rule that exists only in prose drifts, and the 33 baselined leaks are what that drift looks
like. The import-direction rules are therefore checked mechanically.

## Files

| File | What |
|---|---|
| `server/.dependency-cruiser.cjs` | the rules; each `name` is a rule ID from `SKILL.md` |
| `server/.dependency-cruiser-known-violations.json` | the baseline: every leak that existed when the rules were introduced |
| `server/package.json` | `arch:check`, `arch:baseline` |
| `.github/workflows/server-unit.yml` | the `Architecture boundaries` step in the `typecheck` job |

`dependency-cruiser` was already a server dependency (the `depgraph` adapter uses it), so adding
the check changed no lockfile.

## Commands

```bash
cd server
pnpm arch:check       # fails on any violation NOT in the baseline
pnpm arch:baseline    # rewrites the baseline from the current code
pnpm exec depcruise --config .dependency-cruiser.cjs --output-type err src ../reviewer-core/src
                      # every violation, baselined ones included
```

`--ignore-known` takes an optional file argument. Always pass the file explicitly, or the next
positional argument (`src`) is read as the baseline path and the run fails with `EISDIR`.

## Machine-checked rules

`dep-domain-framework-free` · `core-stays-pure` · `core-no-node-io` · `core-public-api-only` ·
`db-only-in-repository` · `dep-no-cross-module` · `edge-fastify-in-routes-only` ·
`di-narrow-deps` · `adapter-no-app-layers` · `platform-no-modules` · `no-circular`.

The rest are review-only because an import graph cannot see them:
- what a repository returns (`db-return-domain-types`);
- where a transaction opens;
- whether a handler holds business logic;
- whether code reads `process.env`.

## Baseline workflow

- **A new violation fails CI. Fix the code.** Never run `arch:baseline` to make a new leak pass.
  That erases the check.
- **When a PR fixes a baselined leak,** run `arch:baseline` in that PR. The file shrinks, and the
  diff shows reviewers which leak was fixed.
- **Adding a rule:** add it, run the full cruise, decide whether the hits are real, then
  baseline. Mention the count in the PR.
- The baseline matches on exact file paths. Renaming or moving a file that is in the baseline
  makes its entry stale, and the moved file fails. That is intended: moving a file is the moment
  to fix its leak.

## What's in the baseline (September 2026)

| Rule | Count | Where |
|---|---|---|
| `db-only-in-repository` | 12 | routes in `pulls`, `polling`, `workspace`, `settings`; `reviews/service.ts`, `run-executor.ts`, `diff-loader.ts`; `repos/helpers.ts`; `settings/feature-models.ts`; `platform/jobs.ts` |
| `di-narrow-deps` | 9 | every existing `service.ts`, `run-executor.ts`, `diff-loader.ts`, `repo-intel/pipeline/*` |
| `no-circular` | 5 | `container.ts ↔ repo-intel/*`; `agents/helpers ↔ agents/repository` |
| `dep-no-cross-module` | 5 | `reviews → pulls/status`; `repos → repo-intel/constants`; `pulls/routes → reviews/helpers` |
| `adapter-no-app-layers` | 2 | `astgrep`, `depgraph` → `repo-intel/constants` |

## Further reading

- dependency-cruiser [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md)
  and [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md).
- [Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c).
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b).
