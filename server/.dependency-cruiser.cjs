/**
 * Onion-architecture boundaries for server/ and reviewer-core/.
 * Rules and rationale: .claude/skills/onion-architecture/ (rule IDs match `name`).
 *
 *   pnpm arch:check            fail on violations not in the baseline
 *   pnpm arch:baseline         re-record the baseline (only after FIXING leaks)
 *
 * Existing leaks live in .dependency-cruiser-known-violations.json. New code must not add any.
 */

const FRAMEWORKS = 'node_modules/(fastify|@fastify/|fastify-|drizzle-orm|postgres|octokit|@octokit/|simple-git|openai|@anthropic-ai/)';
const COMPOSITION_ROOT = '^src/(app|server)\\.ts$|^src/platform/container\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'dep-domain-framework-free',
      severity: 'error',
      comment:
        'Domain code (the shared contracts, modules/<m>/domain.ts, modules/<m>/ports.ts) imports no framework, ' +
        'no database and no outer server layer.',
      from: { path: ['^src/vendor/shared/', '^src/modules/[^/]+/(domain|ports)(\\.ts$|/)'] },
      to: {
        path: [FRAMEWORKS, '^src/(db|platform|adapters)/', '^src/modules/[^/]+/(routes|service|repository)'],
      },
    },
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'reviewer-core is the pure engine. It never reaches into the server, and only its own provider ' +
        '(src/llm/) may import an SDK.',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/llm/' },
      to: { path: [FRAMEWORKS, '^src/'], pathNot: '^src/vendor/shared/' },
    },
    {
      name: 'core-no-node-io',
      severity: 'error',
      comment: 'reviewer-core has no filesystem, process or network access.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: { dependencyTypes: ['core'], path: '^(node:)?(fs|child_process|net|http|https|worker_threads)(/|$)' },
    },
    {
      name: 'core-public-api-only',
      severity: 'error',
      comment: 'The server imports reviewer-core through @devdigest/reviewer-core (src/index.ts) only.',
      from: { path: '^src/' },
      to: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/index\\.ts$' },
    },
    {
      name: 'db-only-in-repository',
      severity: 'error',
      comment:
        'src/db/ (and with it Drizzle) is used only by repositories (repository.ts, repository/) ' +
        'and the composition root. Routes and services go through a repository.',
      from: {
        path: '^src/(modules|platform)/',
        pathNot: ['/repository(\\.ts$|/)', COMPOSITION_ROOT],
      },
      // Targets src/db/ only: a resolved drizzle-orm path carries the pnpm version, which would make
      // baseline entries break on every upgrade. Code that queries always imports src/db/ anyway.
      to: { path: '^src/db/' },
    },
    {
      name: 'dep-no-cross-module',
      severity: 'error',
      comment:
        'A module never imports another module. Move the shared rule into @devdigest/shared or modules/_shared/, ' +
        'or compose both modules in the composition root.',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/_shared/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'edge-fastify-in-routes-only',
      severity: 'error',
      comment: 'Only routes.ts and modules/_shared/ (request context) know about Fastify. Services are HTTP-free.',
      from: { path: '^src/modules/', pathNot: ['/routes\\.ts$', '^src/modules/_shared/', '^src/modules/index\\.ts$'] },
      to: { path: 'node_modules/(fastify|@fastify/|fastify-)' },
    },
    {
      name: 'di-narrow-deps',
      severity: 'error',
      comment:
        'A service receives the ports it uses, not the whole Container. Routes may read app.container; ' +
        'services built in the composition root get narrow dependencies.',
      from: { path: '^src/modules/', pathNot: ['/routes\\.ts$', '^src/modules/_shared/'] },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'adapter-no-app-layers',
      severity: 'error',
      comment: 'Adapters implement ports. They never import modules (use cases) — the dependency points the other way.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'platform-no-modules',
      severity: 'error',
      comment: 'platform/ is cross-cutting infrastructure. Only the composition root (container.ts) may know modules.',
      from: { path: '^src/platform/', pathNot: COMPOSITION_ROOT },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make the layer order meaningless.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$', '/vendor/shared/.*\\.test\\.ts$', 'src/db/migrations/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
    },
  },
};
