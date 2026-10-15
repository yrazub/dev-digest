"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {prId && <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
