#!/usr/bin/env node
// Writes one phase of an Implementation Plan, with the plan's shared sections, to
// .devdigest/sdd/<feature>/phase-<n>.md, so implementer and test-writer read one phase
// instead of the whole plan. Prints the path and the size.
//
//   node .claude/agents/scripts/plan-phase.mjs specs/plans/<feature>.md <n>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { featureOf, sddDir, slicePhase, REPO_ROOT } from './lib/plan.mjs';

const [planArg, phaseArg] = process.argv.slice(2);
if (!planArg || !/^\d+$/.test(phaseArg ?? '')) {
  process.stderr.write('usage: plan-phase.mjs <plan.md> <phase number>\n');
  process.exit(1);
}

const planPath = path.resolve(planArg);
let slice;
try {
  slice = slicePhase(readFileSync(planPath, 'utf8'), Number(phaseArg));
} catch (err) {
  process.stderr.write(`plan-phase: ${err.message}\n`);
  process.exit(1);
}

const out = path.join(sddDir(featureOf(planPath)), `phase-${phaseArg}.md`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, slice);
const lines = slice.split('\n').length;
process.stdout.write(`${path.relative(REPO_ROOT, out)} (${lines} lines, ${Math.round(slice.length / 1024)} KB)\n`);
