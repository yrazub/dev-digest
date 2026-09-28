---
name: breaking-change
description: Flag any change that breaks an existing consumer of a public route or shared contract — removed or renamed fields, params or routes, narrowed accepted input, changed status codes — as CRITICAL unless the old shape is still served.
type: rubric
---

# Breaking change

A breaking change is anything an existing, unmodified consumer would notice as a
failure. Consumers were written against the old contract. They do not see your PR.

## Treat as breaking (CRITICAL)

- A route removed, renamed, or its method changed (`GET /agents/:id/skills` →
  `GET /agents/:id/skill-links`).
- A path or query parameter renamed, removed, retyped, or made required.
- A response field removed, renamed, or retyped (`order: number` → `position: number`,
  `id: number` → `id: string`).
- A response field made nullable or optional where it was always present.
- Request validation narrowed: a field made required, an enum value removed, a
  string length or a number range tightened.
- A status code changed for an existing outcome (`200` → `201`, `404` → `400`).

## Not breaking

- A new optional request field, or a new response field that consumers can ignore.
- A new route.
- Widening what a request accepts.

## How to report

Cite the changed line in the route or the shared Zod schema. Name the consumer call
that now fails and what it receives instead. Fix: keep the old shape alongside the new
one, or version the route.

## Good

```ts
export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  /** Added in v1.4; `order` stays until v2. */
  position: z.number().int(),
});
```

## Bad

```ts
export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  position: z.number().int(), // was `order`
});
```

Every client that reads `link.order` now gets `undefined`. CRITICAL.
