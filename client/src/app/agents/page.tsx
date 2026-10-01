import { Suspense } from "react";
import { AgentsView } from "./_components/AgentsView";

/* Route: /agents (agent list + empty detail pane). Thin route entry. */
export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsView />
    </Suspense>
  );
}
