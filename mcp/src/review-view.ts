import type { Severity } from '@devdigest/shared';
import { MAX_LIMIT, MAX_RATIONALE, MAX_SUMMARY, MAX_TITLE, SEVERITY_ORDER } from './constants.js';
import type { ApiFinding, ApiReview } from './ports.js';
import { cutText } from './tool.js';

export interface ReviewViewOptions {
  minSeverity?: Severity;
  limit: number;
}

const rank = (severity: Severity): number => SEVERITY_ORDER.indexOf(severity);

/** Code-unit comparison, so the order does not depend on the machine's locale. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function toFindingView(finding: ApiFinding): Record<string, unknown> {
  return {
    severity: finding.severity,
    title: cutText(finding.title, MAX_TITLE),
    file: finding.file,
    line: finding.start_line,
    ...(finding.end_line !== finding.start_line ? { end_line: finding.end_line } : {}),
    rationale: cutText(finding.rationale, MAX_RATIONALE),
  };
}

/** The next level up, to suggest when a list was cut; none when already at the top. */
function narrowerSeverity(current: Severity | undefined): Severity | undefined {
  if (current === undefined) return SEVERITY_ORDER[1];
  return SEVERITY_ORDER[rank(current) - 1];
}

/**
 * The review result the two review tools return: the verdict, the counts and the findings that count,
 * most severe first. Dismissed findings are left out (the product's "counted findings" rule).
 */
export function toReviewView(review: ApiReview, options: ReviewViewOptions): Record<string, unknown> {
  const counted = review.findings.filter((finding) => finding.dismissed_at == null);

  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const finding of counted) counts[finding.severity] += 1;

  const { minSeverity } = options;
  const shown = counted
    .filter((finding) => minSeverity === undefined || rank(finding.severity) <= rank(minSeverity))
    .sort(
      (a, b) =>
        rank(a.severity) - rank(b.severity) || compare(a.file, b.file) || a.start_line - b.start_line,
    );
  const limit = Math.min(Math.max(1, options.limit), MAX_LIMIT);
  const kept = shown.slice(0, limit);

  const view: Record<string, unknown> = {
    status: 'done',
    run_id: review.run_id,
    agent: review.agent_name ?? null,
    reviewed_at: review.created_at,
    verdict: review.verdict,
    score: review.score,
    summary: review.summary === null ? null : cutText(review.summary, MAX_SUMMARY),
    counts,
    findings: kept.map(toFindingView),
  };

  if (kept.length < shown.length) {
    const narrower = narrowerSeverity(minSeverity);
    const narrowing = [
      ...(review.run_id === null ? [] : [`run_id "${review.run_id}"`]),
      ...(narrower === undefined ? [] : [`min_severity "${narrower}"`]),
    ].join(' and ');
    const higherLimit = limit < MAX_LIMIT ? `a higher limit (max ${MAX_LIMIT})` : '';
    const advice = [narrowing, higherLimit].filter((part) => part !== '').join(', or ');
    view.truncated = true;
    view.note =
      `Showing ${kept.length} of ${shown.length} findings, most severe first.` +
      (advice === '' ? '' : ` Call get_findings with ${advice}.`);
  }

  return view;
}
