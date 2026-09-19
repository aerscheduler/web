import type { QuickBooksBooksOwnership, QuickBooksLineCategory, QuickBooksSetupStep } from "@/features/queries";

/**
 * The question no API can answer: is this revenue already in their books some other
 * way? Options are NAMED on purpose. Asked abstractly ("any other integrations?") an
 * owner confidently says no while a bank-feed rule has been booking their Stripe
 * deposits for years. Order matters: the safe, common answers first.
 */
export const OWNERSHIP_OPTIONS: Array<{
  value: QuickBooksBooksOwnership;
  label: string;
  /** The answer in a few words, for the Settings row. */
  short: string;
  hint: string;
  /** "refuse" keeps sync off; "forward" allows today onward only. */
  effect: "allow" | "forward" | "refuse";
}> = [
  {
    value: "nothing_yet",
    label: "Nothing yet. AerScheduler will be the only thing recording flight revenue.",
    short: "Nothing else",
    hint: "You can choose how far back to start, and see exactly what would post first.",
    effect: "allow",
  },
  {
    value: "bank_feed",
    label: "A bank feed rule books our Stripe deposits as income.",
    short: "A bank feed rule",
    hint: "AerScheduler can take over from today onward. Turn that bank rule off, or you will count the same money twice.",
    effect: "forward",
  },
  {
    value: "manual",
    label: "Our bookkeeper enters it by hand.",
    short: "Our bookkeeper, by hand",
    hint: "AerScheduler can take over from today onward. Let your bookkeeper know to stop entering flight revenue.",
    effect: "forward",
  },
  {
    value: "stripe_connector",
    label: "Stripe's own QuickBooks app, or a tool like Synder or PayTraQer.",
    short: "Stripe's QuickBooks app or similar",
    hint: "Sync stays off, or every payment would be recorded twice. Turn that app off first if you want AerScheduler to take over.",
    effect: "refuse",
  },
  {
    value: "other_app",
    label: "Another flight-school or accounting tool.",
    short: "Another tool",
    hint: "Sync stays off so the same revenue is not recorded twice. Turn the other tool off first.",
    effect: "refuse",
  },
  {
    value: "unsure",
    label: "I'm not sure.",
    short: "Not sure",
    hint: "Sync stays off until you know.",
    effect: "refuse",
  },
];

export const CATEGORY_LABELS: Record<QuickBooksLineCategory, string> = {
  rental: "Aircraft & simulator rental",
  instruction: "Instruction and ground school",
  fees: "Fees (late, cancellation, card, service)",
  membership: "Membership dues & join fees",
  other: "Everything else (parts, supplies, custom lines)",
};

export const CATEGORY_ORDER: QuickBooksLineCategory[] = ["rental", "instruction", "fees", "membership", "other"];

export const STEP_LABELS: Record<QuickBooksSetupStep, string> = {
  confirm_company: "Confirm the company",
  books_ownership: "What else records flight revenue",
  start_date: "Start date",
  income_item: "Income item",
  deposit_account: "Where card payments land",
  desk_payments: "Front-desk payments",
  enable: "Turn on",
};

export const BLOCK_REASON_LABELS: Record<string, string> = {
  refunded: "Partially refunded",
  has_tax: "Carries sales tax",
  zero_total: "Nothing collected",
  amount_mismatch: "Lines don't add up",
  negative_line: "Line with a negative amount",
  no_party: "No member or guest",
  no_email: "No email address",
  bad_email: "Unusable email address",
  customer_inactive: "Customer inactive in QuickBooks",
  customer_ambiguous: "Several QuickBooks customers match",
  customer_name_conflict: "Name already used in QuickBooks",
  qbo_rejected: "QuickBooks rejected it",
  qbo_total_mismatch: "QuickBooks changed the total",
  duplicate_doc_number: "Receipt number already used in QuickBooks",
  retries_exhausted: "Kept failing",
  remove_failed: "Could not be removed",
  payment_unverified: "Couldn't confirm how it was paid",
  repaid_after_partial_refund: "Refunded, then paid again",
  dispute_won_closed: "Dispute won after books closed",
};

/** Holds only a person can end (Handled); Retry would just hide them. Mirrors the server. */
export const PERSON_ONLY_REASONS = ["repaid_after_partial_refund", "dispute_won_closed"];

export function blockReasonLabel(reason: string | null | undefined): string {
  return (reason && BLOCK_REASON_LABELS[reason]) || "Needs attention";
}

/** YYYY-MM-DD, one day later. Date keys are calendar days, never instants. */
export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Mar 4, 2026" for a YYYY-MM-DD key, without a timezone shift. */
export function formatDateKey(key: string | null | undefined): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The order the questions are asked in. The server enforces the same list (policy.ts). */
export const SETUP_ORDER: QuickBooksSetupStep[] = [
  "confirm_company",
  "books_ownership",
  "start_date",
  "income_item",
  "deposit_account",
  "desk_payments",
  "enable",
];

/** Each step asked as the question it is, with the one line of why. */
export const STEP_QUESTIONS: Record<QuickBooksSetupStep, { title: string; description: string }> = {
  confirm_company: {
    title: "Is this the right company?",
    description:
      "Intuit lets you pick any company your login can see. Check it's the one your flight revenue belongs in.",
  },
  books_ownership: {
    title: "What already records your flight revenue?",
    description: "If something else already puts it in QuickBooks, every payment would be counted twice.",
  },
  start_date: {
    title: "Which invoices should go to QuickBooks?",
    description: "Invoices paid on or after this date are posted to QuickBooks. Earlier ones never are.",
  },
  income_item: {
    title: "Which QuickBooks item should invoices use?",
    description:
      "The QuickBooks product or service each line uses. Its income account is what shows on your Profit and Loss.",
  },
  deposit_account: {
    title: "Where do card payments land?",
    description: "Card and ACH payments collected through Stripe are recorded in this account.",
  },
  desk_payments: {
    title: "Post front-desk payments too?",
    description: "Cash and check payments marked paid by hand, here or in your Stripe dashboard.",
  },
  enable: {
    title: "Turn on sync",
    description: "Paid invoices post in the background, oldest first. You can pause any time.",
  },
};

/** The QuickBooks page's sections, in the Settings rail's shape. `?tab=` keys; don't rename them. */
export const QBO_TABS = ["overview", "attention", "activity", "settings", "connection"] as const;
export type QuickBooksTab = (typeof QBO_TABS)[number];
