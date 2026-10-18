import type { BriefInput, PrBriefResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

export type BriefViewMode = "loading" | "error" | "empty" | "brief";

/** Which body the section shows. Data wins over a refetch error: TanStack keeps `data` next to `isError`. */
export function briefViewMode({
  isLoading,
  isError,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  data: PrBriefResponse | undefined;
}): BriefViewMode {
  if (data) return data.brief ? "brief" : "empty";
  if (isLoading) return "loading";
  return isError ? "error" : "loading";
}

/** The inputs the summary panel calls out; `used` inputs need no remark. */
export function inputsLine(inputs: BriefInput[]): { missing: BriefInput[]; trimmed: BriefInput[] } {
  return {
    missing: inputs.filter((input) => input.status === "missing"),
    trimmed: inputs.filter((input) => input.status === "trimmed"),
  };
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** `brief_unavailable` is the server's 400 for a missing provider key. */
export function generateErrorKind(err: unknown): "no_api_key" | "other" {
  return err instanceof ApiError && err.code === "brief_unavailable" ? "no_api_key" : "other";
}
