---
name: deprecation-policy
description: Flag public fields, params or routes that are removed without first being deprecated — mark them deprecated, keep serving them for at least one release, and say what replaces them.
type: rubric
---

# Deprecation policy

Nothing public disappears silently. Removal is the last step of a deprecation, never
the first.

## Rules

- **Silent removal**: a route, parameter or response field is deleted in this diff
  with no earlier deprecation (no `@deprecated` note in the contract, no `Deprecation`
  / `Sunset` response header, no changelog entry). CRITICAL.
- **Deprecate, don't delete**: when replacing something, the diff should add the
  replacement *and* keep the old one, marked deprecated:
  - in the Zod contract: `/** @deprecated use `position`; removed in v2 */` on the
    field, plus `.describe('Deprecated: …')`;
  - on the route: a `Deprecation: true` header and a `Sunset: <date>` header;
  - a changelog line naming the replacement and the removal version.
- **Deprecation without a replacement or a date** is not actionable for consumers.
  WARNING.
- Keep serving the deprecated shape for at least one release after the deprecation
  ships.

## Good

```ts
export const AgentSkillLink = z.object({
  /** @deprecated use `position`; removed in v2 (2026-12-01). */
  order: z.number().int().describe('Deprecated: use position'),
  position: z.number().int(),
});
reply.header('Deprecation', 'true').header('Sunset', 'Tue, 01 Dec 2026 00:00:00 GMT');
```

## Bad

```diff
 export const AgentSkillLink = z.object({
-  order: z.number().int(),
+  position: z.number().int(),
 });
```

`order` vanished with no deprecation period. CRITICAL.
