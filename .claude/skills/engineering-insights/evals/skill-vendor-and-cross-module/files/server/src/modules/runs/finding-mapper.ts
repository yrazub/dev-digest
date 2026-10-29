import type { Finding } from '@acme/shared';

// explicit pick: only these keys are persisted
export function toRow(runId: string, f: Finding) {
  return {
    runId,
    file: f.file,
    line: f.line,
    severity: f.severity,
    message: f.message,
    confidence: f.confidence,
  };
}
