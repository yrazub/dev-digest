"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SHORTCUTS, type NavGroup, type ShortcutDef } from "@devdigest/ui";
import { APP_NAV } from "../nav";

interface AppNav {
  /** Translated nav groups for `ShellContext.nav`. */
  groups: NavGroup[];
  /** Shortcut cheat sheet: one `g <key>` row per nav item, then the kit's non-navigation rows. */
  shortcuts: ShortcutDef[];
}

/** Resolves `APP_NAV` into the translated shapes the shell and shortcuts help render. */
export function useAppNav(): AppNav {
  const t = useTranslations("shell");

  return React.useMemo<AppNav>(() => {
    const groups: NavGroup[] = APP_NAV.map((g) => ({
      section: t(`navSection.${g.sectionKey}`),
      items: g.items.map((it) => ({ ...it, label: t(`nav.${it.key}`) })),
    }));
    const navShortcuts: ShortcutDef[] = groups.flatMap((g) =>
      g.items
        .filter((it) => it.gKey)
        .map((it) => ({
          keys: `g ${it.gKey}`,
          label: t("commandPalette.goTo", { label: it.label }),
          group: "Navigation" as const,
        })),
    );
    // Keep the kit's group order: the app's rows replace its Navigation rows in place.
    const firstNav = SHORTCUTS.findIndex((s) => s.group === "Navigation");
    const rest = SHORTCUTS.filter((s) => s.group !== "Navigation");
    const at = firstNav === -1 ? rest.length : firstNav;
    return { groups, shortcuts: [...rest.slice(0, at), ...navShortcuts, ...rest.slice(at)] };
  }, [t]);
}
