# Tests by layer

The payoff of the onion is that each layer can be tested with exactly the doubles it needs. Suite
layout, file naming and CI are defined in `TESTING.md`. Read it before adding a test. This file
only maps layers to test kinds.

| Layer | Test kind | Doubles | Suffix / suite |
|---|---|---|---|
| Domain (`domain.ts`, `@devdigest/shared` rules, `reviewer-core` pure functions) | plain unit: values in, values out | **none** | `*.test.ts` — hermetic |
| Application (`service.ts`) | unit with fake ports | in-memory `DigestStore`, `MockLLMProvider`, `MockGitHubClient` | `*.test.ts` — hermetic |
| Repository | integration against real Postgres | none (testcontainers) | `*.it.test.ts` |
| Route | `app.inject` through `buildApp({ config, overrides })` | adapter mocks via `overrides` | `*.test.ts` if no DB, else `*.it.test.ts` |
| Adapter | contract test of the translation (SDK response → port type, SDK error → `AppError`) | the SDK's HTTP stubbed, never the network | `*.test.ts` |

Rules:
- **A domain test that needs a mock is a smell.** The function is doing I/O and belongs in the
  service (*Functional Core, Imperative Shell*).
- **Fake ports, not `vi.mock` of modules.** A service with narrow dependencies takes a hand-written
  fake. `vi.mock('../repository.js')` is what you reach for when a service hides its
  dependencies, and it shows the service needs `di-narrow-deps`.
- **Don't unit-test a repository with a mocked Drizzle.** It tests nothing but your mock. Use
  `*.it.test.ts`.
- No keys and no network in any test (`server/CLAUDE.md`, `reviewer-core/CLAUDE.md`).

Further reading: Gary Bernhardt, [Boundaries](https://www.destroyallsoftware.com/talks/boundaries).
