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

  it("SKILLS LAB holds Skills, Agents, Conventions, then the Eval Dashboard with the Gauge icon (R-WEB-28)", () => {
    const lab = APP_NAV.find((g) => g.sectionKey === "skillsLab");
    expect(lab?.items.map((i) => i.key)).toEqual(["skills", "agents", "conventions", "eval"]);
    expect(lab?.items[3]).toMatchObject({ key: "eval", icon: "Gauge", href: "/evals" });
  });
});
