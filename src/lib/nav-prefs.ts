import { useSyncExternalStore } from "react";

/**
 * Per-user, per-org nav customisation: the order the org links sit in, the pages
 * they've pinned, and where they've recently been.
 *
 * A tiny external store rather than context because the two halves live at
 * opposite ends of the tree — the shell records every navigation, the rail
 * renders it — and threading a provider between them buys nothing. It is a
 * device-local preference on purpose: the rail should feel the same the instant
 * the app paints, with no round-trip and no spinner.
 */

export type NavPrefs = {
  /** Ordered paths for the org bucket. Empty = ship order (see `mergeNavOrder`). */
  order: string[];
  /** Pinned page paths, in the order the user arranged them. */
  pinned: string[];
  /** Recently visited page paths, most recent first. */
  recent: string[];
};

const STORAGE_KEY = "aer.nav.v1";
/** Kept a little longer than we display, so unpinning reveals real history. */
const RECENT_LIMIT = 12;

const EMPTY: NavPrefs = { order: [], pinned: [], recent: [] };

type Store = Record<string, NavPrefs>;

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

let store: Store = load();
const listeners = new Set<() => void>();

function persist(next: Store) {
  store = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — the session still works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Prefs are namespaced by org: a dispatcher at one school and an owner at
 * another want different rails, and roles (so the item set) differ too.
 */
const scopeKey = (orgId: number | null | undefined) => String(orgId ?? "none");

function read(orgId: number | null | undefined): NavPrefs {
  return store[scopeKey(orgId)] ?? EMPTY;
}

function write(orgId: number | null | undefined, patch: Partial<NavPrefs>) {
  const key = scopeKey(orgId);
  persist({ ...store, [key]: { ...read(orgId), ...patch } });
}

/** Subscribe to this org's prefs. The snapshot is stable between writes. */
export function useNavPrefs(orgId: number | null | undefined): NavPrefs {
  return useSyncExternalStore(
    subscribe,
    () => store[scopeKey(orgId)] ?? EMPTY,
    () => EMPTY
  );
}

export function setNavOrder(orgId: number | null | undefined, order: string[]) {
  write(orgId, { order });
}

export function resetNavOrder(orgId: number | null | undefined) {
  write(orgId, { order: [] });
}

export function setPinnedOrder(orgId: number | null | undefined, pinned: string[]) {
  write(orgId, { pinned });
}

export function togglePinned(orgId: number | null | undefined, path: string) {
  const { pinned } = read(orgId);
  write(orgId, {
    pinned: pinned.includes(path) ? pinned.filter((p) => p !== path) : [...pinned, path],
  });
}

/**
 * Record a visit. No-ops when the page is already the most recent one, so the
 * re-renders a navigation causes don't churn the store (and every tab sharing
 * this listener set).
 */
export function recordRecent(orgId: number | null | undefined, path: string) {
  const { recent } = read(orgId);
  if (recent[0] === path) return;
  write(orgId, { recent: [path, ...recent.filter((p) => p !== path)].slice(0, RECENT_LIMIT) });
}
