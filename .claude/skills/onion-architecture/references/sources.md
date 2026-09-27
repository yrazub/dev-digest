# Sources

Each link is listed with the rules or reference files it supports.

## Onion, Clean and Hexagonal architecture

| Source | Used for |
|---|---|
| Jeffrey Palermo, [The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) · [the series](https://jeffreypalermo.com/tag/onion-architecture/) | the original four tenets; dependencies point to the center; "the database is external"; not for small apps (`dep-proportionate`) |
| Herberto Graça, [Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) · [Software Architecture Chronicles](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) | how Onion relates to layered and hexagonal architecture |
| Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | the Dependency Rule, including the rule about *names* (`dep-inward-only`, type-only imports) |
| Alistair Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) | ports and adapters; testing in isolation from devices and databases ([adapters.md](adapters.md)) |
| [Awesome Software Architecture: Onion](https://awesome-architecture.com/onion-architecture/) | a curated index of further reading |
| Gary Bernhardt, [Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) · [Boundaries](https://www.destroyallsoftware.com/talks/boundaries) | pure domain functions, tests without doubles ([testing-by-layer.md](testing-by-layer.md)) |

## DI and the composition root

| Source | Used for |
|---|---|
| Mark Seemann, [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) | `di-composition-root-only`, `di-narrow-deps`, no DI framework |
| [@fastify/awilix](https://github.com/fastify/fastify-awilix) | the alternative we are not adopting |

## Fastify

| Source | Used for |
|---|---|
| Fastify, [Plugins](https://fastify.dev/docs/v5.6.x/Reference/Plugins/) | encapsulation, the plugin DAG, register-order |
| [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) | Fastify 5 with clean architecture and vertical slices |
| [borjatur/clean-architecture-fastify-mongodb](https://github.com/borjatur/clean-architecture-fastify-mongodb) | a route → use case → repository split in TypeScript |
| [Hexagonal Architecture and Clean Architecture (with examples)](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi) | a walk-through of the layers in TypeScript |

## Drizzle, repositories and mappers

| Source | Used for |
|---|---|
| Sentry, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) | `db-tx-owned-by-use-case`: the executor-passing pattern with Drizzle |
| Drizzle, [Transactions](https://orm.drizzle.team/docs/transactions) | nested transactions as savepoints, `tx.rollback()` |
| Khalil Stemmler, [DTOs, Mappers and the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) · [Domain Entities](https://khalilstemmler.com/articles/typescript-domain-driven-design/entities/) | `db-return-domain-types`, where mappers live |
| Paul Serban, [Drizzle ORM Best Practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) | why DB types are kept out of the API layer |

## Zod and boundaries

| Source | Used for |
|---|---|
| Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | `zod-parse-at-boundary`, `zod-trust-inside` |
| [Parse, Don't Validate — in TypeScript](https://cekrem.github.io/posts/parse-dont-validate-typescript/) | the same idea in TypeScript |

## Enforcement

| Source | Used for |
|---|---|
| dependency-cruiser, [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md) · [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | `.dependency-cruiser.cjs` syntax, `$1` group matching, `circular`, known-violations baseline |
| [Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) | layer rules as forbidden paths |
| [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) | `dep-no-cross-module` |
