"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** The query string that opens Files changed at `file:line`, keeping every other parameter. */
export function focusSearch(current: URLSearchParams, file: string, line: number): string {
  const sp = new URLSearchParams(current.toString());
  sp.set("tab", "diff");
  sp.set("file", file);
  sp.set("line", String(line));
  return sp.toString();
}

/** The query string for a manual tab change: sets `tab` and drops the jump target. */
export function tabSearch(current: URLSearchParams, tab: string): string {
  const sp = new URLSearchParams(current.toString());
  sp.set("tab", tab);
  sp.delete("file");
  sp.delete("line");
  return sp.toString();
}

const withQuery = (base: string, query: string) => (query ? `${base}?${query}` : base);

/** URL state of the PR detail page: the tab, plain parameters, and the Review focus jump. */
export function usePrDetailNav(base: string) {
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") ?? "overview";

  const setTab = (next: string) => router.replace(withQuery(base, tabSearch(search, next)));

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(withQuery(base, sp.toString()));
  };

  // push, not replace: Back returns to the Overview the click came from.
  const openFocus = (file: string, line: number) =>
    router.push(withQuery(base, focusSearch(search, file, line)));

  return { tab, setTab, setParam, openFocus };
}
