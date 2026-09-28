---
name: branch-coverage
description: Flag new or changed branches in production code that no test in the diff executes — every if/else, early return, catch and switch case needs its own test.
type: rubric
---

# Branch coverage

For every function the diff adds or changes, list its branches: each `if` / `else`,
early `return`, `throw`, `catch`, `switch` case, `??` / `||` fallback, and ternary arm.
Then check which of them a test in the diff actually executes.

## Rules

- **Flag each branch that no test executes** as a separate finding, citing the line of
  the branch in the production file. Name the input that would reach it.
- A test that calls the function only with a "normal" input covers the happy path
  only. That does **not** count as covering the error, empty or fallback branches.
- A branch that throws or returns an error value needs a test that asserts the error
  (the message or type), not just that "something threw".
- Severity: **WARNING** for an uncovered branch; **CRITICAL** when the uncovered branch
  handles money, auth, deletion or a public API response.

## Good

```ts
export function discount(total: number, code?: string) {
  if (!code) return total;               // covered: "no code returns the total"
  if (code === 'VIP') return total * 0.8; // covered: "VIP gets 20% off"
  throw new Error(`Unknown code ${code}`); // covered: "unknown code throws"
}
```

Three tests, one per branch, each asserting the exact result or error.

## Bad

```ts
it('applies the VIP discount', () => {
  expect(discount(100, 'VIP')).toBe(80);
});
```

Only the VIP branch runs. The "no code" branch and the "unknown code throws" branch
are never executed. Report both: `discount` line 2 (no test without a code) and line 4
(no test for an unknown code).
