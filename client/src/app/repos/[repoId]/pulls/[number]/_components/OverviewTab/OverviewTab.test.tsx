import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The section is a module of its own with its own test; here it only records the props it got.
const sectionProps = vi.fn();

vi.mock("../PrBriefSection", () => ({
  PrBriefSection: (props: {
    prId: string;
    headSha: string | null;
    repoId: string;
    repoFullName: string | null;
    poll: boolean;
  }) => {
    sectionProps(props);
    return <section aria-label="PR Brief section" />;
  },
}));

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  sectionProps.mockClear();
});

describe("OverviewTab", () => {
  it("renders the PR Brief section before Description and hands it prId, headSha, repoId, repoFullName and poll", () => {
    render(
      <OverviewTab
        prBody="Fixes the charge flow"
        prId="pr1"
        repoId="r1"
        repoFullName="acme/api"
        headSha="head1"
        poll={true}
      />,
    );

    const section = screen.getByRole("region", { name: "PR Brief section" });
    const description = screen.getByText("Description");
    expect(section.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Fixes the charge flow")).toBeInTheDocument();
    expect(sectionProps).toHaveBeenCalledWith({
      prId: "pr1",
      headSha: "head1",
      repoId: "r1",
      repoFullName: "acme/api",
      poll: true,
    });
  });

  it("renders no section while the PR id is null, and Description still renders", () => {
    render(
      <OverviewTab
        prBody="Fixes the charge flow"
        prId={null}
        repoId="r1"
        repoFullName="acme/api"
        headSha="head1"
        poll={false}
      />,
    );

    expect(screen.queryByRole("region", { name: "PR Brief section" })).not.toBeInTheDocument();
    expect(sectionProps).not.toHaveBeenCalled();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Fixes the charge flow")).toBeInTheDocument();
  });
});
