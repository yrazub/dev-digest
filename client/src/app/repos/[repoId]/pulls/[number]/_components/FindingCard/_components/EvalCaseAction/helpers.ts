import type { EvalExpectation, FindingRecord } from "@devdigest/shared";

/** What the eval control of a FindingCard shows. */
export type EvalActionState = "saved" | "inSet" | "noAgent" | "open" | "pending" | "ready";

/**
 * The one choice between the states, in a fixed order: saved this session, already in the
 * eval set, no producing agent, no decision yet, request pending, ready. The no-agent
 * reason comes before the open one because it never clears for that review.
 */
export function evalActionState(input: {
  accepted: boolean;
  dismissed: boolean;
  agentId: string | null;
  inSet: boolean;
  pending: boolean;
  saved: boolean;
}): EvalActionState {
  if (input.saved) return "saved";
  if (input.inSet) return "inSet";
  if (input.agentId === null) return "noAgent";
  if (!input.accepted && !input.dismissed) return "open";
  if (input.pending) return "pending";
  return "ready";
}

/** The case kind a decided finding becomes: accepted → must find, dismissed → must not flag. */
export function kindOf(f: Pick<FindingRecord, "accepted_at" | "dismissed_at">): EvalExpectation["kind"] {
  return f.dismissed_at && !f.accepted_at ? "must_not_flag" : "must_find";
}
