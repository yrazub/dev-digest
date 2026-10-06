"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrDetail } from "@devdigest/shared";
import { InlineFinding } from "./_components/InlineFinding";
import { OrderSwitch, type FilesOrder } from "./_components/OrderSwitch";
import { RoleGroup } from "./_components/RoleGroup";
import { SKELETON_ROW_KEYS } from "./constants";
import { countedInDiff, findingsOfLatestReviews, joinGroups } from "./helpers";
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
  const smartDiff = useSmartDiff(prId, pr.head_sha);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  // One switch for GitHub comments and finding cards; both start visible.
  const [showComments, setShowComments] = React.useState(true);

  const shownFindings = React.useMemo(() => findingsOfLatestReviews(reviews ?? []), [reviews]);
  // The order lives in the URL so it survives a reload: `order=original`, anything else is smart.
  const order: FilesOrder = search.get("order") === "original" ? "original" : "smart";
  const handleOrderChange = (next: FilesOrder) => {
    const sp = new URLSearchParams(search.toString());
    if (next === "original") sp.set("order", "original");
    else sp.delete("order");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const joined = React.useMemo(
    () => (smartDiff.data ? joinGroups(smartDiff.data.groups, pr.files) : null),
    [smartDiff.data, pr.files],
  );
  const groups = joined?.groups.filter((g) => g.files.length > 0) ?? [];
  const smart = order === "smart";
  const groupingFailed = smart && smartDiff.isError;
  const groupingPending = smart && !smartDiff.isError && !smartDiff.data && pr.files.length > 0;
  const showGroups = smart && !!joined && pr.files.length > 0;
  const showFlat = !smart || groupingFailed || pr.files.length === 0;
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
        {t(showGroups && groups.length > 0 ? "smartDiff.groupedByRole" : "smartDiff.filesChanged")}
      </SectionLabel>
      <div style={s.totalsRow}>
        <p style={s.totals}>
          {t("smartDiff.totals", {
            files: pr.files_count,
            additions: pr.additions,
            deletions: pr.deletions,
          })}
        </p>
        <OrderSwitch value={order} onChange={handleOrderChange} />
      </div>
      {groupingFailed ? <p style={s.notice}>{t("smartDiff.groupingUnavailable")}</p> : null}
      {groupingPending ? (
        <div style={s.skeletonList}>
          {SKELETON_ROW_KEYS.map((key) => (
            <Skeleton key={key} height={38} />
          ))}
        </div>
      ) : null}
      {showFlat ? <DiffViewer files={pr.files} commenting={commenting} findings={findings} /> : null}
      {showGroups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <RoleGroup
              key={g.role}
              role={g.role}
              files={g.files}
              commenting={commenting}
              findings={findings}
            />
          ))}
          {joined && joined.ungrouped.length > 0 ? (
            <DiffViewer files={joined.ungrouped} commenting={commenting} findings={findings} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
