/**
 * Product analytics for the console.
 *
 * ## Why the console and not just the marketing site
 *
 * The marketing site can only see people leave. Everything worth optimising, meaning how far
 * into onboarding they get, which step they abandon, whether they ever add a plane or
 * take a booking, happens here. A campaign that produces signups who never activate is
 * a campaign losing money, and this is the only surface that can tell you that.
 *
 * ## The funnel
 *
 * Fired as named events, in this order:
 *
 *   signup_started → signup_completed → email_verified → onboarding_persona_selected
 *   → onboarding_step_completed (×n) → org_created → first_aircraft_added
 *   → first_reservation_created → subscribed
 *
 * The names are load-bearing: PostHog funnels are defined against these strings, so
 * renaming one silently empties a chart rather than erroring. Add steps, don't rename.
 *
 * ## Consent
 *
 * Shares the `aer_consent` cookie with the marketing site, on `.aerscheduler.com`, so
 * somebody who answered the banner there is never asked again here. Undecided is treated
 * as "no", so nothing loads until they accept, except for US visitors: the console
 * implies grant there (see `bootstrapAnalyticsConsent`) so dispatchers are not nagged
 * for product analytics. An explicit prior decline is always respected.
 */

import type { PostHog } from "posthog-js";
import { attributionChannel, readAttribution } from "./attribution";
import { getVisitorCountry, isConsentImpliedRegion } from "./geo";

/** Public, write-only ingest key, meant to ship in the client bundle. */
const POSTHOG_KEY =
  import.meta.env.VITE_POSTHOG_KEY ?? "phc_mT7orBRFhBnm56BRyhGgtSKjiQvRBZwCoMRSSSbBCDyt";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const CONSENT_COOKIE = "aer_consent";
const CONSENT_DAYS = 365;

export type ConsentState = "granted" | "denied" | "unset";

// ---------------------------------------------------------------- consent

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * True when the browser is sending Global Privacy Control, a legally recognised opt-out
 * request under the CPRA and the Colorado and Connecticut acts. Mirrors
 * website/src/lib/consent.ts: the two surfaces share the `aer_consent` cookie, so they
 * have to read an absent cookie the same way or a visitor gets a different answer on
 * either side of the same domain.
 */
export function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function readConsent(): ConsentState {
  const raw = readCookie(CONSENT_COOKIE);
  if (raw === "granted" || raw === "denied") return raw;
  // No stored decision: a GPC signal is one, and it is a "no".
  if (hasGlobalPrivacyControl()) return "denied";
  return "unset";
}

export function hasConsent(): boolean {
  return readConsent() === "granted";
}

export function setConsent(state: "granted" | "denied"): void {
  const host = window.location.hostname;
  const shared =
    host === "aerscheduler.com" || host.endsWith(".aerscheduler.com")
      ? ".aerscheduler.com"
      : undefined;

  document.cookie = [
    `${CONSENT_COOKIE}=${state}`,
    "path=/",
    `max-age=${CONSENT_DAYS * 86_400}`,
    "SameSite=Lax",
    ...(shared ? [`domain=${shared}`] : []),
    ...(window.location.protocol === "https:" ? ["Secure"] : []),
  ].join("; ");

  if (state === "granted") startAnalytics();
  else stopAnalytics();
}

/**
 * Resolve regional consent before the banner decides whether to show.
 *
 * - Already answered → start PostHog only if granted.
 * - US + unset → write `granted` (shared cookie) and start tracking.
 * - Anywhere else + unset → leave unset; the banner asks.
 *
 * Returns whether the cookie banner should still prompt.
 */
export function bootstrapAnalyticsConsent(): boolean {
  const existing = readConsent();
  if (existing === "granted") {
    startAnalytics();
    return false;
  }
  if (existing === "denied") return false;

  if (isConsentImpliedRegion(getVisitorCountry())) {
    setConsent("granted");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- lifecycle

/**
 * The loaded SDK, or null.
 *
 * PostHog is imported dynamically rather than at the top of the module for two reasons,
 * and the second is the important one:
 *
 * 1. It is ~80 kB gzipped, which is a lot to put in front of a dispatcher opening the
 *    schedule on airport wifi.
 * 2. Declining the banner should mean no third-party code runs, rather than "it runs and
 *    politely does nothing". A static import would ship and execute PostHog for everyone
 *    regardless of their answer.
 */
let ph: PostHog | null = null;
let started = false;

/**
 * Events fired between "consent granted" and "SDK finished loading".
 *
 * Only ever filled once consent exists, so declining still leaves no trace. Without it
 * the boot pageview, the first event of every session, would be lost to the import.
 */
let pending: Array<(client: PostHog) => void> = [];

/** Load PostHog, if consented. Idempotent. */
export function startAnalytics(): void {
  if (started || typeof window === "undefined" || !hasConsent() || !POSTHOG_KEY) return;
  started = true;

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // The same visitor was on aerscheduler.com a moment ago. Without this, PostHog
        // mints a fresh anonymous id here and the signup funnel breaks in half at the
        // exact step that matters. You could never join "read pricing" to "created an
        // org".
        cross_subdomain_cookie: true,
        capture_pageview: false, // sent by hand from the router subscription
        capture_pageleave: true,
        persistence: "cookie",
        autocapture: true,
        // This is a console people run their business in. Recording keystrokes in it
        // would capture student names, rates and addresses, so every input is masked.
        session_recording: { maskAllInputs: true },
      });

      const attribution = readAttribution();
      posthog.register({
        surface: "console",
        campaign: attribution?.utm_campaign ?? attribution?.src ?? null,
        channel: attributionChannel(),
      });

      ph = posthog;
      const queued = pending;
      pending = [];
      for (const run of queued) {
        try {
          run(posthog);
        } catch {
          /* one bad queued event must not drop the rest */
        }
      }
    })
    .catch(() => {
      // Offline, blocked by an ad blocker, CDN down. All normal; none of them are the
      // console's problem.
      started = false;
      pending = [];
    });
}

/** Queue or run, depending on whether the SDK has arrived yet. */
function withClient(run: (client: PostHog) => void): void {
  if (!started) return; // no consent: drop, never queue
  if (ph) {
    try {
      run(ph);
    } catch {
      // Analytics must never break the console.
    }
    return;
  }
  // Bounded: a burst while the chunk downloads is a handful of events, but a bug
  // upstream must not grow this without limit.
  if (pending.length < 50) pending.push(run);
}

function stopAnalytics(): void {
  pending = [];
  if (ph) {
    try {
      ph.opt_out_capturing();
      ph.reset();
    } catch {
      /* nothing here is worth an error */
    }
  }
  started = false;
}

// ---------------------------------------------------------------- events

type Props = Record<string, unknown>;

export function track(event: string, props?: Props): void {
  withClient((client) => client.capture(event, props));
}

export function trackPageview(path: string, search?: Record<string, unknown>): void {
  track("$pageview", { $current_url: window.location.href, path, ...describeFilters(search) });
}

// ---------------------------------------------------------------- filters

/**
 * Free-text keys whose VALUE must never leave the browser.
 *
 * Every filter in this console lives in the URL, which makes filter usage easy to
 * measure. It also means the search box does: somebody types a student's name or a tail
 * number to find them, and that lands in the query string. Sending it would put customer
 * names into a third-party analytics tool, so these keys report only that they were used.
 */
const OPAQUE_KEYS = new Set(["q", "search", "query", "name", "email"]);

/** Slug-ish values are enum-like and safe to keep. Anything else is somebody's data. */
const SAFE_VALUE = /^[\w,:-]{1,60}$/;

/**
 * What was filtered, in a shape worth charting.
 *
 * `filters` is the list of keys, which answers "which filters do people actually use"
 * and is the question worth asking first. Most facets turn out to be dead weight, and a
 * facet nobody touches is a column you can take off the page.
 *
 * `filter_values` keeps the chosen option where it is safe to, so "which STATUS do people
 * filter to" is answerable too. Ids collapse to `:id` for the same reason API paths do:
 * one row per kind of filter, not one per aircraft.
 */
function describeFilters(search?: Record<string, unknown>): Record<string, unknown> {
  if (!search || typeof search !== "object") return {};

  const keys: string[] = [];
  const values: Record<string, string> = {};

  for (const [key, raw] of Object.entries(search)) {
    if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && !raw.length)) {
      continue;
    }
    keys.push(key);

    if (OPAQUE_KEYS.has(key)) {
      values[key] = "<set>";
      continue;
    }
    const value = Array.isArray(raw) ? raw.map(String).join(",") : String(raw);
    values[key] = /^\d+$/.test(value) ? ":id" : SAFE_VALUE.test(value) ? value : "<other>";
  }

  if (!keys.length) return {};
  return { filters: keys.sort(), filter_values: values, filter_count: keys.length };
}

/**
 * Report a filter change as its own event.
 *
 * A pageview already carries the filter state, but pageviews are dominated by arriving on
 * a screen. This fires only when the filters change while staying on the same screen,
 * which is the actual act of filtering, and keeps "most-used filter" from being swamped
 * by everyone's default view.
 */
let lastFilterKey: string | null = null;

export function trackFilters(path: string, search?: Record<string, unknown>): void {
  const described = describeFilters(search);
  const signature = `${path}|${JSON.stringify(described.filter_values ?? {})}`;

  const samePage = lastFilterKey?.startsWith(`${path}|`);
  const changed = lastFilterKey !== null && lastFilterKey !== signature;
  lastFilterKey = signature;

  if (samePage && changed) track("filter_changed", { path, ...described });
}

// ---------------------------------------------------------------- dwell time

/**
 * How long people actually spend on each screen.
 *
 * Pageviews say where they went; this says where the work happens. In a console the
 * difference matters: somebody opens Settings for fifteen seconds and lives on the
 * schedule for forty minutes, and a pageview count makes those look comparable.
 *
 * Measured per path and reported on the way out, so the number describes the screen
 * rather than the session.
 */
let dwellPath: string | null = null;
let dwellStart = Date.now();

/** Close out the previous screen and start timing the new one. */
export function startDwell(path: string): void {
  const now = Date.now();
  if (dwellPath && dwellPath !== path) reportDwell(dwellPath, now - dwellStart);
  dwellPath = path;
  dwellStart = now;
}

function reportDwell(path: string, ms: number): void {
  const seconds = Math.round(ms / 1000);
  // Under a second is a redirect, not a visit. Over an hour is a tab left open on the
  // front desk overnight, which would wreck every average it touched.
  if (seconds < 1 || seconds > 3600) return;
  track("page_time", { path, seconds });
}

if (typeof window !== "undefined") {
  // The last screen of a session never gets a navigation, so it needs its own exit hook.
  // `pagehide` rather than `beforeunload`: it is the one that fires reliably on mobile
  // Safari, and it also covers the tab being frozen into bfcache.
  window.addEventListener("pagehide", () => {
    if (dwellPath) {
      reportDwell(dwellPath, Date.now() - dwellStart);
      dwellStart = Date.now(); // no double count if the tab is restored and hidden again
    }
  });
}

/**
 * Tie events to a real person and their school.
 *
 * The org group is what makes "which campaign produced schools that stuck around"
 * answerable in PostHog, because retention is a property of the school, not of whichever
 * instructor happened to log in.
 */
export function identify(
  userId: number | string,
  props?: Props,
  org?: { id: number | string; name?: string; createdAt?: string }
): void {
  withClient((client) => {
    client.identify(String(userId), props);
    if (org) {
      const attribution = readAttribution();
      client.group("organization", String(org.id), {
        name: org.name,
        created_at: org.createdAt,
        campaign: attribution?.utm_campaign ?? attribution?.src ?? null,
      });
    }
  });
}

/** Forget the person on sign-out, so a shared computer doesn't merge two people. */
export function resetIdentity(): void {
  withClient((client) => client.reset());
}
