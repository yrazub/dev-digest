/**
 * Run a vitest suite on the cheap model, then re-run only the tests that failed on a stronger one.
 *
 *   node scripts/run-with-fallback.mjs agents/architecture-reviewer [more vitest args]
 *
 * First pass: the model in EVAL_MODEL / EVAL_JUDGE_MODEL (the cheap one), with one vitest retry.
 * Second pass: only the failed tests, with EVAL_MODEL and EVAL_JUDGE_MODEL set to FALLBACK_MODEL.
 * Exit code is 0 when every test passed on at least one of the two models. The summary says which
 * model passed each test, so a test that needed the stronger model is visible, not hidden.
 *
 * FALLBACK_MODEL unset (or equal to the first model) means a single pass, like plain vitest.
 * Pure Node, no dependencies. Run it from evals/.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: run-with-fallback.mjs <vitest path or filter> [vitest args]");
  process.exit(2);
}

const primary = process.env.EVAL_MODEL ?? "(default)";
const fallback = process.env.FALLBACK_MODEL?.trim();
const dir = mkdtempSync(join(tmpdir(), "eval-fallback-"));

/** Run vitest once; return its exit code and the parsed JSON report (or null if none was written). */
function runVitest(vitestArgs, env, outFile) {
  const res = spawnSync(
    "pnpm",
    ["vitest", "run", ...vitestArgs, "--reporter=default", "--reporter=json", `--outputFile.json=${outFile}`],
    { stdio: "inherit", env: { ...process.env, ...env } },
  );
  const report = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;
  return { code: res.status ?? 1, report };
}

/** Every test of a report as { file, name, passed }. Skipped tests are left out. */
function tests(report) {
  const out = [];
  for (const file of report?.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (t.status === "passed" || t.status === "failed") {
        out.push({ file: file.name, name: t.fullName, passed: t.status === "passed" });
      }
    }
  }
  return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

console.log(`\n── first pass on ${primary} ──`);
const first = runVitest([...args, "--retry", "1"], {}, join(dir, "first.json"));
const firstTests = tests(first.report);

if (!first.report) {
  console.error("no vitest report was written; nothing to retry");
  process.exit(first.code || 1);
}

const failed = firstTests.filter((t) => !t.passed);
const rows = firstTests.map((t) => ({ name: t.name, result: t.passed ? `passed on ${primary}` : "failed" }));
let exitCode = failed.length === 0 ? 0 : 1;

if (failed.length > 0 && fallback && fallback !== primary) {
  console.log(`\n── ${failed.length} failed; retrying only those on ${fallback} ──`);
  const files = [...new Set(failed.map((t) => t.file))];
  const pattern = failed.map((t) => `(${escapeRegex(t.name)})`).join("|");
  const second = runVitest(
    [...files, "-t", pattern],
    { EVAL_MODEL: fallback, EVAL_JUDGE_MODEL: fallback },
    join(dir, "second.json"),
  );
  const secondByName = new Map(tests(second.report).map((t) => [t.name, t.passed]));
  for (const r of rows) {
    if (r.result !== "failed") continue;
    const ok = secondByName.get(r.name);
    r.result = ok === undefined ? "failed (not re-run)" : ok ? `passed on ${fallback} only` : `failed on both`;
  }
  exitCode = rows.some((r) => r.result.startsWith("failed")) ? 1 : 0;
}

const lines = [
  `### ${args.join(" ")}`,
  "",
  "| Test | Result |",
  "|---|---|",
  ...rows.map((r) => `| ${r.name.replace(/\|/g, "\\|")} | ${r.result} |`),
  "",
];
console.log("\n" + lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");

process.exit(exitCode);
