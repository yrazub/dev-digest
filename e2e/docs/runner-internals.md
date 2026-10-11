# Runner internals

How `run.ts` actually executes a set of flows — the parts the README's
"how a flow works" section doesn't cover because they're implementation,
not the flow-authoring contract.

## One browser session for the whole run, not one per flow

agent-browser runs as a persistent daemon that keeps a page open between
CLI invocations. `run.ts` never opens or closes a session per flow — every
`ab([...])` call across every flow in the run shares the same browser
session, and the session is closed exactly once, in `main()`'s `finally`
block, after every flow has been attempted. This is why a flow that
navigates away from where the previous flow left off (rather than starting
from `{BASE}/` itself) would silently depend on load-bearing state left
behind by whatever ran before it — flows are run in **lexical filename
order** (`loadFlows()` sorts by filename), so `01-` through `07-` is also
the execution order, not just a naming convention.

## Step failure: two different failure shapes

`runFlow()` treats a step's outcome as one of three things:

1. **The `ab()` command itself throws** (non-zero exit, including a
   `wait --text` / `wait --url` that timed out because its condition never
   held). This path: capture the error's first line as `detail`, log a `✗`
   followed by what agent-browser itself printed (its stderr carries the
   reason, e.g. `none match name "…"`), save best-effort failure state —
   `test-results/<flow-id>-fail.png` plus `<flow-id>-fail.txt` with the page
   URL and accessibility snapshot, each error swallowed so it never masks the
   real failure — then `break` out of the step loop. Remaining steps in that
   flow are never attempted.
2. **The command succeeds but its `assert.stdoutIncludes` substring check
   fails.** Same `break`, but **no screenshot** — this branch doesn't call
   the screenshot fallback, because the browser state itself may be
   perfectly correct; it's the command's stdout that didn't contain what
   was expected (used sparingly; most flows rely on `wait --text` /
   `wait --url` as the assertion instead, per the README).
3. **The command succeeds and any assertion passes.** Logged as `✓`,
   loop continues to the next step.

A flow's overall `ok` is `steps.every(s => s.ok)` — since a failure always
`break`s the loop, in practice this means "no step failed," not "all steps
were attempted."

## `find` steps are retried while nothing matches

`wait` polls until its condition holds, but `find` looks once: when no element
matches at that instant it exits non-zero within ~50 ms. A `find` placed right
after a navigation or a re-render therefore races the page, and loses on a
machine where rendering is slow relative to command dispatch (CI).
`runStep()` retries a `find` step every 250 ms for up to `E2E_FIND_WAIT`
(default 10 s), but only while the failure is "no element matched"
(`isNoMatch()` in `lib/assert.ts` — agent-browser's `No element found …` and
`… but none match name …`). Any other failure means an element was matched and
the action on it failed, so it is not repeated and a click is never sent twice.

## `{BASE}` substitution and command dispatch

Each step's `cmd` array is passed through `resolveArgs(step.cmd, BASE)`
(`lib/assert.ts`) before being handed to `execFile`, which substitutes the
literal `{BASE}` token for `E2E_BASE_URL` in whichever argument contains it.
Substitution happens once, per step, right before dispatch — a flow author
never needs to think about it beyond writing `{BASE}` in the JSON. Every
resolved argument is then passed to `execFile` as a discrete array element
(not shelled out through string concatenation), so a value containing shell
metacharacters cannot escape its argument position.

## Exit code

`main()` exits `0` only if every flow's `ok` is `true`; otherwise `1`. This
is what CI's `npm test` step gates on — there is no separate "some flows
failed but it's fine" state.
