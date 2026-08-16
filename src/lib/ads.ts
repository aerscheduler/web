/**
 * Ad-platform conversion reporting for the console.
 *
 * ## Why this exists separately from `analytics.ts`
 *
 * PostHog answers "what did people do". This answers a narrower and more expensive
 * question: "which ad click should Google keep buying". They are deliberately not the
 * same module, because the event lists are not the same shape. PostHog wants every step
 * of the funnel; the ad platforms want the three or four moments worth bidding on, and
 * one extra conversion here teaches Google to buy the wrong visitor.
 *
 * ## Why the console at all, when the marketing site already has a tag
 *
 * The marketing site can only ever report the click. `aerscheduler.com` fires
 * `signup_started`, `demo_opened` and `contact_submitted`; every event after that
 * happens on `app.aerscheduler.com`, which had no tag at all. That left both of the
 * PRIMARY conversions in the Ads account, `signup_completed` and `subscribed`,
 * permanently at zero, so smart bidding had nothing to optimise toward and would have
 * fallen back to chasing signup-button clicks.
 *
 * ## Attribution across the domain hop
 *
 * gtag writes its `_gcl_*` linker cookies on the registrable domain
 * (`.aerscheduler.com`), so a `gclid` captured when the visitor landed on the marketing
 * site is still readable here. That is what lets a conversion fired on the console be
 * joined back to the ad click, and it is why nothing needs to be threaded through the
 * URL. `lib/attribution.ts` keeps its own first-party copy for our own reporting; the
 * two are independent on purpose, because ours has to survive an ad blocker eating this
 * one.
 *
 * ## Consent
 *
 * Same `aer_consent` cookie as PostHog, same rule: nothing is downloaded until consent
 * exists, so declining means no Google code ever runs rather than "runs and stays
 * quiet". `startAds()` is called from the same places as `startAnalytics()`.
 *
 * Every function here degrades to a no-op when the ids are unset, so the console works
 * unchanged on a laptop, in preview builds, and for anyone who declined the banner.
 */

import { hasConsent } from "./analytics";

/**
 * Ad platform ids, injected at build time.
 *
 * These are `VITE_`-prefixed, so they are baked into the bundle and a change needs a
 * redeploy, not just a Vercel env edit. They are public identifiers, not secrets: the
 * conversion id is visible in the page source of every site that runs Google Ads.
 */
const GOOGLE_ADS_ID = import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

/**
 * The conversions this surface can report, in funnel order.
 *
 * Deliberately short, and deliberately the tail of the funnel: the head
 * (`signup_started`, `demo_opened`, `contact_submitted`) belongs to the marketing site
 * and must not be duplicated here, or one visitor counts twice.
 */
export type AdConversion = "signup_completed" | "activated" | "subscribed";

/**
 * Google identifies a conversion action as `AW-123456789/AbC-D_efGh`, so each one needs
 * its own label from the Ads UI. Unset label → that conversion silently does nothing,
 * which is the correct behaviour for a half-configured account.
 */
const GOOGLE_LABELS: Record<AdConversion, string | undefined> = {
  signup_completed: import.meta.env.VITE_GADS_LABEL_SIGNUP_COMPLETED as string | undefined,
  activated: import.meta.env.VITE_GADS_LABEL_ACTIVATED as string | undefined,
  subscribed: import.meta.env.VITE_GADS_LABEL_SUBSCRIBED as string | undefined,
};

/** Meta's standard event names, which its optimiser understands natively. */
const META_EVENTS: Record<AdConversion, string> = {
  signup_completed: "CompleteRegistration",
  activated: "Lead",
  subscribed: "Subscribe",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    fbq?: ((...args: any[]) => void) & { queue?: any[]; loaded?: boolean; version?: string };
    _fbq?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let started = false;

/** Load the consented ad tags. Idempotent, so it is safe to call on every mount. */
export function startAds(): void {
  if (started || typeof window === "undefined" || !hasConsent()) return;
  started = true;
  loadGoogle();
  loadMeta();
}

/**
 * Forget that anything was loaded.
 *
 * Note this cannot unring the bell: once gtag is in the page it stays there until the
 * next navigation. It exists so that a decline mid-session stops us *sending* anything
 * further, and so a later grant re-runs the loaders cleanly.
 */
export function stopAds(): void {
  started = false;
}

function loadGoogle(): void {
  if (!GOOGLE_ADS_ID || window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  // Must be a real `arguments`-forwarding function, not an arrow taking a rest
  // parameter: gtag reads `arguments` by identity and the spread form breaks it.
  function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  }
  window.gtag = gtag as unknown as (...args: unknown[]) => void;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  // `conversion_linker` is what reads the `_gcl_*` cookie the marketing site wrote.
  // Without it a conversion fired here is unattributed, which is the whole point of
  // this module.
  window.gtag("config", GOOGLE_ADS_ID, { conversion_linker: true });
}

function loadMeta(): void {
  if (!META_PIXEL_ID || window.fbq) return;

  /* eslint-disable @typescript-eslint/no-explicit-any, prefer-rest-params */
  const n: any = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  window.fbq = n;
  window._fbq = n;
  /* eslint-enable @typescript-eslint/no-explicit-any, prefer-rest-params */

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  // Called through the local reference rather than `window.fbq`, which TypeScript still
  // sees as optional even immediately after the assignment above.
  n("init", META_PIXEL_ID);
}

/**
 * Conversions that must only ever be counted once per browser.
 *
 * Google's conversion actions are all set to count "One" per click, so a duplicate is
 * mostly harmless there. This guard is for the cases the Ads UI cannot see: a Stripe
 * success redirect the user reloads, a signup form resubmitted after a network blip, or
 * an onboarding step revisited. Cheap insurance against inflating the one number the
 * bidding algorithm is chasing.
 */
const ONCE_KEY = "aer_ads_fired";

function alreadyFired(name: AdConversion): boolean {
  try {
    const raw = window.localStorage.getItem(ONCE_KEY);
    const fired = raw ? (JSON.parse(raw) as string[]) : [];
    if (fired.includes(name)) return true;
    window.localStorage.setItem(ONCE_KEY, JSON.stringify([...fired, name]));
    return false;
  } catch {
    // Private mode, storage disabled, corrupt JSON. Reporting the conversion twice is
    // strictly better than never reporting it, so fail open.
    return false;
  }
}

/**
 * Report one conversion to every configured ad platform.
 *
 * `value` is in whole currency units and only meaningful for `subscribed`, which is the
 * only action carrying a value in the Ads account. Everything here is best-effort and
 * must never throw into a click handler: a school losing its signup because an ad
 * blocker ate gtag would be a far worse bug than a missing conversion.
 */
export function trackAdConversion(
  name: AdConversion,
  opts?: { value?: number; currency?: string; transactionId?: string }
): void {
  if (typeof window === "undefined" || !hasConsent()) return;
  // Late consent, or a hard reload straight onto the Stripe success redirect: the tags
  // may not be up yet.
  startAds();
  if (alreadyFired(name)) return;

  try {
    const label = GOOGLE_LABELS[name];
    if (window.gtag && GOOGLE_ADS_ID && label) {
      window.gtag("event", "conversion", {
        send_to: `${GOOGLE_ADS_ID}/${label}`,
        ...(opts?.value !== undefined
          ? { value: opts.value, currency: opts.currency ?? "USD" }
          : {}),
        ...(opts?.transactionId ? { transaction_id: opts.transactionId } : {}),
      });
    }

    if (window.fbq && META_PIXEL_ID) {
      window.fbq(
        "track",
        META_EVENTS[name],
        opts?.value !== undefined
          ? { value: opts.value, currency: opts.currency ?? "USD" }
          : undefined
      );
    }
  } catch {
    // Blocked, offline, or a platform script that changed shape under us. None of them
    // are the console's problem.
  }
}
