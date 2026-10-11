/* useResyncWait — the Resync wait of the degraded note: POST the resync, poll the index state until
   the index row changes (the rule `IndexStatus` uses), then read the map again. The wait gives up
   after RESYNC_MAX_POLLS answers, and a failed answer counts like an unchanged one, so it always ends. */
"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { blastKeys } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { resyncSettled } from "@/lib/repo-intel-resync";
import { RESYNC_MAX_POLLS } from "../../constants";

/** A running wait: the index row's `updatedAt` when Resync was pressed, and the answered polls so far. */
interface ResyncWait {
  from: string;
  polls: number;
}

export interface ResyncWaitControl {
  /** The resync request or the wait after it is in progress. */
  running: boolean;
  /** The last wait gave up before the index changed. */
  slow: boolean;
  /** The index state has loaded, so a wait has a starting point. */
  ready: boolean;
  start: () => void;
}

export function useResyncWait(repoId: string, prId: string): ResyncWaitControl {
  const qc = useQueryClient();
  const [wait, setWait] = React.useState<ResyncWait | null>(null);
  const [slow, setSlow] = React.useState(false);
  // The time of the last answer (data or failure) that was counted, so one answer is never counted twice.
  const handledAt = React.useRef(0);
  const status = useRepoIntelStatus(repoId, wait !== null);
  const resync = useResyncRepoIntel(repoId);
  const state = status.data;
  const answeredAt = Math.max(status.dataUpdatedAt, status.errorUpdatedAt);
  // The newest answer is a failure: the cached state is older than the wait, so it cannot settle it.
  const failed = status.errorUpdatedAt > status.dataUpdatedAt;

  // Each new answer of the polled index state either ends the wait or counts as one more poll.
  React.useEffect(() => {
    if (wait === null || answeredAt === handledAt.current) return;
    handledAt.current = answeredAt;
    if (!failed && resyncSettled(wait.from, state)) {
      setWait(null);
      void qc.invalidateQueries({ queryKey: blastKeys.pull(prId) });
    } else if (wait.polls + 1 >= RESYNC_MAX_POLLS) {
      setWait(null);
      setSlow(true);
    } else {
      setWait({ from: wait.from, polls: wait.polls + 1 });
    }
  }, [wait, answeredAt, failed, state, qc, prId]);

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

  return { running: resync.isPending || wait !== null, slow, ready: state !== undefined, start };
}
