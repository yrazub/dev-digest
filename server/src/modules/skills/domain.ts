import type { SkillUpdate } from '@devdigest/shared';

/**
 * Pure skills-domain rules (no DB / network / framework).
 *
 * Versioning snapshots the BODY only: creating a skill writes v1, a save that
 * changes the body bumps the version and appends a snapshot, and metadata
 * edits (name, description, type, enabled, evidence) never create a version.
 */

export const INITIAL_SKILL_VERSION = 1;

/** The current state the update rule needs. */
export interface SkillVersionState {
  body: string;
  version: number;
}

/** Column-level changes to apply to `skills`, in contract (snake_case) terms. */
export type SkillFieldChanges = Omit<SkillUpdate, 'version_note'> & { version?: number };

export interface SkillUpdatePlan {
  changes: SkillFieldChanges;
  /** Set when the body changed: the snapshot to append to `skill_versions`. */
  snapshot?: { version: number; body: string; note: string | null };
}

/** Decide what an update writes: the field changes and, on a body change, the new version. */
export function planSkillUpdate(current: SkillVersionState, patch: SkillUpdate): SkillUpdatePlan {
  const { version_note, ...fields } = patch;
  const bodyChanged = fields.body !== undefined && fields.body !== current.body;
  if (!bodyChanged) {
    const { body: _unchanged, ...rest } = fields;
    return { changes: rest };
  }
  const version = current.version + 1;
  return {
    changes: { ...fields, version },
    snapshot: { version, body: fields.body!, note: version_note?.trim() || null },
  };
}

/** The change note recorded when an old body is restored. */
export function restoreNote(fromVersion: number): string {
  return `Restored from v${fromVersion}`;
}

/** Lower-case kebab slug, max 80 chars — the `SkillName` shape. Empty when nothing survives. */
export function toSkillSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
