#!/usr/bin/env node
// Execution state of one Implementation Plan, so a fresh chat can resume where the last one
// stopped. The main session changes it only through these commands; it never edits the JSON.
//
//   state.mjs start  <plan> [--base <ref>] [--per-chat <n>] [--accept-plan-change]
//   state.mjs show   <plan> [--notes] [--json]
//   state.mjs phase  <plan> <n> <pending|code-done|green|committed|blocked>
//                    [--verify "<result line>"]... [--deviation "<text>"]... [--commit <sha>] [--reason "<text>"]
//   state.mjs gate   <plan> <n> <pass|skipped> [--note "<text>"]
//   state.mjs note   <plan> <insight|reviewer> "<text>"
//   state.mjs final  <plan> <verify|arch|docs|e2e|insights|self-review> <pending|pass|fail|skipped|done> [--note "<text>"]
//
// State lives in .devdigest/sdd/<feature>/state.json (git-ignored). Every command prints the
// summary and a NEXT line saying what the main session does next.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { featureOf, parsePlan, phaseBody, planHash, sddDir, REPO_ROOT } from '../../../agents/scripts/lib/plan.mjs';

const PHASE_STATUS = ['pending', 'code-done', 'green', 'committed', 'blocked'];
const FINAL_STEPS = ['verify', 'arch', 'docs', 'e2e', 'insights', 'self-review'];
const FINAL_STATUS = ['pending', 'pass', 'fail', 'skipped', 'done'];
const GATE_STATUS = ['pass', 'skipped'];
// The code areas the early architecture check covers, by the path a file-table row starts with.
const AREAS = { backend: ['server', 'reviewer-core'], client: ['client'] };

export class UsageError extends Error {}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      pos.push(a);
      continue;
    }
    const key = a.slice(2);
    if (['accept-plan-change', 'notes', 'json'].includes(key)) opts[key] = true;
    else {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`--${key} needs a value.`);
      (opts[key] ??= []).push(v);
    }
  }
  return { pos, opts };
}

const one = (opts, key) => opts[key]?.at(-1);
const rel = (p, root) => path.relative(root, p).split(path.sep).join('/');

function readPlan(planArg, root) {
  if (!planArg) throw new UsageError('Give the plan path, e.g. specs/plans/<feature>.md.');
  const abs = path.resolve(root, planArg);
  if (!existsSync(abs)) throw new UsageError(`${planArg} does not exist.`);
  const text = readFileSync(abs, 'utf8');
  const parsed = parsePlan(text);
  if (parsed.phases.length === 0) throw new UsageError(`${planArg} has no "### <n> · <title>" phases under "## Phases".`);
  return { abs, text, parsed, feature: featureOf(abs) };
}

const stateFile = (feature, root) => path.join(sddDir(feature, root), 'state.json');

function load(plan, root) {
  const file = stateFile(plan.feature, root);
  if (!existsSync(file)) throw new UsageError(`No state for ${plan.feature}. Run: state.mjs start ${rel(plan.abs, root)}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function save(state, root) {
  const file = stateFile(state.feature, root);
  mkdirSync(path.dirname(file), { recursive: true });
  state.updated = new Date().toISOString();
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
}

const testWriterOnly = (text, n) => /Nothing — test-writer only/.test(phaseBody(text, n));

/** The areas a phase's file table touches: the first cell of each row is a backticked path. */
function areasOf(text, n) {
  const paths = [...phaseBody(text, n).matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1]);
  return Object.keys(AREAS).filter((a) => paths.some((f) => AREAS[a].some((dir) => f.startsWith(`${dir}/`))));
}

function newPhase(p, text, added = false) {
  return { n: p.n, title: p.title, status: 'pending', test_writer_only: testWriterOnly(text, p.n), areas: areasOf(text, p.n), added, gate: null, verify: [], deviations: [], commit: null, reason: null };
}

// The early architecture check runs on the last phase of the original plan that touches an area,
// once its tests are green and before its commit, so a misplacement is fixed inside that phase
// instead of in an amend round after the final review (L05 PR Brief retro, docs/retros/). Phases
// added by an amendment skip it: the final checks run again right after them.
function gateAreas(state, phase) {
  if (phase.added) return [];
  const original = state.phases.filter((p) => !p.added);
  return (phase.areas ?? []).filter((a) => original.filter((p) => (p.areas ?? []).includes(a)).at(-1) === phase);
}

function start(plan, opts, root) {
  const file = stateFile(plan.feature, root);
  const hash = planHash(plan.text);
  const perChat = Number(one(opts, 'per-chat') ?? 3);
  if (!Number.isInteger(perChat) || perChat < 1) throw new UsageError('--per-chat must be a positive integer.');
  if (!existsSync(file)) {
    const state = {
      feature: plan.feature,
      plan: rel(plan.abs, root),
      plan_sha256: hash,
      mode: plan.parsed.mode ?? 'multi-agent',
      mode_stated: plan.parsed.mode !== null,
      base: one(opts, 'base') ?? 'origin/main',
      per_chat: perChat,
      chat: { committed: 0 },
      phases: plan.parsed.phases.map((p) => newPhase(p, plan.text)),
      final: Object.fromEntries(FINAL_STEPS.map((s) => [s, { status: 'pending', note: null }])),
      notes: { insight: [], reviewer: [] },
      created: new Date().toISOString(),
    };
    save(state, root);
    return { state, message: `Created ${rel(file, root)}.` };
  }
  const state = JSON.parse(readFileSync(file, 'utf8'));
  let message = 'Resumed; the per-chat phase count starts again at 0.';
  if (state.plan_sha256 !== hash) {
    const before = new Map(state.phases.map((p) => [p.n, p]));
    const after = plan.parsed.phases;
    const added = after.filter((p) => !before.has(p.n)).map((p) => p.n);
    const removed = [...before.keys()].filter((n) => !after.some((p) => p.n === n));
    const lostWork = removed.filter((n) => before.get(n).status !== 'pending');
    const diff = `added phases: ${added.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'}`;
    if (!opts['accept-plan-change']) {
      throw new UsageError(`The plan changed since the state was created (${diff}). Confirm the plan was re-approved, then re-run with --accept-plan-change.`);
    }
    if (lostWork.length) throw new UsageError(`Phases ${lostWork.join(', ')} were removed from the plan but already have work recorded. Resolve this by hand with the user.`);
    state.phases = after.map((p) => (before.has(p.n) ? { ...before.get(p.n), title: p.title } : newPhase(p, plan.text, true)));
    state.plan_sha256 = hash;
    state.mode = plan.parsed.mode ?? state.mode;
    if (added.length) resetFinal(state);
    message = `Plan change accepted (${diff}).${added.length ? ' Final checks reset to pending.' : ''}`;
  }
  for (const p of state.phases) p.areas = areasOf(plan.text, p.n);
  if (opts['per-chat']) state.per_chat = perChat;
  if (opts.base) state.base = one(opts, 'base');
  state.chat = { committed: 0 };
  save(state, root);
  return { state, message };
}

function resetFinal(state) {
  for (const s of FINAL_STEPS) state.final[s] = { status: 'pending', note: null };
}

function setPhase(state, nArg, status, opts) {
  const n = Number(nArg);
  const phase = state.phases.find((p) => p.n === n);
  if (!phase) throw new UsageError(`Phase ${nArg} is not in the plan (phases: ${state.phases.map((p) => p.n).join(', ')}).`);
  if (!PHASE_STATUS.includes(status)) throw new UsageError(`Phase status must be one of ${PHASE_STATUS.join(', ')}.`);
  if (status === 'committed' && !opts.commit) throw new UsageError('A committed phase needs --commit <sha>.');
  if (status === 'blocked' && !opts.reason) throw new UsageError('A blocked phase needs --reason "<what stopped it>".');
  const earlier = state.phases.find((p) => p.n < n && p.status !== 'committed');
  if (status !== 'pending' && status !== 'blocked' && earlier) throw new UsageError(`Phase ${earlier.n} is not committed yet; phases close in order.`);
  const due = gateAreas(state, phase);
  if (status === 'committed' && due.length && !phase.gate) {
    throw new UsageError(`Phase ${n} is the last ${due.join(' and ')} phase: record the architecture check first (state.mjs gate ${state.plan} ${n} pass|skipped).`);
  }
  const wasCommitted = phase.status === 'committed';
  phase.status = status;
  // The check covers the code as it was; new code for the phase needs a new check.
  if (status === 'pending' || status === 'code-done') phase.gate = null;
  if (opts.verify) phase.verify = opts.verify;
  if (opts.deviation) phase.deviations.push(...opts.deviation);
  if (opts.commit) phase.commit = one(opts, 'commit');
  phase.reason = status === 'blocked' ? one(opts, 'reason') : null;
  let message = `Phase ${n} → ${status}.`;
  if (status === 'committed' && !wasCommitted) {
    state.chat.committed += 1;
    if (FINAL_STEPS.some((s) => state.final[s].status !== 'pending')) {
      resetFinal(state);
      message += ' A phase closed after the final checks had started: they are reset to pending.';
    }
  }
  return message;
}

function setGate(state, nArg, status, opts) {
  const n = Number(nArg);
  const phase = state.phases.find((p) => p.n === n);
  if (!phase) throw new UsageError(`Phase ${nArg} is not in the plan (phases: ${state.phases.map((p) => p.n).join(', ')}).`);
  if (!GATE_STATUS.includes(status)) throw new UsageError(`Gate status must be one of ${GATE_STATUS.join(', ')}.`);
  if (!gateAreas(state, phase).length) throw new UsageError(`Phase ${n} has no architecture check: it is not the last phase of the original plan for any area.`);
  if (phase.status !== 'green') throw new UsageError(`Phase ${n} is ${phase.status}; the architecture check runs once its tests are green.`);
  phase.gate = status;
  phase.gate_note = one(opts, 'note') ?? null;
  return `Phase ${n} architecture check → ${status}.`;
}

/** The NEXT step for a green phase that still owes its architecture check, or null. */
function gateNext(state, phase) {
  const due = gateAreas(state, phase);
  if (!due.length || phase.gate) return null;
  const dirs = due.flatMap((a) => AREAS[a]).join(' ');
  const optional = state.mode === 'single-agent' ? ' In single-agent mode it is optional: ask the user, and record a declined one with state.mjs gate … skipped.' : '';
  return `Before the commit, run architecture-reviewer, mode change, on the ${due.join(' and ')} code so far — phase ${phase.n} is the last phase that touches it: the file list from git diff --name-status ${state.base} -- ${dirs} plus the untracked files there, and that diff as a patch in .devdigest/sdd/${state.feature}/. CRITICAL or WARNING findings go back to implementer for phase ${phase.n}, then test-writer, then this check again. Clean: state.mjs gate ${state.plan} ${phase.n} pass.${optional}`;
}

function addNote(state, kind, text) {
  if (!['insight', 'reviewer'].includes(kind)) throw new UsageError('Note kind must be insight or reviewer.');
  if (!text) throw new UsageError('Give the note text.');
  state.notes[kind].push(text);
  return `Note added (${kind}).`;
}

function setFinal(state, step, status, opts) {
  if (!FINAL_STEPS.includes(step)) throw new UsageError(`Final step must be one of ${FINAL_STEPS.join(', ')}.`);
  if (!FINAL_STATUS.includes(status)) throw new UsageError(`Final status must be one of ${FINAL_STATUS.join(', ')}.`);
  const open = state.phases.filter((p) => p.status !== 'committed').map((p) => p.n);
  if (status !== 'pending' && open.length) throw new UsageError(`Phases ${open.join(', ')} are not committed; the final checks come after the last phase.`);
  state.final[step] = { status, note: one(opts, 'note') ?? null };
  return `Final step ${step} → ${status}.`;
}

/** What the main session does next. */
export function nextAction(state) {
  const plan = state.plan;
  const blocked = state.phases.find((p) => p.status === 'blocked');
  if (blocked) return `Phase ${blocked.n} is blocked (${blocked.reason}). Take it to the user; do not re-run blindly.`;

  const open = state.phases.find((p) => p.status !== 'committed');
  const remaining = state.phases.filter((p) => p.status !== 'committed').length;
  if (open && state.chat.committed >= state.per_chat) {
    return `CHECKPOINT — ${state.chat.committed} phases committed in this chat. Stop and ask the user to open a new chat and run /execute-plan ${plan} (${remaining} phases left).`;
  }
  if (open) {
    const prev = state.phases.filter((p) => p.n < open.n && p.status === 'committed').at(-1);
    const baseline = prev
      ? `Tell it phase ${prev.n} closed green: ${prev.verify.length ? prev.verify.join(' · ') : '(no result lines recorded — paste them from the Test report)'}.`
      : 'It runs the baseline itself (first phase of this plan).';
    if (state.mode === 'single-agent') {
      if (open.status === 'green') return gateNext(state, open) ?? `Commit phase ${open.n} (code and tests), then: state.mjs phase ${plan} ${open.n} committed --commit <sha>.`;
      return `Build phase ${open.n} yourself — run plan-phase.mjs ${plan} ${open.n}, build the file table and the test work order, run Verify (phase) — then: state.mjs phase ${plan} ${open.n} green --verify "<result line>"...`;
    }
    switch (open.status) {
      case 'pending':
        if (open.test_writer_only) return `Run test-writer: plan ${plan}, phase ${open.n} (the phase only adds tests; no implementer run).`;
        return `Run implementer: plan ${plan}, phase ${open.n}. ${baseline}`;
      case 'code-done':
        return `Run test-writer: plan ${plan}, phase ${open.n}, with the implementer's "Existing tests failing" table.`;
      case 'green':
        return gateNext(state, open) ?? `Commit phase ${open.n} (code and tests together), then: state.mjs phase ${plan} ${open.n} committed --commit <sha>.`;
    }
  }

  const f = state.final;
  // The final checks always start in a fresh chat: the orchestrator's own context is the biggest
  // cost of a run (L05 retro, docs/retros/ledger.md), and the checks need none of the phase chatter.
  if (state.chat.committed > 0 && FINAL_STEPS.every((s) => f[s].status === 'pending')) {
    return `CHECKPOINT — all phases are committed (${state.chat.committed} in this chat). Stop and ask the user to open a new chat and run /execute-plan ${plan} for the final checks.`;
  }
  const failed = FINAL_STEPS.filter((s) => f[s].status === 'fail');
  if (failed.length) {
    return `Final step ${failed.join(', ')} failed. Take the report to the user; fixes go into the plan as a new phase (implementation-planner, pass amend), then state.mjs start ${plan} --accept-plan-change.`;
  }
  const checks = ['verify', 'arch'].filter((s) => f[s].status === 'pending');
  if (checks.length) {
    const who = checks.map((s) => (s === 'verify' ? 'plan-verifier' : 'architecture-reviewer')).join(' and ');
    const optional = state.mode === 'single-agent' ? ' In single-agent mode both are optional: ask the user, and mark a skipped one with state.mjs final … skipped.' : '';
    return `Run ${who}${checks.length === 2 ? ' in parallel' : ''}: plan ${plan}, base ${state.base}; give plan-verifier the declared deviations (state.mjs show ${plan} --notes).${optional}`;
  }
  if (f.docs.status === 'pending') return `Run doc-writer with plan ${plan} and the changed-file list (git diff --name-status against ${state.base}), or mark docs skipped when nothing documented changed.`;
  if (f.e2e.status === 'pending') return 'Run the hermetic e2e suite: cd e2e && npm run e2e:hermetic (needs Docker and no dev server on client/.next; if ./scripts/dev.sh is running, ask the user to stop it).';
  if (f.insights.status === 'pending') return `Record the insight candidates (state.mjs show ${plan} --notes) through the engineering-insights skill, and commit what is left.`;
  if (f['self-review'].status === 'pending') return 'Run /pr-self-review. Push or open a PR only on a pass verdict.';
  return 'All steps are done. Ask the user before pushing or opening a PR.';
}

export function summary(state, { notes = false } = {}) {
  const width = Math.max(...state.phases.map((p) => p.status.length));
  const lines = [
    `Plan: ${state.plan} · mode ${state.mode}${state.mode_stated ? '' : ' (not stated in the plan; default)'} · base ${state.base} · ${state.chat.committed}/${state.per_chat} phases this chat`,
    'Phases:',
    ...state.phases.map(
      (p) =>
        `  ${String(p.n).padStart(2)}  ${p.status.padEnd(width)}  ${(p.commit ?? '').slice(0, 7).padEnd(7)}  ${p.title}${p.test_writer_only ? ' [test-writer only]' : ''}${gateAreas(state, p).length ? ` [arch check ${gateAreas(state, p).join('+')}: ${p.gate ?? 'due'}]` : ''}${p.reason ? ` — ${p.reason}` : ''}`,
    ),
    `Final: ${FINAL_STEPS.map((s) => `${s} ${state.final[s].status}`).join(' · ')}`,
  ];
  const deviations = state.phases.flatMap((p) => p.deviations.map((d) => `phase ${p.n}: ${d}`));
  if (notes) {
    lines.push('Declared deviations:', ...(deviations.length ? deviations.map((d) => `  - ${d}`) : ['  Nothing.']));
    lines.push('Insight candidates:', ...(state.notes.insight.length ? state.notes.insight.map((d) => `  - ${d}`) : ['  Nothing.']));
    lines.push('For reviewers:', ...(state.notes.reviewer.length ? state.notes.reviewer.map((d) => `  - ${d}`) : ['  Nothing.']));
    const finalNotes = FINAL_STEPS.filter((s) => state.final[s].note).map((s) => `  - ${s}: ${state.final[s].note}`);
    if (finalNotes.length) lines.push('Final step notes:', ...finalNotes);
  } else {
    lines.push(`Notes: ${deviations.length} deviations · ${state.notes.insight.length} insight candidates · ${state.notes.reviewer.length} for reviewers (--notes to list)`);
  }
  lines.push(`NEXT: ${nextAction(state)}`);
  return lines.join('\n');
}

export function run(argv, root = REPO_ROOT) {
  const [cmd, ...rest] = argv;
  const { pos, opts } = parseArgs(rest);
  const plan = readPlan(pos[0], root);
  let state;
  let message = null;
  switch (cmd) {
    case 'start':
      ({ state, message } = start(plan, opts, root));
      break;
    case 'show':
      state = load(plan, root);
      if (state.plan_sha256 !== planHash(plan.text)) message = `WARNING: the plan changed since the state was recorded; run state.mjs start ${state.plan} to reconcile.`;
      if (opts.json) return JSON.stringify(state, null, 2);
      break;
    case 'phase':
      state = load(plan, root);
      message = setPhase(state, pos[1], pos[2], opts);
      save(state, root);
      break;
    case 'gate':
      state = load(plan, root);
      message = setGate(state, pos[1], pos[2], opts);
      save(state, root);
      break;
    case 'note':
      state = load(plan, root);
      message = addNote(state, pos[1], pos[2]);
      save(state, root);
      break;
    case 'final':
      state = load(plan, root);
      message = setFinal(state, pos[1], pos[2], opts);
      save(state, root);
      break;
    default:
      throw new UsageError('Command must be start, show, phase, gate, note or final.');
  }
  return [message, summary(state, { notes: Boolean(opts.notes) })].filter(Boolean).join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(run(process.argv.slice(2)) + '\n');
  } catch (err) {
    process.stderr.write(`state: ${err.message}\n`);
    process.exit(err instanceof UsageError ? 2 : 1);
  }
}
