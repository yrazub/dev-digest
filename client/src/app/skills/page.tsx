import { Suspense } from "react";
import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills list + empty detail pane). Thin route entry. */
export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsView />
    </Suspense>
  );
}
