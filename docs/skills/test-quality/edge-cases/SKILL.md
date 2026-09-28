---
name: edge-cases
description: Flag tests that only use typical values — require boundary inputs (empty, zero, one, max, negative, null, duplicate) for every new function that takes collections, numbers or optional values.
type: rubric
---

# Edge cases

A test suite that only feeds "typical" values proves the function works on the one
input the author had in mind. Bugs live at the edges.

## Rules

For every new or changed function in the diff, look at its parameter types and check
that a test covers each relevant edge:

| Parameter | Edges a test must cover |
|---|---|
| array / list / string | empty; exactly one element; duplicates |
| number | `0`; negative; the boundary where behaviour changes (`>=` vs `>`) |
| optional / nullable | `undefined` and `null` |
| pagination (`limit`, `offset`) | `0`, the last page, past the end |
| dates / times | the same instant; a range where start > end |

- **Flag each missing edge** that the function's code treats specially, or that
  would plausibly crash it (division by zero, `arr[0]` on an empty array,
  `.length - 1` on an empty string).
- Cite the line in the production code that mishandles or special-cases the edge,
  and name the exact input for the test to add.
- Severity: **WARNING** by default; **CRITICAL** if the edge crashes a request
  handler or corrupts stored data.

## Good

```ts
it.each([
  [[], 0],
  [[5], 5],
  [[5, 5], 5],
])('average(%j) is %d', (xs, avg) => expect(average(xs)).toBe(avg));
```

## Bad

```ts
it('averages numbers', () => {
  expect(average([2, 4, 6])).toBe(4);
});
```

`average` does `sum / xs.length`. On `[]` that is `0 / 0` = `NaN`, which no test checks.
Report it at the division line and ask for the empty-array test.
