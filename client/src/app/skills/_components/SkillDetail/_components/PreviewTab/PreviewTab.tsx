/* PreviewTab — the skill body rendered as the reviewing agent receives it
   (design: Skill Editor · Preview), never raw markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Markdown } from "@devdigest/ui";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.hint}>{t("preview.hint")}</div>
      <article className="skill-markdown" style={s.article}>
        <Markdown>{skill.body}</Markdown>
      </article>
    </div>
  );
}
