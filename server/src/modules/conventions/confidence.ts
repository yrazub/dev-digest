import { ConventionRecord } from './domain.js';

/** Band labels, lowest first. */
const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** The band a 0–1 confidence falls in: below 0.6 low, below 0.8 medium, otherwise high. */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Confidence must be between 0 and 1, got ${confidence}`);
  }
  const index = confidence < 0.6 ? 0 : confidence < 0.8 ? 1 : 2;
  return CONFIDENCE_LEVELS[index] as ConfidenceLevel;
}

export function recordLevel(record: ConventionRecord): ConfidenceLevel {
  return confidenceLevel(record.confidence);
}
