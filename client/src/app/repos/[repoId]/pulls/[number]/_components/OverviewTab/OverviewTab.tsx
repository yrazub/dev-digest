"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { PrBriefSection } from "../PrBriefSection";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
  poll: boolean;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, poll }: OverviewTabProps) {
  return (
    <>
      {prId && (
        <PrBriefSection
          prId={prId}
          headSha={headSha}
          repoId={repoId}
          repoFullName={repoFullName}
          poll={poll}
        />
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
