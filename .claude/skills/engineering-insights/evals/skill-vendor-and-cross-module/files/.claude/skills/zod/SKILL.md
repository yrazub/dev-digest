---
name: zod
description: Zod schema validation best practices for type safety, parsing and error handling.
---

# Zod

## Error handling

Use `safeParse` and report every problem to the caller:

```ts
const result = Schema.safeParse(input);
if (!result.success) {
  return { errors: result.error.errors.map((e) => e.message) };
}
```
