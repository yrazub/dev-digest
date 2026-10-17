import { describe, it, expect } from "vitest";
import { APP_NAV } from "./nav";

describe("APP_NAV", () => {
  it("WORKSPACE holds Pull Requests, then Project Context with the Folder icon", () => {
    const workspace = APP_NAV.find((g) => g.sectionKey === "workspace");
    expect(workspace?.items.map((i) => i.key)).toEqual(["pulls", "context"]);
    expect(workspace?.items[1]).toMatchObject({
      key: "context",
      icon: "Folder",
      href: "/repos/:repoId/context",
    });
  });
});
