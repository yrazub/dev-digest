"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { AgentEvalView } from "./_components/AgentEvalView";

/* Route: /evals/:agentId — one agent's eval runs, metric trend and Compare. */
export default function AgentEvalPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return (
    <Suspense>
      <AgentEvalView key={agentId} agentId={agentId} />
    </Suspense>
  );
}
