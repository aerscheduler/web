import type { DuesInterval, Membership, MembershipPlan, MembershipStatus, MyMembership } from "@/types/api";
import { formatMoney } from "@/lib/utils";

/**
 * Membership vocabulary, in one place.
 *
 * Mirrors server/src/utils/membership.ts. Kept as a small local copy rather than fetched,
 * because these are labels on a screen rather than rules that price anything — the server
 * decides what a period costs, and a stale label here can only ever be cosmetic. Anything
 * that DECIDES stays on the server; see the note in `useBillMembershipDues` about why the
 * period is never chosen by the client.
 */

export const DUES_INTERVAL_LABEL: Record<DuesInterval, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annually",
};

export const DUES_INTERVAL_SUFFIX: Record<DuesInterval, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  annual: "/yr",
};

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  pending: "Not started",
  active: "Active",
  suspended: "Paused",
  cancelled: "Ended",
};

/** How a status reads as a badge. Only `active` is a positive claim. */
export const MEMBERSHIP_STATUS_VARIANT: Record<MembershipStatus, "default" | "secondary" | "outline" | "warning"> = {
  pending: "outline",
  active: "default",
  suspended: "warning",
  cancelled: "outline",
};

/** "$500 to join, then $95/mo" — the one line that describes a plan. */
export function planPriceLine(plan: Pick<MembershipPlan, "joinFeeCents" | "duesCents" | "duesInterval">): string {
  const join = plan.joinFeeCents ? `${formatMoney(plan.joinFeeCents)} to join` : null;
  const dues = plan.duesCents ? `${formatMoney(plan.duesCents)}${DUES_INTERVAL_SUFFIX[plan.duesInterval]}` : null;

  if (join && dues) return `${join}, then ${dues}`;
  if (join) return `${join}, no ongoing dues`;
  if (dues) return `${dues}, no join fee`;
  return "No charge";
}

/**
 * Dates on a membership are period boundaries, not instants — the server works in whole
 * UTC days on purpose (see its util's note). Rendering them in the reader's local zone
 * would show "Feb 28" to somebody in Auckland for a period that starts on the 1st.
 */
export function formatPeriodDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Mar 1 – Mar 31": the days a period actually covers, end being exclusive. */
export function formatPeriodRange(startIso: string, endIso: string): string {
  const lastDay = new Date(new Date(endIso).getTime() - 86_400_000).toISOString();
  return `${formatPeriodDate(startIso)} – ${formatPeriodDate(lastDay)}`;
}

/** What the member owes each period, as a phrase. */
export function duesLine(m: Pick<Membership | MyMembership, "duesCents" | "duesInterval">): string {
  if (!m.duesCents) return "No dues";
  return `${formatMoney(m.duesCents)}${DUES_INTERVAL_SUFFIX[m.duesInterval]}`;
}

/**
 * The sentence under a member's status.
 *
 * Written from the MEMBER's point of view, because the same component renders on their own
 * profile. "Your next dues" reads wrong to an admin looking at somebody else, so this
 * stays impersonal.
 */
export function nextDuesLine(m: Pick<Membership | MyMembership, "status" | "nextDueAt" | "duesCents" | "autoBillDues">): string {
  if (m.status === "cancelled") return "This membership has ended.";
  if (m.status === "suspended") return "Paused — no dues are being charged.";
  if (m.status === "pending") return "Not started yet. No dues are being charged.";
  if (!m.duesCents) return "This plan has no recurring dues.";
  if (!m.nextDueAt) return "No dues period is scheduled.";

  const when = formatPeriodDate(m.nextDueAt);
  return m.autoBillDues ? `Next dues are billed automatically on ${when}.` : `Next dues period starts ${when}.`;
}
