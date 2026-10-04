/**
 * Where "Back" goes on a record page: the page you actually came from.
 *
 * Record pages are reached from everywhere (a list, another record, search, a notification),
 * so a back link hard-coded to the record's own list sent somebody who came from an aircraft's
 * page to the People list (Tony, 2026-10-01). This keeps a small trail of the console's own
 * pages, keyed by the router's history position (`__TSR_index` in `history.state`), so a back
 * control can tell whether the entry behind it is a page of this app, and what it was called.
 *
 * With nothing behind it (a link opened in a new tab, a notification, a bookmark: record pages
 * are routinely the FIRST page of a session) `DetailBack` falls back to its list, which is why
 * it still takes one.
 *
 * Per tab (sessionStorage), like the history it mirrors. Storage that throws or is empty only
 * means every back control uses its fallback.
 */

import type { AnyRouter } from "@tanstack/react-router";
import { getToken } from "@/lib/api";

const KEY = "aer.back-trail";
const SUFFIX = / · AerScheduler$/;

/**
 * One history entry the console showed. `from` is the key of the entry it was reached from,
 * which is what "back" means; `index` is its position, which is how far `history.go` must step.
 */
export type TrailEntry = { href: string; pathname: string; title: string | null; index: number; from: string | null };

/** Pages that are not the console: going "back" to them from a record makes no sense. */
const OUTSIDE = [/^\/$/, /^\/login/, /^\/signup/, /^\/forgot-password/, /^\/reset-password/, /^\/verify-email/, /^\/join/, /^\/onboarding/, /^\/demo/, /^\/book/, /^\/payment-method-saved/];

function read(): Record<string, TrailEntry> {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}") as Record<string, TrailEntry>;
  } catch {
    return {};
  }
}

function write(trail: Record<string, TrailEntry>) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    // Private windows and blocked storage: back controls fall back to their lists.
  }
}

/** "N172TS · AerScheduler" → "N172TS"; null when the page has no name of its own yet. */
function pageTitle(): string | null {
  const t = document.title.replace(SUFFIX, "").trim();
  return t && t !== "AerScheduler" ? t : null;
}

type Position = { key: string; index: number; pathname: string; href: string };

let router: AnyRouter | null = null;
/** The entry showing before the current navigation, in THIS document only. */
let last: { key: string; index: number } | null = null;

function position(): Position | null {
  const loc = router?.history.location;
  const state = loc?.state as { __TSR_key?: unknown; __TSR_index?: unknown } | undefined;
  if (!loc || typeof state?.__TSR_key !== "string" || typeof state.__TSR_index !== "number") return null;
  return { key: state.__TSR_key, index: state.__TSR_index, pathname: loc.pathname, href: loc.href };
}

/**
 * A navigation happened (push, replace, or a step through history). Fires before the new page
 * renders, so its title is not known yet: the title observer fills it in.
 *
 * Every push and replace mints a new key, so an entry already on the trail is a step back or
 * forward (or a reload), and keeps where it came from. A new entry came from the page showing
 * before it; a replace (a tab, a filter) inherits that page's own origin. The first page of a
 * document came from nothing this tab can vouch for: a full load (an org switch, a return from
 * Stripe) restarts the router's index at 0, so an older entry at a lower index may be another
 * document's page.
 */
function onNavigate() {
  const here = position();
  if (!here) return;
  const trail = read();
  if (OUTSIDE.some((re) => re.test(here.pathname))) {
    delete trail[here.key];
  } else if (trail[here.key]) {
    trail[here.key] = { ...trail[here.key], href: here.href, pathname: here.pathname };
  } else {
    const prev = last ? trail[last.key] : undefined;
    let from: string | null = null;
    if (last && here.index === last.index) from = prev?.from ?? null;
    else if (last && here.index > last.index) from = last.key;
    trail[here.key] = {
      href: here.href,
      pathname: here.pathname,
      // A same-page push (a filter) keeps the page's name; a new page gets its own shortly.
      title: prev && prev.pathname === here.pathname ? prev.title : null,
      index: here.index,
      from,
    };
  }
  write(trail);
  last = { key: here.key, index: here.index };
}

/** The page named itself (the route's label, then the record's name once it loads). */
function onTitle() {
  const here = position();
  if (!here) return;
  const trail = read();
  const entry = trail[here.key];
  if (!entry || entry.pathname !== here.pathname) return;
  entry.title = pageTitle();
  write(trail);
}

/**
 * Start recording. Called once, where the router is made. Signing out forgets the trail, so
 * the next person at this browser is never offered a "‹ Jane Doe" from the last session.
 */
export function startBackTrail(r: AnyRouter) {
  router = r;
  last = null;
  r.history.subscribe(onNavigate);
  const title = document.querySelector("title");
  if (title) new MutationObserver(onTitle).observe(title, { childList: true, characterData: true, subtree: true });
  window.addEventListener("aer:token-change", () => {
    if (getToken()) return;
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      // Nothing stored, nothing to forget.
    }
  });
  onNavigate();
  onTitle();
}

/**
 * The console page this one was reached from, and how many steps back it is. Entries for the
 * SAME page (a filter that pushed a history entry) are skipped: "back" from a record means the
 * page before it, not its own previous filter. Null when there is none.
 */
export function previousPage(): { entry: TrailEntry; steps: number } | null {
  const here = position();
  if (!here) return null;
  const trail = read();
  let entry = trail[trail[here.key]?.from ?? ""];
  // Each step lands at a lower index, so this ends; the cap is for a hand-edited store.
  for (let hops = 0; entry && entry.pathname === here.pathname && hops < 50; hops++) entry = trail[entry.from ?? ""];
  if (entry?.pathname === here.pathname) return null;
  if (!entry || entry.index >= here.index) return null;
  return { entry, steps: here.index - entry.index };
}
