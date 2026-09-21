import { describe, it, expect } from "vitest";
import { formatCostUsd } from "./format-cost";

describe("formatCostUsd", () => {
  it("renders four decimals so a fraction-of-a-cent run is not $0.00", () => {
    expect(formatCostUsd(0.0013)).toBe("$0.0013");
    expect(formatCostUsd(0.001)).toBe("$0.0010");
    expect(formatCostUsd(1.5)).toBe("$1.5000");
  });

  it("keeps a known zero distinct from an unknown cost", () => {
    expect(formatCostUsd(0)).toBe("$0.0000");
  });

  it("renders null and undefined as an em-dash", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
  });
});
