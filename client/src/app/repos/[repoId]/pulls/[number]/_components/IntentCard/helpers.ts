import type { IntentSource } from "@devdigest/shared";

/** The part of next-intl's `t` the source labels need. */
export type Translate = (key: string, values?: { ref: string }) => string;

/**
 * Short label of a source: `Title`, `Issue #471`, a document path, `Changed files`. A ticket
 * in another tracker is referenced by its URL, not by `#n`; it reads `Ticket <host/path>`.
 */
export function sourceLabel(source: IntentSource, t: Translate): string {
  if (source.kind === "spec_document" && source.ref) return source.ref;
  if (source.kind === "linked_issue") {
    const ref = source.ref ?? "";
    if (/^https?:\/\//i.test(ref)) return t("intent.source.ticket", { ref: ref.replace(/^https?:\/\//i, "") });
    return t("intent.source.linked_issue", { ref }).trim();
  }
  return t(`intent.source.${source.kind}`, { ref: source.ref ?? "" });
}

/** The ticket and document sources that could not be read: the ones that set `missing_context`. */
export function unreadReferences(sources: IntentSource[]): IntentSource[] {
  return sources.filter(
    (src) =>
      src.status === "unavailable" && (src.kind === "linked_issue" || src.kind === "spec_document"),
  );
}
