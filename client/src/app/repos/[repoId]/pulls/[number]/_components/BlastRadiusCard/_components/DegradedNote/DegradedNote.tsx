/* DegradedNote — the mark of an answer that may be incomplete: a title and the sentence of
   the reason. The map, when there is one, stays rendered under it. For the reasons a resync can
   fix it also holds the Resync button: POST the resync, poll the index state until the index row
   changes (the rule `IndexStatus` uses), then read the map again. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { blastKeys } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { resyncSettled } from "@/lib/repo-intel-resync";
import { RESYNC_FIXABLE_REASONS, RESYNC_MAX_POLLS } from "../../constants";
import { s } from "../../styles";

interface DegradedNoteProps {
  reason: BlastDegradedReason;
  repoId: string;
  prId: string;
}

/** A running wait: the index row's `updatedAt` when Resync was pressed, and the answered polls so far. */
interface ResyncWait {
  from: string;
  polls: number;
}

export function DegradedNote({ reason, repoId, prId }: DegradedNoteProps) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const [wait, setWait] = React.useState<ResyncWait | null>(null);
  const [slow, setSlow] = React.useState(false);
  // `dataUpdatedAt` of the last answer that was counted, so one answer is never counted twice.
  const handledAt = React.useRef(0);
  const status = useRepoIntelStatus(repoId, wait !== null);
  const resync = useResyncRepoIntel(repoId);
  const state = status.data;
  const answeredAt = status.dataUpdatedAt;

  // Each new answer of the polled index state either ends the wait or counts as one more poll.
  React.useEffect(() => {
    if (wait === null || answeredAt === handledAt.current) return;
    handledAt.current = answeredAt;
    if (resyncSettled(wait.from, state)) {
      setWait(null);
      void qc.invalidateQueries({ queryKey: blastKeys.pull(prId) });
    } else if (wait.polls + 1 >= RESYNC_MAX_POLLS) {
      setWait(null);
      setSlow(true);
    } else {
      setWait({ from: wait.from, polls: wait.polls + 1 });
    }
  }, [wait, answeredAt, state, qc, prId]);

  const start = () => {
    if (!state) return;
    resync.mutate(undefined, {
      onSuccess: () => {
        handledAt.current = answeredAt;
        setSlow(false);
        setWait({ from: state.updatedAt, polls: 0 });
      },
    });
  };

  const running = resync.isPending || wait !== null;

  return (
    <div role="note" aria-label={t("degraded.title")} style={s.note}>
      <Icon.AlertTriangle size={14} style={s.noteIcon} />
      <span>
        <span style={s.noteTitle}>{t("degraded.title")}</span>
        {" "}
        <span>{t(`degraded.reason.${reason}`)}</span>
        {slow && (
          <>
            {" "}
            <span>{t("degraded.resyncSlow")}</span>
          </>
        )}
      </span>
      {RESYNC_FIXABLE_REASONS.has(reason) && (
        <span style={s.noteAction}>
          <Button size="sm" kind="ghost" icon="RefreshCw" onClick={start} loading={running} disabled={running || !state}>
            {running ? t("degraded.resyncing") : t("degraded.resync")}
          </Button>
        </span>
      )}
    </div>
  );
}
