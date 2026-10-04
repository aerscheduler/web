import type { DeskPaymentMethod, Invoice } from "@/types/api";

/**
 * How a payment recorded at the desk came in (Murray spec section 14), in the words the console
 * uses. Mirrors server/src/utils/paymentMethods.ts, which holds the rules.
 */
export const DESK_PAYMENT_METHODS: { value: DeskPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "card_in_person", label: "Card in person" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export const CHECK_NUMBER_MAX = 30;
export const PAYMENT_NOTE_MAX = 300;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The calendar day of a `@db.Date` the API sends as midnight UTC ("2026-10-03T00:00:00.000Z").
 * Read as text, never through `new Date`: in Denver that instant is still October 2nd.
 */
export function dateKeyOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/** "Oct 3" (this year) or "Oct 3, 2025", from a calendar day. */
export function formatDateKey(key: string, now = new Date()): string {
  const [y, m, d] = key.split("-").map(Number);
  const label = `${MONTHS[m - 1]} ${d}`;
  return y === now.getFullYear() ? label : `${label}, ${y}`;
}

/** "Paid by check #1234", "Paid in cash"; null when no method was recorded (a card payment). */
export function paidByWords(inv: Pick<Invoice, "paymentMethod" | "checkNumber">): string | null {
  switch (inv.paymentMethod) {
    case "cash":
      return "Paid in cash";
    case "check":
      return inv.checkNumber ? `Paid by check #${inv.checkNumber}` : "Paid by check";
    case "card_in_person":
      return "Paid by card in person";
    case "bank_transfer":
      return "Paid by bank transfer";
    case "other":
      return "Paid";
    case "manual":
      return "Marked paid in Stripe";
    default:
      return null;
  }
}

/**
 * The one line a bill says about its payment: "Paid by check #1234 on Oct 3". The day is the day
 * the desk said the money arrived; a card payment (no method) says when it was paid, in the
 * zone given. Null on an unpaid bill.
 */
export function paymentSummary(
  inv: Pick<Invoice, "paidAt" | "paymentMethod" | "checkNumber" | "paymentReceivedOn">,
  formatInstant: (iso: string) => string,
  now = new Date()
): string | null {
  if (!inv.paidAt) return null;
  const received = dateKeyOf(inv.paymentReceivedOn);
  const when = received ? formatDateKey(received, now) : formatInstant(inv.paidAt);
  return `${paidByWords(inv) ?? "Paid"} on ${when}`;
}

/**
 * Past due: unpaid, not voided, and past a due date it actually has. The SAME rule as the
 * server's `overdue` filter and the revenue report's Overdue (services/payment.ts IS_OVERDUE),
 * so the badge, the filter and Home's count can never disagree. No due date is never past due.
 */
export function isPastDue(inv: Pick<Invoice, "paidAt" | "voidedAt" | "dueAt">, now = new Date()): boolean {
  return !inv.paidAt && !inv.voidedAt && !!inv.dueAt && new Date(inv.dueAt).getTime() < now.getTime();
}

/** Today in a zone as YYYY-MM-DD: the default, and the latest allowed, "date received". */
export function todayKeyIn(zone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
