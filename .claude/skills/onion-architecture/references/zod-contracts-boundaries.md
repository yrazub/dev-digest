# Zod, contracts and boundaries

> "A parser is a function that consumes less-structured input and produces more-structured
> output." — Alexis King, *Parse, don't validate*

In onion terms, every arrow that crosses the edge *inward* passes through a parser. Past that
point, the core trusts its types.

## `zod-parse-at-boundary`

| Boundary | Where the parse lives |
|---|---|
| HTTP request | the route's schema (`fastify-type-provider-zod`), before the handler |
| LLM output | `reviewer-core/src/llm/structured.ts` (Zod → JSON Schema, parse with repair) |
| GitHub / other SDK responses | the adapter, before returning the port's type |
| Config and env | `platform/config.ts` (`loadConfig`) — the only reader of `process.env` besides secrets |
| Secrets | `adapters/secrets/local.ts` |
| `jsonb` columns read from Postgres | the repository mapper, when the column holds a contract shape |

A value that has not passed one of these parsers is `unknown`. Don't cast it with `as`.

## `zod-contract-once`

Any shape that crosses a package boundary (HTTP body, SSE event, a `reviewer-core` input or
output) is defined **once** in `@devdigest/shared`, as a schema and an inferred type with the same
PascalCase name (root `CLAUDE.md`). Never redeclare it locally. Remember that the client has a
*synced copy*, so a contract change in `server/src/vendor/shared` does not reach the client on its
own.

## `zod-trust-inside`

A service, domain function or repository that receives a `Finding` does not re-parse it.
Re-parsing inside the core is noise. Worse, it hides where the real boundary is, so the next
person adds a boundary that doesn't parse.

## `zod-domain-vs-wire`

The contract is the domain type by default. Introduce a separate internal type only when it
really differs from the wire shape: a branded ID, a derived field, a stricter invariant. Name it
for what it adds (`GroundedFinding`), not `FindingDomain`.

## Further reading

- Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/).
- [Parse, Don't Validate — in TypeScript](https://cekrem.github.io/posts/parse-dont-validate-typescript/).
- Use the `zod` skill for schema API details.
