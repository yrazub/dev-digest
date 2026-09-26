---
name: engineering-insights
description: "Captures a non-obvious engineering finding into the INSIGHTS.md of the module the work touched, under a fixed rubric — What Works, What Doesn't Work, Codebase Patterns, Tool & Library Notes, Decisions, Recurring Errors & Fixes, Open Questions, Session Notes. Use the moment a session turns up something a later session would otherwise re-derive: a bug whose cause was not what the symptom suggested, a fix that cost more than a few minutes, a convention only visible by reading the code, a dependency or toolchain quirk, a decision made for a reason worth keeping, an approach tried and abandoned, or a question left open. Use again at the end of any substantial session that hit a problem, made a decision or discovered something. Use when the user asks to record an insight, a learning or a lesson, to note something for next time, or to wrap up a session."
---

# Engineering insights

Write down what this session learned, so the next one does not pay for it again.

The target is the `INSIGHTS.md` of the module the work touched. Entries are **append-only**
and survive the code they were written about.

## When to run

**As you go.** The moment something non-obvious surfaces, capture it — not at the end, when
the detail that made it worth writing has already fallen out of context. Triggers: the cause
was not what the symptom suggested · a fix cost more than a few minutes · a convention turned
up that no document states · a dependency, script or environment behaved unexpectedly · a
choice was made and the reason matters · an approach was abandoned.

**At wrap-up.** Before a substantial session ends, sweep it once for anything not yet
captured, then add one dated `Session Notes` line.

**Skip** sessions that produced nothing but renames, formatting, config tweaks or a typo fix.
An empty capture is a correct outcome. Signal quality beats volume — a file nobody trusts is
worse than a short one.

## Workflow

```
- [ ] 1. Route      — which INSIGHTS.md owns this finding
- [ ] 2. Read       — open that file; see what is already there
- [ ] 3. Collide    — grep for a near-match; skip, extend, or resolve a contradiction
- [ ] 4. Classify   — pick exactly one rubric
- [ ] 5. Draft      — use the entry format below
- [ ] 6. Gate       — run the three tests; discard the entry if it fails one
- [ ] 7. Append     — add under its heading, at the end of that section
- [ ] 8. Note       — one dated line under Session Notes
```

## 1. Route

| The finding is about… | Write to |
|---|---|
| `server/**`, including `src/modules/repo-intel/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| two or more packages, or none of them — git, CI, Docker, secrets, `scripts/`, the agent workflow itself | root `INSIGHTS.md` |

Check with `git diff --name-only` (add `HEAD` for committed work) rather than from memory.

Two rules the table does not cover:

- **A session that touched two modules writes one entry in each**, each stated from that
  module's side. Do not merge them into one file, and do not promote to the root — the root is
  for findings that genuinely belong to no single package, not for findings that are merely
  inconvenient to split.
- **`*/src/vendor/**` belongs to nobody.** Vendored code is not edited here, so record the
  finding against the package that consumes it.

## 2–3. Read, then resolve the collision

**Never append before reading.** Grep the target file for the terms the new entry would use —
the error string, the file name, the command, the symbol:

```bash
grep -in 'journal\|migration\|frozen-lockfile' server/INSIGHTS.md
```

Grep the root file too, and from the root grep the module files: a module finding often has a
general rule already recorded at the root, and vice versa.

Then pick one of four outcomes deliberately. Appending is not the default.

| What the grep found | Do this |
|---|---|
| nothing related | write the new entry |
| the same claim, nothing new | **write nothing.** A second copy does not make the first truer, and two near-identical entries are how these files stop being read |
| the same topic, with a new detail or a narrower case | **extend** — append a dated line beneath the existing entry. Never reword the entry itself |
| something the new finding contradicts | **resolve it** — below |

### When a new finding contradicts an old one

Two entries that disagree are worse than neither: the next session believes whichever it reads
first. The file must never carry an unresolved contradiction.

1. Establish which is true **now** — by running the command or reading the code, not by
   trusting the more recent date.
2. Append to the entry that lost: `**Superseded YYYY-MM-DD:** <what changed>`, naming the
   entry that replaces it. Keep its original text — the record of why the rule existed is what
   stops the rule being reintroduced.
3. If you cannot establish which is true, do not guess. Append
   `**Disputed YYYY-MM-DD:** <the other entry, and why they disagree>` to **both**, and add an
   `Open Questions` line stating the check that would settle it.
4. **Say so in your reply.** A contradiction is the one case worth a human spot-check while
   the session is still fresh.

### When a finding contradicts an instruction elsewhere

Instructions live in `CLAUDE.md`, in skills, in `README.md`, `TESTING.md` and `specs/`.
`INSIGHTS.md` outranks none of them — it is read only when something routes the agent here,
while `CLAUDE.md` is loaded into every session. A dissenting entry is not a correction; it is a
quieter second instruction that the next session will not see.

Write the entry if it is worth keeping, but **stop and tell the user**: name the document and
the rule, the evidence against it, and the edit you would make there. Until that edit lands the
rule still stands — looking wrong is not authority to act against it mid-task.

### The same finding in two files

The root file holding a general rule while a module file holds the mechanics is a legitimate
split, not a duplicate — but each side must name the other with `**See also:** <path>`, or a
session that reads one never learns the other exists. If neither side is the more general one,
it is a plain duplicate: keep the module's, and supersede the root's.

The same applies **between two module files**. One change that lands on both sides of a
boundary — a producer and its consumer, an engine and the server that calls it — becomes one
entry per module, and each must carry a `**See also:** <path>` to the other. Two halves of one
decision, filed in separate files with nothing linking them, read as two unrelated decisions.

## 4. Classify

| Rubric | What belongs there |
|---|---|
| What Works | an approach that held up, specific enough to repeat deliberately |
| What Doesn't Work | an approach that failed or was abandoned, and why |
| Codebase Patterns | a convention or architectural rule discovered by reading the code |
| Tool & Library Notes | a quirk of a dependency, the toolchain or the environment |
| Decisions | a choice, its reason, and the alternative that was rejected |
| Recurring Errors & Fixes | symptom → real cause → rule |
| Open Questions | left unresolved, with what was already ruled out |
| Session Notes | dated one-line summary of a session that produced entries |

Pick exactly one. If an entry seems to fit two, it is probably two entries — or too vague.

## 5. Entry format

Full spec, and the reason each field exists: root [`INSIGHTS.md`](../../../INSIGHTS.md).
The common path:

```markdown
### <symptom or claim, as you actually saw it>
**Date:** YYYY-MM-DD
**Cause:** what was really wrong (not what it looked like).
**Fix / rule:** what to do instead, phrased so it applies next time.
**Evidence:** `path:line` it was verified against (+ the exact error string, if any).
```

for `Recurring Errors & Fixes` and `What Doesn't Work`; everywhere else, one line:

```markdown
- **YYYY-MM-DD** — <claim, with the symbol, command or error string that proves it> (`path:line`)
```

## 6. Quality gate

An entry ships only if it passes all three.

1. **Cold read.** A session that reads this entry and nothing else knows what to do. No "be
   careful with X", no "remember that Y can be tricky".
2. **Obviousness.** If it would be obvious to anyone reading the code, do not write it. The
   value is in what the code does *not* say.
3. **Evidence.** It names at least one `path:line` that you **opened in this session** and
   that shows the claim, paired with the symbol (`tableCard`, `dockerAvailable`) so it can be
   found again after the line moves. For a finding about an external tool rather than repo
   code, cite the line of the repo config that governs that tool (`.mcp.json:10`), say so if
   that file is local-only, and keep the exact error string. If nothing in the repo shows it,
   write that plainly — never invent a line. An entry that could have been written without
   doing the work is not a finding.

Calibration, with examples from this repo: [`examples.md`](examples.md).

## 7–8. Append, and the rules that keep the file worth reading

- **Append-only.** The text of an existing entry is never reworded or deleted, even when it
  has turned out to be wrong. Everything goes *beneath* it as a dated line —
  `**Superseded …**`, `**Disputed …**`, `**See also:** …`, `**Evidence …:**` (a `path:line`
  for an entry that lacks one, or whose anchor moved), or a further detail. This is what
  "extend an entry" means above; it is not a licence to rewrite one. Deleting destroys the
  record of why the rule existed, which is usually the point of the entry.
- **Add, never reorder.** If the target section heading is missing, add that one heading in
  the canonical order above. Do not restructure, re-sort or reword a file while capturing.
- **Never record a secret**, a token, an absolute home path, or anything specific to one
  customer, repo or PR. These files are committed.
- **Roughly 200 entries is the ceiling** for one file. Past it, stop appending and propose a
  prune or a split by domain instead — the user decides.
- Entries are a draft under review, not a verdict. Say what was captured and where, so it can
  be corrected while the session is still fresh.
