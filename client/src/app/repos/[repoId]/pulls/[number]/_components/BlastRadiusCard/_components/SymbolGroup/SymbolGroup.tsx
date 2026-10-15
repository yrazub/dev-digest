/* SymbolGroup — one changed symbol: its name and caller count, its callers as file:line, and
   the endpoints and cron jobs in the calling files. Renders what the server sent, in its order.
   Repository text is rendered as text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { CHIP_TONE } from "../../constants";
import { callerHref, groupIsCut } from "../../helpers";
import { s } from "../../styles";

interface SymbolGroupProps {
  group: DownstreamImpact;
  /** The symbol as displayed, `()` included. */
  label: string;
  callerLimit: number;
  repoFullName: string | null;
  indexedSha: string | null;
  headSha: string | null;
}

export function SymbolGroup({
  group,
  label,
  callerLimit,
  repoFullName,
  indexedSha,
  headSha,
}: SymbolGroupProps) {
  const t = useTranslations("blast");
  const cut = groupIsCut(group, callerLimit);

  return (
    <section aria-label={label} style={s.group}>
      <div style={s.symbolRow}>
        <span className="mono" style={s.symbolName}>
          {label}
        </span>
        <span style={s.callerCount} title={cut ? t("callersCut", { limit: callerLimit }) : undefined}>
          {t("callerCount", { count: group.callers.length })}
          {cut && "+"}
        </span>
      </div>

      <ul style={s.list}>
        {group.callers.map((caller) => {
          const href = callerHref(repoFullName, indexedSha, headSha, caller.file, caller.line);
          return (
            <li key={`${caller.file}:${caller.line}`} style={s.caller}>
              <Icon.CornerDownRight size={12} style={s.callerIcon} />
              {href ? (
                <a
                  className="mono"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("openOnGithub", { file: caller.file, line: caller.line })}
                  style={s.callerLink}
                >
                  {caller.file}:{caller.line}
                </a>
              ) : (
                <span className="mono" style={s.callerRef}>
                  {caller.file}:{caller.line}
                </span>
              )}
              <span style={s.callerName}>{caller.name}</span>
            </li>
          );
        })}
      </ul>

      {group.endpoints_affected.length > 0 && (
        <ul
          aria-label={t("stat.endpoints", { count: group.endpoints_affected.length })}
          style={s.chipRow}
        >
          {group.endpoints_affected.map((endpoint) => (
            <li key={endpoint}>
              <Badge mono icon={CHIP_TONE.endpoint.icon} color={CHIP_TONE.endpoint.color} bg={CHIP_TONE.endpoint.bg}>
                {endpoint}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {group.crons_affected.length > 0 && (
        <ul aria-label={t("stat.crons", { count: group.crons_affected.length })} style={s.chipRow}>
          {group.crons_affected.map((cron) => (
            <li key={cron}>
              <Badge mono icon={CHIP_TONE.cron.icon} color={CHIP_TONE.cron.color} bg={CHIP_TONE.cron.bg}>
                {cron}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
