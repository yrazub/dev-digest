import path from 'node:path';

// path.matchesGlob never lets `*` or `**` match a segment that starts with a dot, so
// `**/*.md` would miss `.claude/skills/x/SKILL.md`. Neutralise leading dots on both sides.
const undot = (s) => s.replace(/(^|\/)\.(?=[^./])/g, '$1__dot__');

export const matchesGlob = (file, pattern) => path.matchesGlob(undot(file), undot(pattern));

export const matchesAny = (file, patterns = []) => patterns.some((p) => matchesGlob(file, p));
