"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AgentsView } from "../_components/AgentsView";

/* Route: /agents/:id — the same list with the agent's editor open. Tab state lives in ?tab=. */
export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <AgentsView selectedId={id} />
    </Suspense>
  );
}
