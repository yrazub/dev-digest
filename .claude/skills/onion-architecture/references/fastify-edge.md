# Fastify at the edge

Fastify is a delivery mechanism. Routes adapt HTTP to use cases and back, and nothing below
`routes.ts` knows a request exists.

## `edge-thin-routes`

A handler does four things: take the already-parsed input, resolve context, call **one** use case,
and return a contract.

```ts
// modules/pulls/routes.ts — target shape
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  return pulls.listForRepo(workspaceId, req.params.id);
});
```

Not allowed in a handler:
- a `container.db.select()…` query (`db-only-in-repository`);
- a business branch ("if the latest run failed, then…");
- a loop that persists;
- a call to `container.github()` followed by decisions.

All of these move into the service. `pulls/routes.ts`, `polling/routes.ts`,
`workspace/routes.ts` and `settings/routes.ts` do this today. They are baselined, and new routes
must not copy them.

## `edge-fastify-in-routes-only` ✓

Only `routes.ts` and `modules/_shared/` (`getContext`, `IdParams`) may import `fastify`,
`@fastify/*` or `fastify-*`. A service that needs a logger takes a `Logger` port (see
`run-executor.ts`'s `type Logger`), not `FastifyBaseLogger`. A service that needs cancellation
takes an `AbortSignal` or a callback, not `req.raw`.

## `edge-schema-first`

The Zod schemas from `@devdigest/shared` go on the route via `fastify-type-provider-zod`
(`params`, `querystring`, `body`, and `response` where the contract is stable). Invalid input is a
`422` *before* the handler runs, so the handler never calls `Schema.parse(req.body)`. This is
Fastify's own validation and serialization, and it is also "parse, don't validate" done at the
right layer.

## `edge-errors-mapped-at-edge`

Services throw the taxonomy in `platform/errors.ts`: `NotFoundError`, `ValidationError`,
`ExternalServiceError`, `ConfigError`, or an `AppError(code, …)`. The single
`app.setErrorHandler` in `src/app.ts` turns them into the `{ error: { code, message, details } }`
envelope.

- A service never calls `reply.code()` and never throws Fastify's `httpErrors`.
- An adapter catches its SDK's error and rethrows an `ExternalServiceError` or `ConfigError`, so
  no octokit or openai error type crosses the edge.
- `AppError` carries a `statusCode`. That is a pragmatic shortcut, since it saves a mapping
  table. Keep it, but don't branch on HTTP status inside a service.

## Encapsulation and plugins

- Plugins (helmet, cors, rate-limit, SSE, error handler) register **before** modules, so every
  encapsulated module inherits them (`server/CLAUDE.md`).
- Each module is one plugin registered in `src/modules/index.ts`. It gets `app.container` from
  the root decoration.
- Do not `decorate` the root instance with per-module services. That turns Fastify into a
  service locator shared across modules. Build the module's service inside its own plugin (see
  [composition-root-di.md](composition-root-di.md)).

## `edge-hooks-no-logic`

`onRequest`/`preHandler` hooks are for cross-cutting concerns: auth, workspace context, rate
limits, logging. A rule that applies to one route belongs in that route's use case, not in a hook
where nobody will look for it.

## Further reading

- Fastify, [Plugins](https://fastify.dev/docs/v5.6.x/Reference/Plugins/): encapsulation and the
  plugin DAG.
- [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate): Fastify 5
  with clean architecture and vertical slices. It is heavier than DevDigest needs, but its route
  and use-case split is the same as here.
- Use the `fastify-best-practices` skill for API details.
