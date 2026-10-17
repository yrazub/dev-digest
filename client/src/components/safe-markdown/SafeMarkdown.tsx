/* SafeMarkdown — renders untrusted repository markdown. No raw-HTML plugin (raw
   HTML shows as text); only http(s) links are clickable, in a new tab. The
   vendored `Markdown` is not used: it keeps mailto:, relative and other links. */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** An absolute http: or https: URL. A relative href makes `new URL` throw. */
function isWebUrl(href: string | undefined): href is string {
  if (!href) return false;
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function SafeMarkdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) =>
            isWebUrl(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-text)", textDecoration: "underline" }}
              >
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
