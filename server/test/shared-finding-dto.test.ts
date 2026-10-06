/**
 * `findingRowToDto` (`modules/_shared/finding-dto.ts`): a persisted finding row → the
 * `FindingRecord` wire shape. `scope` is parsed on read, so a stored value outside the
 * enum reads as null instead of reaching the wire.
 */
import { describe, it, expect } from 'vitest';
import { findingRowToDto, type PersistedFinding } from '../src/modules/_shared/finding-dto.js';

function row(scope: string | null): PersistedFinding {
  return {
    id: 'f1',
    reviewId: 'r1',
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/a.ts',
    startLine: 3,
    endLine: 4,
    rationale: 'why',
    suggestion: null,
    confidence: 0.8,
    kind: 'finding',
    scope,
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
  };
}

describe('findingRowToDto scope', () => {
  it.each(['in_scope', 'out_of_scope'])('passes %s through', (scope) => {
    expect(findingRowToDto(row(scope)).scope).toBe(scope);
  });

  it('reads a null scope as null', () => {
    expect(findingRowToDto(row(null)).scope).toBeNull();
  });

  it('reads a stored value outside the enum as null', () => {
    expect(findingRowToDto(row('elsewhere')).scope).toBeNull();
  });
});
