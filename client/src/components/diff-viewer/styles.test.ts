import { describe, it, expect } from "vitest";
import { STICKY_OFFSET_VAR } from "./constants";
import { jumpedRow, lineRowFor, s } from "./styles";

// jsdom does not compute `scroll-margin-top`, so the strings that leave room below the sticky
// header are checked as values: the variable (default 0px, so a screen without a sticky header
// is unchanged) plus the 96 px / 130 px of the client spec "Files changed — target".
describe("diff-viewer scroll margins", () => {
  it("names the custom property the PR page header sets", () => {
    expect(STICKY_OFFSET_VAR).toBe("--diff-sticky-offset");
  });

  it("leaves 96 px above the target header and 130 px above the target line, both below the sticky offset", () => {
    expect(s.jumpHeader.scrollMarginTop).toBe("calc(var(--diff-sticky-offset, 0px) + 96px)");
    expect(s.jumpLine.scrollMarginTop).toBe("calc(var(--diff-sticky-offset, 0px) + 130px)");
  });

  it("puts the line margin on the target row only, and the pulse background only while it pulses", () => {
    const row = lineRowFor("ctx");
    expect(jumpedRow(row, undefined)).toBe(row);
    expect(jumpedRow(row, undefined).scrollMarginTop).toBeUndefined();

    const resting = jumpedRow(row, { pulse: false });
    expect(resting.scrollMarginTop).toBe("calc(var(--diff-sticky-offset, 0px) + 130px)");
    expect(resting.background).toBe("transparent");

    const pulsing = jumpedRow(row, { pulse: true });
    expect(pulsing.scrollMarginTop).toBe("calc(var(--diff-sticky-offset, 0px) + 130px)");
    expect(pulsing.background).toBe("var(--accent-bg)");
  });
});
