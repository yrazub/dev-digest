// Turns the changed files and routing.json into review tasks: one per (skill, batch of files).
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { matchesAny } from './glob.mjs';

const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e'];

export function packageOf(file) {
  const top = file.split('/')[0];
  return PACKAGES.includes(top) ? top : 'root';
}

/** Names of the installed skills, read from each SKILL.md's frontmatter (folder name as fallback). */
export function discoverSkills(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
    .map((d) => {
      const text = readFileSync(path.join(skillsDir, d.name, 'SKILL.md'), 'utf8');
      const name = text.match(/^---\n[\s\S]*?^name:\s*["']?([\w-]+)["']?\s*$/m)?.[1] ?? d.name;
      return { name, dir: d.name };
    });
}

/**
 * @param files      reviewable changed files ({ path, status, ... }); deleted files are skipped
 * @param manifest   parsed routing.json
 * @param installed  output of discoverSkills
 */
export function buildPlan({ files, manifest, installed }) {
  const live = files.filter((f) => f.status !== 'D');
  const installedByName = new Map(installed.map((s) => [s.name, s]));
  const maxFiles = manifest.defaults?.max_files ?? 12;

  const tasks = [];
  const covered = new Set();
  const missing = [];

  for (const [name, cfg] of Object.entries(manifest.skills)) {
    if (!cfg.review) continue;
    const skill = installedByName.get(name);
    if (!skill) { missing.push(name); continue; }
    const matched = live.filter((f) => matchesAny(f.path, cfg.include) && !matchesAny(f.path, cfg.exclude));
    matched.forEach((f) => covered.add(f.path));
    for (let i = 0; i < matched.length; i += maxFiles) {
      const batch = matched.slice(i, i + maxFiles);
      tasks.push({
        id: `${name}-${tasks.filter((t) => t.skill === name).length + 1}`,
        skill: name,
        skill_path: `.claude/skills/${skill.dir}/SKILL.md`,
        model: cfg.model ?? 'sonnet',
        can_block: Boolean(cfg.can_block),
        critical_rules: cfg.can_block ? (cfg.critical_rules ?? []) : [],
        files: batch.map((f) => f.path),
      });
    }
  }

  return {
    tasks,
    arch_check: live.some((f) => matchesAny(f.path, manifest.arch_check?.paths)),
    uncovered_files: live.map((f) => f.path).filter((p) => !covered.has(p)),
    unrouted_skills: installed.map((s) => s.name).filter((n) => !(n in manifest.skills)),
    missing_skills: missing,
  };
}
