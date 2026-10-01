/* SkillBodyEditor — the markdown body editor shared by skill create, skill
   Config and the Conventions "create skill" modal (design: Skill Editor ·
   Config). Line-numbered textarea, `<name>.md` header with an unsaved marker
   and an approximate token count, and a Write / Preview toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { approxTokens } from "./helpers";
import { s } from "./styles";

export function SkillBodyEditor({
  value,
  onChange,
  fileName,
  dirty,
  rows = 18,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Shown in the header as `<fileName>.md`. */
  fileName: string;
  dirty?: boolean;
  rows?: number;
}) {
  const t = useTranslations("skills");
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const gutter = React.useRef<HTMLPreElement>(null);
  const lines = Math.max(value.split("\n").length, rows);

  return (
    <div style={s.frame}>
      <div style={s.header}>
        <span className="mono" style={s.file}>
          {(fileName || "skill") + ".md"}
        </span>
        {dirty && <span style={s.unsaved}>{t("editor.unsaved")}</span>}
        <span style={s.tokens} title={t("editor.tokensHint")}>
          {t("editor.tokens", { count: approxTokens(value) })}
        </span>
        <div style={s.modes} role="tablist">
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              style={s.mode(mode === m)}
            >
              {t(`editor.${m}`)}
            </button>
          ))}
        </div>
      </div>
      {mode === "write" ? (
        <div style={s.body}>
          <pre ref={gutter} aria-hidden style={s.gutter(rows)}>
            {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
          </pre>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            rows={rows}
            spellCheck={false}
            aria-label={t("form.body")}
            className="mono"
            style={s.textarea}
          />
        </div>
      ) : (
        <div className="skill-markdown" style={s.preview(rows)}>
          <Markdown>{value}</Markdown>
        </div>
      )}
      <div style={s.hint}>{t("editor.hint")}</div>
    </div>
  );
}
