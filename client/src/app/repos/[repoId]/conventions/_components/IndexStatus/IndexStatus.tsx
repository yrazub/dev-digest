/* IndexStatus — the repo-intel index line in the Conventions header: which
   commit the scan reads from, how old it is, and Resync index. Resync fetches
   origin, moves DevDigest's clone to the branch tip and re-indexes the changed
   files (POST /repos/:id/resync, 202). The job runs in the background, so the
   line polls index-state until the index row changes or RESYNC_TIMEOUT_MS
   passes. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { useToast } from "@/lib/toast";
import { RESYNC_TIMEOUT_MS } from "./constants";
import { shortSha } from "./helpers";
import { s } from "./styles";

export function IndexStatus({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const toast = useToast();
  // The index row's updatedAt when Resync was pressed; set while waiting for the job.
  const [waitingFrom, setWaitingFrom] = React.useState<string | null>(null);
  const status = useRepoIntelStatus(repoId, waitingFrom !== null);
  const resync = useResyncRepoIntel(repoId);
  const state = status.data;

  // The job finished when the index row changed; give up after the timeout.
  React.useEffect(() => {
    if (waitingFrom === null || !state) return;
    if (state.updatedAt !== waitingFrom) {
      setWaitingFrom(null);
      toast.success(t("index.updated", { sha: shortSha(state.lastIndexedSha) }));
    }
  }, [waitingFrom, state, toast, t]);
  React.useEffect(() => {
    if (waitingFrom === null) return;
    const timer = setTimeout(() => {
      setWaitingFrom(null);
      toast.info(t("index.unchanged"));
    }, RESYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waitingFrom, toast, t]);

  const start = () => {
    if (!state) return;
    resync.mutate(undefined, { onSuccess: () => setWaitingFrom(state.updatedAt) });
  };

  const running = resync.isPending || waitingFrom !== null;
  const indexed = !!state?.lastIndexedSha;

  return (
    <div style={s.row} data-testid="index-status">
      <span style={s.text}>
        {running
          ? t("index.resyncing")
          : !state
            ? t("index.loading")
            : indexed
              ? t("index.at", {
                  sha: shortSha(state.lastIndexedSha),
                  ago: format.relativeTime(new Date(state.updatedAt)),
                })
              : t("index.none")}
      </span>
      <Button size="sm" kind="ghost" icon="RefreshCw" onClick={start} loading={running} disabled={!state}>
        {t("index.resync")}
      </Button>
    </div>
  );
}
