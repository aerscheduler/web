/**
 * Where a new organization came from.
 *
 * The marketing site links to `/signup?src=quickbooks` (plus whatever `utm_*` the ad
 * platform appends). We capture that on the first page load, keep it, and hand it to
 * the server once — when the org is created. From then on the checklist can lead with
 * the thing they were already reading about, so setup continues the conversation the
 * website started rather than restarting it.
 *
 * Storage is localStorage rather than sessionStorage on purpose. The gap between
 * landing and creating an org is not a single tab visit: people sign up, verify an
 * email in a new tab, come back tomorrow. sessionStorage loses all of that; a
 * timestamped localStorage entry with a window survives it.
 *
 * Capture must happen BEFORE any OAuth hop. Google/Apple sign-in leaves our origin
 * and comes back to a bare URL, so a query string that was only read at org-creation
 * time would already be gone — see `captureAttribution` being called at app boot.
 */

const KEY = "aer:attribution";

/** How long a landing still counts as the reason they signed up. */
const WINDOW_DAYS = 30;

/** Ad-platform params worth keeping alongside our own `src`. */
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = {
  /** Our own campaign slug — the one the checklist orders itself by. */
  src?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Where they were immediately before, when the browser tells us. */
  referrer?: string;
  /** ISO timestamp of the landing, used to expire the record. */
  at: string;
};

/** Query strings are attacker-controlled and end up in a DB column; keep them small
 *  and boring. */
function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 64);
  return /^[\w .:/-]+$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Read campaign params off the current URL and remember them.
 *
 * First landing wins: someone who arrives from the QuickBooks page and later clicks a
 * generic link should still get the QuickBooks checklist. Only an expired record is
 * overwritten.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const src = clean(params.get("src") ?? params.get("ref"));
    const utms = Object.fromEntries(
      UTM_KEYS.map((k) => [k, clean(params.get(k))]).filter(([, v]) => v)
    );

    if (!src && Object.keys(utms).length === 0) return;
    if (readAttribution()) return; // first touch wins

    const record: Attribution = {
      ...(src ? { src } : {}),
      ...utms,
      ...(document.referrer ? { referrer: document.referrer.slice(0, 200) } : {}),
      at: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Private browsing, disabled storage — attribution is never worth an error.
  }
}

/** The stored landing, or null when there isn't one or it has aged out. */
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.at) return null;
    const age = Date.now() - new Date(parsed.at).getTime();
    if (!Number.isFinite(age) || age > WINDOW_DAYS * 86_400_000) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The single slug sent to the server as the org's `source`.
 *
 * Our own `src` wins, then the campaign, then the ad network — most specific first,
 * because the checklist keys off it and "google" tells it nothing.
 */
export function attributionSource(): string | undefined {
  const a = readAttribution();
  return a?.src ?? a?.utm_campaign ?? a?.utm_source;
}

/** Forget the landing once it has been attached to an org. */
export function clearAttribution(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* see captureAttribution */
  }
}
