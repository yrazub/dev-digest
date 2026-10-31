module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'db-only-in-repository', severity: 'error',
      from: { path: '^src/modules/[^/]+/(routes|service|domain|ports)\\.ts$' },
      to: { path: '^src/db/|drizzle-orm' } },
    { name: 'dep-no-cross-module', severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/(?!\\1/)(?!_shared/)[^/]+/' } },
    { name: 'di-narrow-deps', severity: 'error',
      from: { path: '^src/modules/[^/]+/service\\.ts$' },
      to: { path: '^src/platform/container\\.ts$' } },
    { name: 'platform-no-modules', severity: 'error',
      from: { path: '^src/platform/(?!container)' }, to: { path: '^src/modules/' } },
  ],
};
