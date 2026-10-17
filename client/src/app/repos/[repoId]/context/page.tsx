"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (L05 Project Context). Thin route entry. */
export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={repoId} />;
}
