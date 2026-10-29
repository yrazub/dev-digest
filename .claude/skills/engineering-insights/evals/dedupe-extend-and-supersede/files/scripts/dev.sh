#!/usr/bin/env bash
set -eu
# flags: --no-seed --no-client --db-only
NO_SEED=0; NO_CLIENT=0
DB_ONLY=0
for a in "$@"; do
  case "$a" in
    --db-only) DB_ONLY=1;; --no-seed) NO_SEED=1;; --no-client) NO_CLIENT=1;;
  esac
done
docker compose up -d postgres
[ "$DB_ONLY" = 1 ] && exit 0
(cd server && pnpm dev) &
[ "$NO_CLIENT" = 1 ] || (cd client && pnpm dev)
