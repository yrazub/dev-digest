"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id — the same list with the skill's detail pane open. Thin route entry. */
export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <SkillsView selectedId={id} />
    </Suspense>
  );
}
