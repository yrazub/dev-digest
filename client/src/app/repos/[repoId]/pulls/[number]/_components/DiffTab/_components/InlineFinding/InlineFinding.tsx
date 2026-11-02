/* InlineFinding — the FindingCard drawn under a diff line, with accept/dismiss
   wired to the action hook the way FindingsPanel does. */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";

export function InlineFinding({
  finding,
  prId,
  repoFullName,
  headSha,
  agentId,
}: {
  finding: FindingRecord;
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  agentId: string | null;
}) {
  const action = useFindingAction();

  return (
    <FindingCard
      f={finding}
      defaultExpanded
      pending={action.isPending}
      repoFullName={repoFullName}
      headSha={headSha}
      agentId={agentId}
      onAction={(act) => action.mutate({ findingId: finding.id, action: act, prId })}
    />
  );
}
