import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// One stable router and a mutable search value, as the hook reads both from next/navigation.
const nav = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => nav.search,
}));

import { focusSearch, tabSearch, usePrDetailNav } from "./use-pr-detail-nav";

const BASE = "/repos/r1/pulls/482";

beforeEach(() => {
  nav.router.push.mockClear();
  nav.router.replace.mockClear();
  nav.search = new URLSearchParams();
});

describe("focusSearch", () => {
  it("sets tab=diff, file and line, keeping order, trace and blast, and encodes the path", () => {
    const current = new URLSearchParams("order=smart&trace=run1&blast=open&tab=overview");
    const sp = new URLSearchParams(focusSearch(current, "src/a b/config.ts", 12));

    expect(sp.get("tab")).toBe("diff");
    expect(sp.get("file")).toBe("src/a b/config.ts");
    expect(sp.get("line")).toBe("12");
    expect(sp.get("order")).toBe("smart");
    expect(sp.get("trace")).toBe("run1");
    expect(sp.get("blast")).toBe("open");
    // the slash is percent-encoded in the raw string
    expect(focusSearch(new URLSearchParams(), "src/config.ts", 12)).toBe("tab=diff&file=src%2Fconfig.ts&line=12");
  });

  it("does not change the params it was given", () => {
    const current = new URLSearchParams("order=smart");
    focusSearch(current, "a.ts", 1);
    expect(current.toString()).toBe("order=smart");
  });
});

describe("tabSearch", () => {
  it("sets the tab and drops file and line, keeping the other parameters", () => {
    const current = new URLSearchParams("tab=diff&file=src%2Fa.ts&line=3&order=smart&trace=run1");
    const sp = new URLSearchParams(tabSearch(current, "findings"));

    expect(sp.get("tab")).toBe("findings");
    expect(sp.has("file")).toBe(false);
    expect(sp.has("line")).toBe(false);
    expect(sp.get("order")).toBe("smart");
    expect(sp.get("trace")).toBe("run1");
  });
});

describe("usePrDetailNav", () => {
  it("reads the tab from the URL and defaults to overview", () => {
    expect(renderHook(() => usePrDetailNav(BASE)).result.current.tab).toBe("overview");
    nav.search = new URLSearchParams("tab=diff");
    expect(renderHook(() => usePrDetailNav(BASE)).result.current.tab).toBe("diff");
  });

  it("openFocus pushes the diff URL, keeping the other parameters", () => {
    nav.search = new URLSearchParams("order=smart&trace=run1");
    const { result } = renderHook(() => usePrDetailNav(BASE));

    result.current.openFocus("src/config.ts", 12);

    expect(nav.router.replace).not.toHaveBeenCalled();
    expect(nav.router.push).toHaveBeenCalledTimes(1);
    const url = new URL(String(nav.router.push.mock.calls[0]?.[0]), "http://x");
    expect(url.pathname).toBe(BASE);
    expect(url.search).toContain("file=src%2Fconfig.ts");
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("line")).toBe("12");
    expect(url.searchParams.get("order")).toBe("smart");
    expect(url.searchParams.get("trace")).toBe("run1");
  });

  it("setTab replaces the URL without file and line", () => {
    nav.search = new URLSearchParams("tab=diff&file=src%2Fa.ts&line=3&order=smart");
    const { result } = renderHook(() => usePrDetailNav(BASE));

    result.current.setTab("findings");

    expect(nav.router.push).not.toHaveBeenCalled();
    expect(nav.router.replace).toHaveBeenCalledTimes(1);
    const url = new URL(String(nav.router.replace.mock.calls[0]?.[0]), "http://x");
    expect(url.pathname).toBe(BASE);
    expect(url.searchParams.get("tab")).toBe("findings");
    expect(url.searchParams.has("file")).toBe(false);
    expect(url.searchParams.has("line")).toBe(false);
    expect(url.searchParams.get("order")).toBe("smart");
  });

  it("setParam replaces the URL, setting a value or removing the key", () => {
    nav.search = new URLSearchParams("tab=findings&trace=run1");
    const { result } = renderHook(() => usePrDetailNav(BASE));

    result.current.setParam("trace", null);
    expect(nav.router.replace).toHaveBeenLastCalledWith(`${BASE}?tab=findings`);

    result.current.setParam("trace", "run2");
    expect(nav.router.replace).toHaveBeenLastCalledWith(`${BASE}?tab=findings&trace=run2`);
    expect(nav.router.push).not.toHaveBeenCalled();
  });
});
