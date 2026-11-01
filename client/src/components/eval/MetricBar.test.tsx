import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricBar } from "./MetricBar";

describe("MetricBar", () => {
  it("shows the metric as a whole percent beside the bar", () => {
    render(<MetricBar value={0.667} color="var(--accent)" />);
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("shows an em-dash for an unknown metric and for a zero one it shows 0%", () => {
    const { rerender } = render(<MetricBar value={null} color="var(--ok)" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    rerender(<MetricBar value={0} color="var(--ok)" />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
