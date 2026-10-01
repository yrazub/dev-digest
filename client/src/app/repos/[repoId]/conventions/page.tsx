"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (L02 Conventions Extractor). Thin route entry. */
export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
