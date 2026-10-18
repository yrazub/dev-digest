import { describe, it, expect } from "vitest";
import type { BriefInput, PrBriefResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { briefViewMode, generateErrorKind, inputsLine, shortSha } from "./helpers";

const BRIEF = { brief: { summary: "x" } } as unknown as PrBriefResponse;
const NONE: PrBriefResponse = { brief: null };

describe("briefViewMode", () => {
  it("is loading while the first read is in flight", () => {
    expect(briefViewMode({ isLoading: true, isError: false, data: undefined })).toBe("loading");
  });

  it("is error when the read failed and nothing is cached", () => {
    expect(briefViewMode({ isLoading: false, isError: true, data: undefined })).toBe("error");
  });

  it("is empty when the server answers brief: null", () => {
    expect(briefViewMode({ isLoading: false, isError: false, data: NONE })).toBe("empty");
  });

  it("is brief when a brief is cached", () => {
    expect(briefViewMode({ isLoading: false, isError: false, data: BRIEF })).toBe("brief");
  });

  it("lets data win over a failed refetch (TanStack keeps data next to isError)", () => {
    expect(briefViewMode({ isLoading: false, isError: true, data: BRIEF })).toBe("brief");
    expect(briefViewMode({ isLoading: false, isError: true, data: NONE })).toBe("empty");
  });
});

describe("inputsLine", () => {
  const input = (kind: BriefInput["kind"], status: BriefInput["status"], reason: BriefInput["reason"] = null, omitted: number | null = null): BriefInput => ({
    kind,
    status,
    reason,
    omitted,
  });

  it("splits missing from trimmed and leaves used inputs out", () => {
    const missing = input("blast_radius", "missing", "no_data");
    const trimmed = input("spec_documents", "trimmed", "over_budget", 2);
    const used = input("diff_stats", "used");
    expect(inputsLine([used, missing, trimmed])).toEqual({ missing: [missing], trimmed: [trimmed] });
  });

  it("returns two empty lists when every input was used", () => {
    expect(inputsLine([input("intent", "used"), input("description", "used")])).toEqual({
      missing: [],
      trimmed: [],
    });
  });
});

describe("shortSha", () => {
  it("keeps the first 7 characters", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
  });
});

describe("generateErrorKind", () => {
  it("recognises the server's brief_unavailable code as a missing key", () => {
    expect(generateErrorKind(new ApiError("No key", 400, "brief_unavailable"))).toBe("no_api_key");
  });

  it("treats any other error as other", () => {
    expect(generateErrorKind(new ApiError("boom", 502, "bad_gateway"))).toBe("other");
    expect(generateErrorKind(new ApiError("bad", 400))).toBe("other");
    expect(generateErrorKind(new Error("brief_unavailable"))).toBe("other");
  });
});
