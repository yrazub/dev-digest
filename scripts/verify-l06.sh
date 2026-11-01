#!/usr/bin/env bash
# ./scripts/verify-l06.sh — proves the eval pipeline with no API key and no model call.
# Run it from the repository root. It has no root package.json: pnpm and npm are
# called only inside server/, client/ and reviewer-core/.
# Installs nothing, reads no secret, sets no key. Needs Docker (the eval .it lane).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# pnpm must not install or write lock/workspace files at the root or in a package.
export npm_config_verify_deps_before_run=false
export pnpm_config_verify_deps_before_run=false

if ! docker info >/dev/null 2>&1; then
  echo "Docker is required for the eval integration tests" >&2
  exit 1
fi

# step <name> <package dir> <cmd…> — run <cmd> inside the package; on failure
# print the step name and exit with the command's code.
step() {
  local name="$1" dir="$2" rc=0
  shift 2
  echo "==> ${name}"
  (cd "$ROOT/$dir" && "$@") || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "FAILED: ${name}" >&2
    exit "$rc"
  fi
}

# Test files of server/test matching a glob, relative to server/ (bash 3.2: no mapfile).
server_eval_files() {
  local kind="$1" f
  for f in "$ROOT"/server/test/eval-*.test.ts; do
    [ -e "$f" ] || continue
    case "$f" in
      *.it.test.ts) [ "$kind" = it ] && echo "test/$(basename "$f")" ;;
      *) [ "$kind" = unit ] && echo "test/$(basename "$f")" ;;
    esac
  done
  return 0
}

server_hermetic() {
  local files=()
  while IFS= read -r f; do files+=("$f"); done < <(server_eval_files unit)
  pnpm exec vitest run --exclude '**/*.it.test.ts' "${files[@]}" test/contracts-sync.test.ts
}

server_integration() {
  local files=() report rc=0
  while IFS= read -r f; do files+=("$f"); done < <(server_eval_files it)
  if [ "${#files[@]}" -eq 0 ]; then
    echo "no eval integration test files found" >&2
    return 1
  fi
  report="$(mktemp)"
  pnpm exec vitest run --no-file-parallelism --reporter=default --reporter=json \
    --outputFile.json="$report" "${files[@]}" || rc=$?
  if [ "$rc" -ne 0 ]; then
    rm -f "$report"
    return "$rc"
  fi
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (r.numPendingTests + r.numTodoTests > 0 || r.numPassedTests === 0) {
      console.error("eval integration tests were skipped");
      process.exit(1);
    }
  ' "$report" || rc=$?
  rm -f "$report"
  return "$rc"
}

step "server typecheck" server pnpm typecheck
step "server hermetic eval tests" server server_hermetic
step "server integration eval tests" server server_integration
step "server arch:check" server pnpm arch:check
step "client typecheck" client pnpm typecheck
step "client eval component tests" client pnpm exec vitest run \
  app/evals/ EvalsTab components/eval/ FindingCard FindingsPanel InlineFinding app-shell/nav hooks/evals
step "reviewer-core typecheck" reviewer-core npm run typecheck
step "reviewer-core test" reviewer-core npm test

echo "verify-l06 passed"
