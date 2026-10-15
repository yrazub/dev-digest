/* repo-intel-resync.ts — the completion rule of a resync, shared by every screen that starts
   one (the Conventions index line, the Blast radius note). Pure, and a file of its own: the
   hooks module is replaced wholesale by component tests. */

/** The part of the index state the rule reads. */
export interface ResyncState {
  updatedAt: string;
}

/** True when a wait is running (`waitingFrom` is the index row's `updatedAt` captured when Resync
    was pressed) and the polled state's `updatedAt` differs from it — every index write sets it. */
export function resyncSettled(
  waitingFrom: string | null,
  state: ResyncState | null | undefined,
): boolean {
  if (waitingFrom === null || !state) return false;
  return state.updatedAt !== waitingFrom;
}
