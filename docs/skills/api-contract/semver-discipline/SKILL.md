---
name: semver-discipline
description: Flag a breaking API change that ships without a major version bump, and a version bump that does not match the change — breaking means major, additive means minor, fixes mean patch.
type: rubric
---

# Semver discipline

The API version tells consumers whether they can upgrade blindly. It must match the
change.

## Rules

| The diff contains… | Required bump |
|---|---|
| any breaking change (see the `breaking-change` skill) | **major** — a new `/v2` route prefix, or `x.0.0` in the package / OpenAPI version |
| only new optional fields, new routes or widened input | **minor** |
| only bug fixes with no shape change | **patch** |

- **Flag a breaking change with no major bump**: no new version prefix, and the
  version in `package.json` / the OpenAPI `info.version` unchanged or only
  minor/patch-bumped. CRITICAL.
- **Flag a major bump with no breaking change**, because it forces consumers to
  re-certify for nothing. SUGGESTION.
- **Flag an edited `/v1` route** that now behaves like `/v2`. The old version must
  keep its old contract. CRITICAL.

## Good

```ts
app.get('/v1/agents/:id/skills', v1Handler); // unchanged
app.get('/v2/agents/:id/skills', v2Handler); // new shape
```

## Bad

```ts
// package.json: "version": "1.3.0" → "1.3.1"
app.get('/agents/:id/skills', handlerThatRenamedOrderToPosition);
```

A renamed response field shipped as a patch release. CRITICAL.
