# Adapters

An adapter is the outer half of a port: it turns the port's language into an SDK's, and back.
Cockburn's goal is an application that can be "driven by users, programs, automated test or batch
scripts, and developed and tested in isolation from its eventual run-time devices and databases".
Adapters and their mocks are what make that true here.

## `adapter-implements-port`

| Port (`@devdigest/shared/adapters.ts`) | Real adapter | Mock (`src/adapters/mocks.ts`) |
|---|---|---|
| `LLMProvider` | `adapters/llm/openai.ts`, `anthropic.ts`; `reviewer-core`'s `OpenRouterProvider` | `MockLLMProvider` |
| `GitHubClient` | `adapters/github/octokit.ts` | `MockGitHubClient` |
| `GitClient` | `adapters/git/simple-git.ts` | `MockGitClient` |
| `CodeIndex` | `adapters/codeindex/ripgrep.ts` | `MockCodeIndex` |
| `Embedder` | `adapters/embedder/openai.ts` | `MockEmbedder` |
| `SecretsProvider` / `AuthProvider` | `adapters/secrets/local.ts` / `adapters/auth/local.ts` | `MockSecretsProvider` / `MockAuthProvider` |

`DepGraph` and `Tokenizer` declare their port in the adapter's own `index.ts`. That works while
only `repo-intel` uses them. Move the port into `@devdigest/shared` if a second consumer appears.

To add an adapter:
1. Declare the port: in `@devdigest/shared` if `reviewer-core` or several modules use it, else in
   `modules/<m>/ports.ts`.
2. Implement it in `src/adapters/<name>/`.
3. Add a mock that implements the **same** interface to `mocks.ts`.
4. Add a lazy getter and an `overrides` entry in `container.ts`.

## `adapter-no-app-layers` ✓

An adapter never imports a module. `adapters/astgrep` and `adapters/depgraph` import
`modules/repo-intel/constants.ts` today, which is baselined. The fix is to move those constants
inward (into the port's file or `@devdigest/shared`), or to pass them in as constructor options
from the composition root.

## `adapter-no-business-rules`

An adapter translates. It never decides anything.

| It does | It does not |
|---|---|
| map SDK types to port types, parsing where the SDK returns loose data | decide which PRs are "stale" or which findings to keep |
| retry transport errors and respect rate-limit headers | pick a model or a review strategy |
| rethrow SDK errors as `ExternalServiceError` / `ConfigError` | read another adapter or the database to enrich a result |
| read its secret through `SecretsProvider` | read `process.env` (only `platform/config.ts` and secrets do) |

If an adapter method grows an `if` about the business, that branch belongs in a service.

## Further reading

- Alistair Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture).
