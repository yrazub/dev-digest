---
name: response-schema
description: Flag response-shape changes that the route's declared schema, the shared contract and the handler's actual return value disagree on — types, required fields, nullability and enum values must match on all three.
type: rubric
---

# Response schema

A response has three descriptions that must agree: the shared Zod contract, the
`response` schema the route declares (if any), and what the handler actually returns.
When they drift, consumers get data that their types say cannot happen.

## Rules

- **Type drift**: the handler returns a type the contract does not describe (a `Date`
  where the contract says `string`, a number as a string). WARNING. CRITICAL if a
  consumer parses it.
- **Required vs optional**: a contract field marked required that the handler can
  omit, or `.nullable()` vs `.optional()` confusion (`null` and a missing key are
  different on the wire). WARNING.
- **Enum drift**: the handler can return a value outside the contract's enum (a new
  status like `'queued'` not added to `RunStatus`). CRITICAL, because strict clients
  reject it.
- **Local redeclaration**: a route or client that declares its own copy of a shape
  instead of importing it from the contracts package. WARNING, because the copies
  will drift.

Cite the contract line and the handler line that disagree.

## Good

```ts
// contract
export const Skill = z.object({ created_at: z.string() });
// repository mapping
created_at: row.createdAt.toISOString(),
```

## Bad

```ts
// contract
export const Skill = z.object({ created_at: z.string() });
// repository mapping
created_at: row.createdAt, // a Date: serialises differently, and fails strict parsing
```
