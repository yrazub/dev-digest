import { describe, it, expect, vi, afterEach } from "vitest";
import { copyToClipboard } from "./copy-to-clipboard";

afterEach(() => vi.unstubAllGlobals());

function stubClipboard(clipboard: Partial<Clipboard> | undefined) {
  vi.stubGlobal("navigator", { ...navigator, clipboard });
}

describe("copyToClipboard", () => {
  it("writes the text and resolves true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("resolves false when the write is rejected", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });

  it("resolves false when the Clipboard API is unavailable", async () => {
    stubClipboard(undefined);
    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });
});
