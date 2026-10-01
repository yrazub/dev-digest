import { unzipSync, strFromU8 } from 'fflate';
import { SKILL_BODY_MAX, SkillName, SkillType, type SkillImportDraft } from '@devdigest/shared';
import { ValidationError } from '../../../platform/errors.js';
import { toSkillSlug } from '../domain.js';

/**
 * Pure parsers that turn an uploaded `.md` / `.zip` (or fetched markdown) into a
 * SkillImportDraft for the mandatory preview. Nothing here stores anything.
 *
 * An imported skill is UNTRUSTED input: from an archive only the SKILL.md core
 * is read. Every other entry is listed in `ignored_files` and never
 * decompressed, stored, executed or sent to a model.
 */

export const ZIP_LIMITS = {
  compressedBytes: 1_048_576,
  uncompressedBytes: 5 * 1_048_576,
  entries: 200,
} as const;

const DESCRIPTION_MAX = 500;

type ParsedMarkdown = Omit<SkillImportDraft, 'source' | 'ignored_files'>;

/** Minimal YAML frontmatter: `key: value`, quoted values, and `>` / `|` block scalars. */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  const lines = m[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i]!.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!;
    let value = kv[2]!.trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]!) && lines[i + 1] !== '') {
        block.push(lines[++i]!.trim());
      }
      value = value.startsWith('>') ? block.join(' ') : block.join('\n');
    } else if (/^(['"]).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: text.slice(m[0].length) };
}

/** First prose paragraph of a markdown body (skips headings and fences). */
function firstParagraph(body: string): string {
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const text = block.trim();
    if (text && !text.startsWith('#') && !text.startsWith('```')) return text.replace(/\s+/g, ' ');
  }
  return '';
}

/** Parse one markdown skill file. `fallbackName` is used when frontmatter has no usable name. */
export function parseSkillMarkdown(text: string, fallbackName: string): ParsedMarkdown {
  const { data, body: rawBody } = parseFrontmatter(text);
  const body = rawBody.trim();
  if (!body) throw new ValidationError('The skill has no body');
  if (body.length > SKILL_BODY_MAX) throw new ValidationError('The skill body is larger than 64 KB');

  const warnings: string[] = [];
  if (Object.keys(data).length === 0) warnings.push('No frontmatter: name and description were derived');

  let name = data.name ?? '';
  if (!SkillName.safeParse(name).success) {
    const slug = toSkillSlug(name || fallbackName);
    if (name) warnings.push(`Name "${name}" was normalised to "${slug}"`);
    name = slug;
  }
  if (!name) name = 'imported-skill';

  let description = (data.description ?? '').trim();
  if (!description) {
    description = firstParagraph(body);
    if (Object.keys(data).length > 0) warnings.push('No description in frontmatter: used the first paragraph');
  }
  if (description.length > DESCRIPTION_MAX) description = `${description.slice(0, DESCRIPTION_MAX - 1)}…`;
  if (!description) description = name;

  const type = SkillType.safeParse(data.type);
  if (data.type && !type.success) warnings.push(`Unknown type "${data.type}": set to custom`);

  return { name, description, type: type.success ? type.data : 'custom', body, warnings };
}

const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$)/;

/** Parse a `.zip` skill: exactly one SKILL.md at the root or one folder deep. */
export function parseSkillZip(data: Uint8Array, archiveName: string): Omit<SkillImportDraft, 'source'> {
  if (data.byteLength > ZIP_LIMITS.compressedBytes) throw new ValidationError('Archive is larger than 1 MB');

  const entries: { name: string; size: number }[] = [];
  const candidates: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        entries.push({ name: f.name, size: f.originalSize });
        const isSkillMd = /^(?:[^/]+\/)?SKILL\.md$/i.test(f.name);
        if (isSkillMd) candidates.push(f.name);
        // Decompress only SKILL.md candidates; everything else stays compressed and unread.
        return isSkillMd && f.originalSize <= SKILL_BODY_MAX * 2;
      },
    });
  } catch {
    throw new ValidationError('Not a readable .zip archive');
  }

  if (entries.length > ZIP_LIMITS.entries) throw new ValidationError(`Archive has more than ${ZIP_LIMITS.entries} entries`);
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > ZIP_LIMITS.uncompressedBytes) throw new ValidationError('Archive expands to more than 5 MB');
  const unsafe = entries.find((e) => e.name.startsWith('/') || e.name.split('/').includes('..'));
  if (unsafe) throw new ValidationError(`Archive entry has an unsafe path: ${unsafe.name}`);

  if (candidates.length === 0) throw new ValidationError('Archive has no SKILL.md at its root or one folder deep');
  if (candidates.length > 1) throw new ValidationError('Archive has more than one SKILL.md');
  const pick = candidates[0]!;
  const bytes = files[pick];
  if (!bytes) throw new ValidationError('SKILL.md is larger than 128 KB');

  const folder = pick.includes('/') ? pick.split('/')[0]! : archiveName.replace(/\.zip$/i, '');
  const parsed = parseSkillMarkdown(strFromU8(bytes), folder);
  const ignored_files = entries
    .map((e) => e.name)
    .filter((n) => n !== pick && !n.endsWith('/') && !JUNK.test(n));
  return { ...parsed, ignored_files };
}
