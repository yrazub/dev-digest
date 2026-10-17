import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SafeMarkdown } from "./SafeMarkdown";

afterEach(cleanup);

describe("SafeMarkdown", () => {
  it("shows raw HTML as text, with no element made from it", () => {
    render(<SafeMarkdown>{"Before <b>x</b> after"}</SafeMarkdown>);
    expect(screen.getByText("Before <b>x</b> after")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("opens an https link in a new tab with noopener noreferrer", () => {
    render(<SafeMarkdown>{"[docs](https://example.com/a)"}</SafeMarkdown>);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps an http link clickable", () => {
    render(<SafeMarkdown>{"[plain](http://example.com)"}</SafeMarkdown>);
    expect(screen.getByRole("link", { name: "plain" })).toHaveAttribute("href", "http://example.com");
  });

  it("renders javascript:, mailto: and relative links as plain text with no anchor", () => {
    render(
      <SafeMarkdown>
        {"[js](javascript:alert(1)) [mail](mailto:a@b.co) [rel](./other.md) [abs](/specs/x.md)"}
      </SafeMarkdown>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
    for (const text of ["js", "mail", "rel", "abs"]) {
      expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    }
  });

  it("keeps the same link and code DOM nodes when re-rendered with the same text", () => {
    const text = "See [docs](https://example.com/a) and `npm test` for details";
    const { rerender } = render(<SafeMarkdown>{text}</SafeMarkdown>);
    const link = screen.getByRole("link", { name: "docs" });
    const code = screen.getByText("npm test");

    rerender(<SafeMarkdown>{text}</SafeMarkdown>);

    expect(screen.getByRole("link", { name: "docs" })).toBe(link);
    expect(screen.getByText("npm test")).toBe(code);
  });

  it("renders # and ## as level-1 and level-2 headings", () => {
    render(<SafeMarkdown>{"# Title\n\n## Sub"}</SafeMarkdown>);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Sub" })).toBeInTheDocument();
  });

  it("renders nothing for an empty or null body", () => {
    const { container, rerender } = render(<SafeMarkdown>{null}</SafeMarkdown>);
    expect(container).toBeEmptyDOMElement();
    rerender(<SafeMarkdown>{""}</SafeMarkdown>);
    expect(container).toBeEmptyDOMElement();
  });
});
