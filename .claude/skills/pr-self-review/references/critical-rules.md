# The CRITICAL bar

A single CRITICAL blocks the change, so a CRITICAL has to rest on an **explicit rule**, never on a
reviewer's intuition. This file and the `critical_rules` lists in [`routing.json`](../routing.json)
are the only places the bar is set. `finalize.mjs` enforces them: a CRITICAL whose `rule_id` is not
listed for its skill is reported as WARNING, labelled `clamped`.

A CRITICAL also has to point at a **changed line**. A finding on code the diff did not touch is
reported as a SUGGESTION, labelled `pre-existing`, whatever its rule. Old debt does not block.

## Deterministic: `arch-check`

Every dependency-cruiser violation that is not in `server/.dependency-cruiser-known-violations.json`
and starts in a changed file is CRITICAL, as `dep-cruiser/<rule>`. No model is involved.

## `onion-architecture` and `frontend-ui-architecture`

The rules marked **CRITICAL** in each skill's own table. Map the skill's scale like this:

| Skill impact | Report as |
|---|---|
| CRITICAL | CRITICAL (only the IDs listed in `routing.json`) |
| HIGH | WARNING |
| MEDIUM, LOW | SUGGESTION |

## `security`

Only these, and only with a concrete path from input to sink visible in the diff:

| rule_id | CRITICAL when… |
|---|---|
| `sec-hardcoded-secret` | a real credential, token or private key is committed as a literal (not a placeholder or a test fixture) |
| `sec-injection` | untrusted input reaches raw SQL (`sql.raw`, string-built SQL), a shell command, `eval` or `new Function` |
| `sec-missing-authz` | a new or changed route reads or changes data without the auth or ownership check its sibling routes perform |
| `sec-xss` | `dangerouslySetInnerHTML`, `innerHTML` or a `javascript:` URL is fed data that is not sanitised |
| `sec-secret-exposure` | a secret is logged, returned in a response, or reaches the client bundle (for example through `NEXT_PUBLIC_`) |
| `sec-path-traversal` | a user-controlled path reaches `fs` without being resolved and contained in an allowed root |

Everything else the security skill finds is WARNING at most.

## `react-best-practices`

Only these:

| rule_id | CRITICAL when… |
|---|---|
| `react-hooks-conditional` | a hook is called conditionally, in a loop, after an early return, or outside a component or hook |
| `react-nested-component` | a component is defined inside another component's body |
| `react-render-side-effect` | render mutates props, state or a module variable, or performs I/O |

## Every other skill

`can_block: false` in `routing.json`. Its findings are WARNING at most.
