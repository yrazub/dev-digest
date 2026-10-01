# DI and the composition root

> "A Composition Root is a (preferably) unique location in an application where modules are
> composed together." — Mark Seemann

Dependency inversion is what makes the onion work: the core declares a port, the edge implements
it, and **one place** plugs them together. Everywhere else receives what it needs and never looks
anything up.

## The roots in DevDigest

| Root | Composes |
|---|---|
| `platform/container.ts` | config, db, secrets, auth, jobs, run bus, and every adapter (lazy getters; async `github()`, `llm()`, `embedder()`) |
| `src/app.ts` | Fastify plugins, the error handler, the boot-time reaper, module registration |
| `modules/<m>/routes.ts` | that module's own services, built from `app.container` |

`container.ts` exposes adapters and a few shared repositories (`agentsRepo`, `reviewRepo`). It
is the only file in `platform/` allowed to import a module (`platform-no-modules` ✓).

## `di-narrow-deps` ✓: for new services

Today every service takes the whole `Container` (`new ReviewService(container)`). That is a
service locator. The constructor hides the real dependencies, a test must fake a container, and
nothing stops the service from grabbing `container.db`. It also causes the import cycles
`container.ts → repo-intel/service.ts → container.ts`. All of this is baselined.

A **new** service declares the ports it uses. Its module plugin wires it:

```ts
// modules/digests/service.ts
export interface DigestDeps {
  store: DigestStore;                          // ports.ts, or the concrete repo if pass-through
  github: () => Promise<GitHubClient>;         // keep lazy: resolving it may throw ConfigError
  llm: (p: Provider) => Promise<LLMProvider>;
  log: Logger;
}
export class DigestService {
  constructor(private readonly deps: DigestDeps) {}
}

// modules/digests/routes.ts — the module's composition root
const { container } = app;
const digests = new DigestService({
  store: new DigestRepository(container.db),
  github: () => container.github(),
  llm: (p) => container.llm(p),
  log: app.log,
});
```

- Pass **functions** for secret-backed clients (`github`, `llm`, `embedder`), not resolved
  instances. Resolving at wiring time would make the module fail to register when a key is
  missing (`di-lazy-secrets`).
- When two modules need the same service, give it a lazy getter in `container.ts`. That is the
  shared root.
- **Existing services are migrated only when a task already touches them.** When one is, run
  `pnpm arch:baseline` in the same PR so the baseline shrinks.

## `di-composition-root-only`

`new OctokitGitHubClient(…)`, `new ReviewRepository(db)` or `new SomeService(…)` appear only in a
composition root or in a test. A service that `new`s its own repository has hard-wired Postgres
into the use case.

## `di-lazy-secrets`

The server boots with no keys (`server/CLAUDE.md`). Secret-backed clients are created on first
use and cached, and a missing key throws `ConfigError` **at resolve time**. After a key changes,
`invalidateSecretCaches()` drops them. Don't move resolution earlier, and don't cache a resolved
client inside a service. Hold the function and call it per use.

## No DI framework

`@fastify/awilix` exists, and its request scopes are nice. DevDigest uses a hand-written
container ("Pure DI"). It is explicit and typed, and it keeps test overrides simple
(`buildApp({ overrides })`). Seemann's point applies: with a real composition root, the choice of
container stops mattering. Don't add one.

## Further reading

- Mark Seemann, [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/).
- [@fastify/awilix](https://github.com/fastify/fastify-awilix): the alternative we are not
  adopting.
