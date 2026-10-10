# `file-role` — the role of a changed file

`classifyFile(path)` maps a repository-relative path to one of five roles — `core`, `tests`,
`wiring`, `docs`, `boilerplate` (the `SmartDiffRole` enum in `@devdigest/shared`). It is a pure,
synchronous function: no I/O, no framework, no database, no model. Today its only consumer is the
[`smart-diff`](../../smart-diff/domain.ts) module, which lays the groups out in `ROLE_ORDER`.

It lives in `modules/_shared/` rather than in `smart-diff` so a second module can import it: a
module never imports another module (`dep-no-cross-module` in `server/.dependency-cruiser.cjs`), and
`reviewer-core` cannot import from `server/src/` at all (`core-stays-pure`). The Smart Diff server
spec ([`server/specs/L03-smart-diff.md`](../../../../specs/L03-smart-diff.md)) names the `reviews`
module in L08 as that second consumer; nothing imports the classifier there yet.

| File | Owns |
|---|---|
| [`constants.ts`](constants.ts) | `ROLE_ORDER` (the reading order of the groups) and `ROLE_RULES` (the ordered rules). The only place a pattern or the order is written |
| [`classify.ts`](classify.ts) | `classifyFile` and its matcher |

## How a path is classified

`ROLE_RULES` is walked in order — boilerplate, tests, wiring, docs — and the first rule that
matches decides. A path no rule matches is `core`, so `core` has no rule of its own. A rule holds
three kinds of pattern, all case-sensitive:

| Kind | Tested against | Matches when |
|---|---|---|
| `names` | the last path segment | the name equals the pattern; `*` is the only wildcard, and may stand anywhere (`*.test.ts`, `tsconfig*.json`, `*.generated.*`) |
| `dirs` | every segment except the last | any of them equals the directory name, at any depth |
| `roots` | the first segment | the path has at least two segments and the first one equals the name |

Consequences worth knowing, each visible in `classify.ts`:

- **The order of the rules is part of the rule set.** A lock file under `e2e/` is `boilerplate`,
  not `tests`, because boilerplate is checked first; `.claude/**` is `wiring` and so wins over
  `*.md` for a Markdown file under `.claude/`.
- **A file named like a directory is not in that directory.** `dirs` skips the last segment, so a
  file called `build` or `test` is `core`.
- **A root only counts at the root.** `docs/guide.txt` is `docs`; `src/docs/guide.txt` is `core`.
- **Matching never builds a `RegExp`.** A changed path is author-controlled text, so the wildcard is
  matched with a prefix, a suffix and `indexOf` for the parts between, which leaves nothing to
  backtrack. The test file pins a 4 000-character path of repeated `.config` segments classifying
  within 100 ms.
- **The path is not normalised.** It is split on `/` as given, and an empty string is `core`.

## Changing a pattern

Edit `ROLE_RULES` in `constants.ts` and nowhere else. The classifier's table test
(`server/test/smart-diff-classify.test.ts`) pins the checking order, the three cases where two rules
could both match, and the seeded demo paths; the client carries no copy of the patterns and only
receives roles from `GET /pulls/:id/smart-diff` (see [`../../../../README.md`](../../../../README.md)
→ "API map").
