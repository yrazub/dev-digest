import type { BriefInput, PrBriefResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { PATH_HEAD, PATH_MAX, PATH_TAIL } from "./constants";

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

/** A path as the Review focus row shows it: whole up to 56 characters, else first 20 + "…" + last 35. */
export function elidePath(file: string): string {
  if (file.length <= PATH_MAX) return file;
  return `${file.slice(0, PATH_HEAD)}…${file.slice(-PATH_TAIL)}`;
}
