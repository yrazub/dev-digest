import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The block is a module of its own with its own test; here it only records the props it got.
const blastProps = vi.fn();

vi.mock("../BlastRadiusCard", () => ({
  BlastRadiusCard: (props: { prId: string; repoFullName: string | null; headSha: string | null }) => {
    blastProps(props);
    return <section aria-label="Blast radius block" />;
  },
}));

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  blastProps.mockClear();
});

describe("OverviewTab", () => {
  it("renders the block before Description and hands it prId, repoFullName and headSha", () => {
    render(<OverviewTab prBody="Fixes the charge flow" prId="pr1" repoFullName="acme/api" headSha="head1" />);

    const block = screen.getByRole("region", { name: "Blast radius block" });
    const description = screen.getByText("Description");
    expect(block.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Fixes the charge flow")).toBeInTheDocument();
    expect(blastProps).toHaveBeenCalledWith({ prId: "pr1", repoFullName: "acme/api", headSha: "head1" });
  });

  it("renders no block while the PR id is null, and Description still renders", () => {
    render(<OverviewTab prBody="Fixes the charge flow" prId={null} repoFullName="acme/api" headSha="head1" />);

    expect(screen.queryByRole("region", { name: "Blast radius block" })).not.toBeInTheDocument();
    expect(blastProps).not.toHaveBeenCalled();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Fixes the charge flow")).toBeInTheDocument();
  });
});
