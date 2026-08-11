/**
 * Intent + acquisition helpers for first-run setup.
 *
 * Marketing may hand us `?src=` or only a landing path. The operator may then tell us
 * what they want working first. This module turns those signals into the single
 * checklist `source` slug, and decides when to ask "how did you hear about us".
 */

import type { Attribution } from "@/lib/attribution";

/** Setup-track slugs. Keep in step with `onboarding-tracks.ts` and website `CampaignSource`. */
export type SetupIntent =
  | "scheduling"
  | "maintenance"
  | "billing"
  | "quickbooks"
  | "clubs"
  | "training"
  | "reports";

export const SETUP_INTENTS: {
  id: SetupIntent;
  label: string;
  blurb: string;
}[] = [
  {
    id: "scheduling",
    label: "Schedule aircraft",
    blurb: "Get a bookable board up first.",
  },
  {
    id: "maintenance",
    label: "Track maintenance",
    blurb: "Due dates, reminders, and squawks.",
  },
  {
    id: "billing",
    label: "Bill and get paid",
    blurb: "Invoices, cards, and Stripe Connect.",
  },
  {
    id: "training",
    label: "Training and curriculum",
    blurb: "Courses, enrollments, and records.",
  },
  {
    id: "reports",
    label: "See the operation",
    blurb: "Utilization and revenue once flights land.",
  },
];

/** Shown only when machine attribution is weak. */
export const HEARD_FROM_OPTIONS: {
  id: string;
  label: string;
  /** Free-text follow-up label, when we want detail. */
  detailLabel?: string;
}[] = [
  { id: "google", label: "Google search" },
  { id: "friend", label: "Friend or another school", detailLabel: "Who should we thank?" },
  { id: "social", label: "Facebook or Instagram" },
  { id: "forum", label: "Aviation forum or Facebook group" },
  {
    id: "switching",
    label: "Switching from another product",
    detailLabel: "Which one?",
  },
  { id: "other", label: "Other", detailLabel: "Anything we should know?" },
];

const LANDING_RULES: { match: RegExp; source: SetupIntent }[] = [
  { match: /myfbo|maintenance|squawk|100-hour|annual/i, source: "maintenance" },
  { match: /quickbooks/i, source: "quickbooks" },
  { match: /split-billing|billing|invoice|membership|dues/i, source: "billing" },
  { match: /training|curriculum|syllabus|part-61|part-141|endorsement/i, source: "training" },
  { match: /report|utilization|revenue/i, source: "reports" },
  { match: /flying-club|club/i, source: "clubs" },
  { match: /schedul|self-booking|overnight|multi-day/i, source: "scheduling" },
];

/**
 * Infer a checklist track from the first marketing page they saw.
 *
 * Explicit `?src=` still wins at a higher layer. This only fills the gap when the
 * cookie has a landing path but no campaign slug (organic Google → content page).
 */
export function sourceFromLandingPath(landingPath: string | null | undefined): SetupIntent | undefined {
  if (!landingPath) return undefined;
  const path = landingPath.split("?")[0] ?? landingPath;
  for (const rule of LANDING_RULES) {
    if (rule.match.test(path)) return rule.source;
  }
  return undefined;
}

const KNOWN = new Set(SETUP_INTENTS.map((i) => i.id));
// quickbooks and clubs are tracks but not on the intent picker (picker stays short).
KNOWN.add("quickbooks");
KNOWN.add("clubs");

export function isSetupIntent(value: string | null | undefined): value is SetupIntent {
  return !!value && KNOWN.has(value as SetupIntent);
}

/**
 * The slug written to `OrganizationOnboarding.source`.
 *
 * Precedence: what they picked in the wizard → explicit `src` → landing path → utm.
 */
export function resolveSetupSource(args: {
  intent?: string | null;
  src?: string | null;
  landingPath?: string | null;
  utmCampaign?: string | null;
  utmSource?: string | null;
}): string | undefined {
  if (isSetupIntent(args.intent)) return args.intent;
  if (isSetupIntent(args.src)) return args.src;
  if (args.src?.trim()) return args.src.trim().toLowerCase().slice(0, 64);
  const fromLanding = sourceFromLandingPath(args.landingPath);
  if (fromLanding) return fromLanding;
  const campaign = args.utmCampaign?.trim().toLowerCase();
  if (campaign) return campaign.slice(0, 64);
  const utm = args.utmSource?.trim().toLowerCase();
  if (utm) return utm.slice(0, 64);
  return undefined;
}

/** Preselect on the intent picker from whatever attribution we already have. */
export function inferredIntent(a: Attribution | null): SetupIntent | null {
  const resolved = resolveSetupSource({
    src: a?.src,
    landingPath: a?.landingPath,
    utmCampaign: a?.utm_campaign,
    utmSource: a?.utm_source,
  });
  if (resolved === "quickbooks") return "billing";
  if (resolved === "clubs") return "scheduling";
  return isSetupIntent(resolved) ? resolved : null;
}

/**
 * True when we do not already know how they found us well enough to skip the question.
 *
 * Paid clicks and a clear external referrer (Google, another site) are enough.
 * Direct / empty / only our own marketing path still deserves a human answer.
 */
export function attributionIsWeak(a: Attribution | null): boolean {
  if (!a) return true;
  if (a.gclid || a.fbclid) return false;
  const medium = a.utm_medium?.toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "email") return false;
  if (a.utm_source || a.utm_campaign) return false;
  if (a.referrer) {
    try {
      const host = new URL(a.referrer).hostname.replace(/^www\./, "");
      if (host && !host.endsWith("aerscheduler.com")) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function shouldAskHeardFrom(a: Attribution | null): boolean {
  return attributionIsWeak(a);
}
