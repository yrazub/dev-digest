import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { PrDetail } from "@devdigest/shared";
import { PrDetailHeader } from "./PrDetailHeader";

// The header is `position: sticky`, so it covers the top of the scroll container. It publishes its
// own height as `--diff-sticky-offset` on its parent so the diff viewer's jump lands below it.
// jsdom has no layout: `offsetHeight` and `ResizeObserver` are stubbed.
const VAR = "--diff-sticky-offset";

const PR: PrDetail = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting",
  author: "octocat",
  branch: "feature/x",
  base: "main",
  head_sha: "abc123",
  additions: 5,
  deletions: 1,
  files_count: 2,
  status: "open",
  body: null,
  files: [],
  commits: [],
};

let height = 144;
const observers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");

beforeEach(() => {
  height = 144;
  observers.length = 0;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => height,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(callback: () => void) {
        observers.push({ callback, observe: this.observe, disconnect: this.disconnect });
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
});

function renderHeader() {
  return render(
    <div data-testid="host">
      <PrDetailHeader
        pr={PR}
        prId={null}
        tab="diff"
        findingsCount={0}
        githubUrl={null}
        onSetTab={vi.fn()}
        onRunStart={vi.fn()}
        onRunsStarted={vi.fn()}
      />
    </div>,
  );
}

describe("PrDetailHeader — the sticky offset for the diff jump", () => {
  it("publishes its height on its parent, follows a resize, and removes the property on unmount", () => {
    const view = renderHeader();
    const host = screen.getByTestId("host");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Add rate limiting");
    expect(host.style.getPropertyValue(VAR)).toBe("144px");
    expect(observers).toHaveLength(1);
    expect(observers[0]?.observe).toHaveBeenCalledTimes(1);

    // the header grows (a wrapped title, the merged banner): the observer re-publishes
    height = 190;
    act(() => observers[0]?.callback());
    expect(host.style.getPropertyValue(VAR)).toBe("190px");

    view.unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(host.style.getPropertyValue(VAR)).toBe("");
  });
});
