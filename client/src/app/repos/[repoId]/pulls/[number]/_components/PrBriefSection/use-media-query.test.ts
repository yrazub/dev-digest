import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "./use-media-query";

/** A matchMedia stub whose match state the test flips and announces. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("returns the current match for the query it was given", () => {
    const stub = stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 899px)"));
    expect(result.current).toBe(true);
    expect(stub.matchMedia).toHaveBeenCalledWith("(max-width: 899px)");
  });

  it("follows a change of the viewport", () => {
    const stub = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 899px)"));
    expect(result.current).toBe(false);

    act(() => stub.set(true));
    expect(result.current).toBe(true);
    act(() => stub.set(false));
    expect(result.current).toBe(false);
  });

  it("stops listening on unmount", () => {
    const stub = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 899px)"));
    expect(stub.listeners.size).toBe(1);
    unmount();
    expect(stub.listeners.size).toBe(0);
  });
});
