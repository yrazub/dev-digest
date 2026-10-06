"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrDetail } from "@devdigest/shared";
import { InlineFinding } from "./_components/InlineFinding";
import { countedInDiff, findingsOfLatestReviews } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  pr: PrDetail;
  repoFullName?: string | null;
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, pr, repoFullName, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const { data: reviews } = usePrReviews(prId);
  const create = useCreatePrComment(prId);
  // One switch for GitHub comments and finding cards; both start visible.
  const [showComments, setShowComments] = React.useState(true);

  const shownFindings = React.useMemo(() => findingsOfLatestReviews(reviews ?? []), [reviews]);
  const switchCount = (comments?.length ?? 0) + countedInDiff(shownFindings, pr.files);

  const headSha = pr.head_sha;
  const renderFinding = React.useCallback(
    (finding: FindingRecord) =>
      prId ? (
        <InlineFinding finding={finding} prId={prId} repoFullName={repoFullName} headSha={headSha} />
      ) : null,
    [prId, repoFullName, headSha],
  );

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findings: DiffFindingApi = {
    findings: shownFindings,
    showFindings: showComments,
    renderFinding,
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          switchCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", {
                count: switchCount,
              })}
            </Button>
          ) : undefined
        }
      >
        {t("smartDiff.filesChanged")}
      </SectionLabel>
      <p style={s.totals}>
        {t("smartDiff.totals", {
          files: pr.files_count,
          additions: pr.additions,
          deletions: pr.deletions,
        })}
      </p>
      <DiffViewer files={pr.files} commenting={commenting} findings={findings} />
    </section>
  );
}
