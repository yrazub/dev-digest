/** The app's sidebar menu. It lives here, not in the vendored `@devdigest/ui`:
   AppFrame's Sidebar renders whatever `ShellContext.nav` holds, so adding a
   page means adding an item below, never editing `src/vendor/ui`.
   Labels are next-intl keys: `shell.navSection.<sectionKey>`, `shell.nav.<key>`. */
import type { IconName } from "@devdigest/ui";

export interface AppNavItem {
  /** Also the active-route key from `activeKeyFor` and the `shell.nav` label key. */
  key: string;
  icon: IconName;
  /** Route template; `:repoId` is filled with the active repo id. */
  href: string;
  /** `g`-then-key navigation shortcut. */
  gKey?: string;
}

export interface AppNavGroup {
  sectionKey: string;
  items: AppNavItem[];
}

export const APP_NAV: AppNavGroup[] = [
  {
    sectionKey: "workspace",
    items: [{ key: "pulls", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" }],
  },
  {
    sectionKey: "skillsLab",
    items: [
      { key: "skills", icon: "Sparkles", href: "/skills", gKey: "s" },
      { key: "agents", icon: "Cpu", href: "/agents", gKey: "a" },
    ],
  },
];
