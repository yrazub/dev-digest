import type { RawFinding } from './types';

export function toFinding(raw: RawFinding) {
  return {
    file: raw.file,
    line: raw.line,
    severity: raw.severity,
    message: raw.message,
    confidence: raw.confidence, // 0..1, new in this session
  };
}
