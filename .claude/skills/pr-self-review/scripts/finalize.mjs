#!/usr/bin/env node
// Step 4 of /pr-self-review: validate the reviewers' findings, decide the verdict, print the report.
// Usage: node finalize.mjs [run_dir|latest]
// The last line is machine-readable: VERDICT <pass|blocked> <json>.
import { repoRoot } from './lib/git.mjs';
import { finalizeRun, resolveRunDir } from './lib/run.mjs';

const root = repoRoot();
const { verdict, report } = finalizeRun(root, resolveRunDir(root, process.argv[2]));
console.log(report);
console.log(`VERDICT ${verdict.verdict} ${JSON.stringify({ counts: verdict.counts, failed_tasks: verdict.failed_tasks })}`);
