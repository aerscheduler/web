/**
 * Where a new organization came from.
 *
 * The visitor's journey crosses two origins: they read `aerscheduler.com`, click a CTA,
 * and create the org here on `app.aerscheduler.com`. This module's job is to make sure
 * the campaign that paid for the click survives that crossing, plus the email
 * verification round trip and the OAuth hop, and is still attached when the org is
 * finally created, sometimes days later.
 *
 * ## Three sources, most trustworthy first
 *
 * 1. **The shared `aer_attr` cookie**, written by the marketing site on
 *    `.aerscheduler.com` (see `website/src/lib/attribution.ts`). This is the normal path
 *    and the only one that sees the true landing page, because the ad lands on the
 *    marketing site, not here.
 * 2. **This origin's own URL params**, for anyone linked straight to `/signup?...`. Some
 *    ads and most of our own emails do that.
 * 3. **localStorage**, the historical store, kept so a record captured before the cookie
 *    existed is still honoured.
 *
 * ## First touch wins
 *
 * Someone who arrives from a QuickBooks ad, leaves, and returns via a generic link should
 * still be credited to the ad, because that is the click that was paid for. Only an expired
 * record is overwritten.
 *
 * Capture must happen BEFORE any OAuth hop. Google/Apple sign-in leaves our origin and
 * comes back to a bare URL, so a query string only read at org-creation time would
 * already be gone. See `captureAttribution` being called at app boot in `main.tsx`.
 */

const KEY = "aer:attribution";

/** Written by the marketing site on `.aerscheduler.com`. Renaming breaks the handoff. */
const SHARED_COOKIE = "aer_attr";

/** How long a landing still counts as the reason they signed up. */
const WINDOW_DAYS = 30;

/** Ad-platform params worth keeping alongside our own `src`. */
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Click ids. Only ever present on a real ad click, so they also prove the visit was paid. */
const CLICK_ID_KEYS = ["gclid", "fbclid"] as const;

export type Attribution = {
  /** Our own campaign slug, the one the checklist orders itself by. */
  src?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  /** Where they were immediately before, when the browser tells us. */
  referrer?: string;
  /** The first page of ours they saw, usually a marketing page rather than one of these. */
  landingPath?: string;
  /** ISO timestamp of the landing, used to expire the record. */
  at: string;
};

/** Query strings are attacker-controlled and end up in a DB column; keep them small
 *  and boring. Click ids are long, hence 255 rather than the old 64. */
function clean(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 255);
  return /^[\w .:/@%+=-]+$/.test(trimmed) ? trimmed : undefined;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** A stored record, if it parses and hasn't aged out. */
function parse(raw: string | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.at) return null;
    const age = Date.now() - new Date(parsed.at).getTime();
    if (!Number.isFinite(age) || age > WINDOW_DAYS * 86_400_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read campaign params off the current URL and remember them.
 *
 * The shared cookie is consulted first and never overwritten from here: the marketing
 * site saw the real landing page and the original referrer, both of which are already
 * lost by the time anyone reaches this origin.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (readAttribution()) return; // first touch wins, from any source

    const params = new URLSearchParams(window.location.search);
    const src = clean(params.get("src") ?? params.get("ref"));
    const tagged = Object.fromEntries(
      [...UTM_KEYS, ...CLICK_ID_KEYS]
        .map((k) => [k, clean(params.get(k))])
        .filter(([, v]) => v)
    );

    if (!src && Object.keys(tagged).length === 0) return;

    const record: Attribution = {
      ...(src ? { src } : {}),
      ...tagged,
      ...(document.referrer ? { referrer: document.referrer.slice(0, 255) } : {}),
      landingPath: window.location.pathname.slice(0, 255),
      at: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Private browsing, disabled storage. Attribution is never worth an error.
  }
}

/** The stored landing, or null when there isn't one or it has aged out. */
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  // Cookie first: it is the only source that saw the marketing site.
  const shared = parse(readCookie(SHARED_COOKIE));
  if (shared) return shared;
  try {
    return parse(window.localStorage.getItem(KEY) ?? undefined);
  } catch {
    return null;
  }
}

import { resolveSetupSource } from "@/lib/onboarding-intent";

/**
 * The single slug sent to the server as the org's `source` when the wizard does not
 * override it with an intent pick.
 *
 * Explicit `src` wins, then landing-path inference (organic content pages), then utm.
 */
export function attributionSource(): string | undefined {
  const a = readAttribution();
  return resolveSetupSource({
    src: a?.src,
    landingPath: a?.landingPath,
    utmCampaign: a?.utm_campaign,
    utmSource: a?.utm_source,
  });
}

/**
 * The full record sent to the server and stored on the org, for the spend report.
 *
 * Separate from `attributionSource` because the two answer different questions: the
 * checklist wants one slug to order itself by, the weekly report wants the whole tuple
 * so it can tell a Google search campaign from a Meta retargeting ad.
 */
export function attributionPayload(): Record<string, string> | undefined {
  const a = readAttribution();
  if (!a) return undefined;

  const { at: _at, src: _src, ...rest } = a;
  const payload = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => typeof v === "string" && v.length > 0)
  ) as Record<string, string>;

  return Object.keys(payload).length ? payload : undefined;
}

/**
 * The channel this org came from: "paid-search", ", paid-social", ", organic", ", referral",
 * "direct", ", email". The campaign says which ad; this says which budget.
 */
export function attributionChannel(): string {
  const a = readAttribution();
  if (!a) return "direct";
  if (a.gclid) return "paid-search";
  if (a.fbclid) return "paid-social";

  const medium = a.utm_medium?.toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid") return "paid-search";
  if (medium === "paid-social" || medium === "paid_social") return "paid-social";
  if (medium === "email") return "email";

  if (a.referrer) {
    const host = a.referrer.replace(/^https?:\/\//, "").split("/")[0];
    return /google\.|bing\.|duckduckgo\.|yahoo\./.test(host) ? "organic" : "referral";
  }

  return a.src ? "referral" : "direct";
}

/** Forget the landing once it has been attached to an org. */
export function clearAttribution(): void {
  try {
    window.localStorage.removeItem(KEY);
    // The shared cookie is on the parent domain, so clear it with the same scope the
    // marketing site set it with. A host-only delete here would leave it in place and
    // the next org this person creates would inherit a stale campaign.
    document.cookie = `${SHARED_COOKIE}=; path=/; max-age=0; domain=.aerscheduler.com`;
    document.cookie = `${SHARED_COOKIE}=; path=/; max-age=0`;
  } catch {
    /* see captureAttribution */
  }
}
