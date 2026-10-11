/* ResyncAction — the part of the degraded note that exists only for a reason a resync can fix: the
   sentence (its `children`), the "still waiting" sentence after it, and the Resync button. A file of
   its own so that the hook, and with it the index-state request, is mounted only for those reasons. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";
import { useResyncWait } from "./use-resync-wait";

interface ResyncActionProps {
  repoId: string;
  prId: string;
  /** The sentence of the reason, rendered before the "still waiting" sentence. */
  children: React.ReactNode;
}

export function ResyncAction({ repoId, prId, children }: ResyncActionProps) {
  const t = useTranslations("blast");
  const { running, slow, ready, start } = useResyncWait(repoId, prId);

  return (
    <>
      <span>
        {children}
        {slow && (
          <>
            {" "}
            <span>{t("degraded.resyncSlow")}</span>
          </>
        )}
      </span>
      <span style={s.noteAction}>
        <Button size="sm" kind="ghost" icon="RefreshCw" onClick={start} loading={running} disabled={running || !ready}>
          {running ? t("degraded.resyncing") : t("degraded.resync")}
        </Button>
      </span>
    </>
  );
}
