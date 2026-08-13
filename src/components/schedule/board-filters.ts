import { resourceLabel, type Reservation, type ReservationType } from "@/types/api";
import type { ListFilterValues } from "@/components/list-filters";
import { asFacetStrings } from "@/lib/list-query-state";
import { closeOutStep, isRampedIn, isRampedOut, liveLedgerStakes } from "./close-out";
import { TYPE_LABEL, personnelNames } from "./meta";

/**
 * The dispatch board splits its filters in two, and the split is the whole design:
 *
 *  - **Row filters** (resource, location) remove LANES. Safe, because a lane that isn't
 *    drawn makes no claim about itself, you can see the board is narrowed.
 *
 *  - **Block filters** (this module: people, ramp state, billing state, type, free text)
 *    never remove a booking. They mark matches and dim the rest.
 *
 * The second rule exists because removing blocks makes the board lie. Filter to one
 * instructor with hard filtering and N123's 2pm renders empty, so it reads as bookable,
 * when there is a solo sitting on it. A dispatcher then books over a real flight. Dimming
 * keeps the geometry honest: every occupied slot stays occupied on screen, the filter only
 * decides what is worth your eyes.
 *
 * Everything here is client-side on purpose. The board already fetches its whole date range
 * for the lane geometry, so matching in the browser costs nothing, needs no new endpoints
 * for the people/ramp/billing facets, and keeps one react-query cache entry per range
 * instead of one per filter permutation (which would defeat the 20s auto-refresh).
 */

export const BOARD_FACET_KEYS = ["personId", "ramp", "billing", "type"] as const;

/** Where a booking sits on the ramp, in the words a dispatcher would use. */
export type RampStatus = "scheduled" | "out" | "overdue" | "back" | "closed";

export const RAMP_OPTIONS: Array<{ value: RampStatus; label: string }> = [
  { value: "scheduled", label: "Not out yet" },
  { value: "out", label: "Out now" },
  { value: "overdue", label: "Overdue back" },
  { value: "back", label: "Back, not closed out" },
  { value: "closed", label: "Closed out" },
];

export type BillingStatus = "notInvoiced" | "unpaid" | "paid" | "voided";

export const BILLING_OPTIONS: Array<{ value: BillingStatus; label: string }> = [
  // "Not billed" covers invoice mode (no Stripe invoice) and ledger mode (no flight_charge).
  { value: "notInvoiced", label: "Not billed" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "voided", label: "Voided" },
];

/**
 * Ramp states a booking is in. A LIST, not a single value: "out now" and "overdue back" are
 * both true of an aircraft that is late, and a dispatcher selecting either should see it.
 *
 * `now` is injectable so this stays pure, "overdue" is the only clock-dependent state.
 */
export function rampStatuses(r: Reservation, now: Date = new Date()): RampStatus[] {
  if (r.cancelledAt) return [];
  const out = isRampedOut(r);
  const back = isRampedIn(r);
  if (!out) return ["scheduled"];
  if (!back) {
    // Still out. Overdue once it is past the end time it was booked for: that's the
    // question ("should this be back by now?"), so it's measured against the schedule
    // rather than against any elapsed-time rule of thumb.
    return new Date(r.end).getTime() < now.getTime() ? ["out", "overdue"] : ["out"];
  }
  return closeOutStep(r) === "reviewed" || closeOutStep(r) === "invoiced" ? ["closed"] : ["back"];
}

/**
 * One status for a booking that may now carry several invoices, one per payer —
 * and/or live ledger flight_charge stakes (ledger billing mode).
 *
 * The order of these tests is the whole design. "Unpaid" has to win over paid: a class
 * where three of four students have settled up is a booking the school is still chasing,
 * and showing it as paid would hide the one that matters. Void invoices are owed by nobody,
 * so they are ignored unless they are ALL there is. Live ledger stakes count as paid (the
 * member account was already charged); without them a ledger-billed flight would keep
 * matching "Not billed" and clutter Billing → Unbilled / the board filter.
 */
export function billingStatus(r: Reservation): BillingStatus {
  const all = r.invoices ?? [];
  const live = all.filter((i) => !i.voidedAt);
  const hasLedger = liveLedgerStakes(r).length > 0;

  if (!live.length && !hasLedger) {
    return all.length ? "voided" : "notInvoiced";
  }

  if (live.length) {
    return live.some((i) => !i.paidAt) ? "unpaid" : "paid";
  }

  // Ledger stakes only (including voided Stripe leftovers + a live flight_charge).
  return "paid";
}

/** Every org-user id rostered on this booking, whichever seat they're in. */
export function personnelIds(r: Reservation): number[] {
  const p = r.personnel;
  return [
    ...(p?.instructors ?? []),
    ...(p?.students ?? []),
    ...(p?.renters ?? []),
  ].map((ou) => ou.id);
}

/**
 * The strings free-text search looks at. Mirrors the server's `reservationSearchClauses`
 * (title, notes, type, tail number / sim name / room number, people, guests) so a query
 * that matched on the old server-side search still matches now that it runs here.
 */
export function searchableText(r: Reservation): string[] {
  const res = r.resource ? resourceLabel(r.resource) : null;
  return [
    r.title,
    r.notes ?? "",
    r.type,
    TYPE_LABEL[r.type] ?? "",
    res?.name ?? "",
    res?.kind ?? "",
    ...personnelNames(r),
    ...(r.personnel?.guests ?? []).map((g) => g.email),
  ].filter(Boolean);
}

export function matchesQuery(r: Reservation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return searchableText(r).some((s) => s.toLowerCase().includes(needle));
}

/**
 * Does this booking match the block-level filters? True when nothing is selected, so an
 * unfiltered board has every block at full strength rather than every block dimmed.
 *
 * Facets AND together (instructor Sarah AND unpaid); values within one facet OR together
 * (Sarah OR Dana), the same semantics the multi-select facets already have elsewhere.
 */
export function matchesBoardFilters(
  r: Reservation,
  values: ListFilterValues,
  q: string,
  now: Date = new Date()
): boolean {
  if (!matchesQuery(r, q)) return false;

  const people = asFacetStrings(values.personId).map(Number).filter(Number.isFinite);
  if (people.length) {
    const ids = new Set(personnelIds(r));
    if (!people.some((id) => ids.has(id))) return false;
  }

  const ramp = asFacetStrings(values.ramp) as RampStatus[];
  if (ramp.length) {
    const mine = rampStatuses(r, now);
    if (!ramp.some((s) => mine.includes(s))) return false;
  }

  const billing = asFacetStrings(values.billing) as BillingStatus[];
  if (billing.length && !billing.includes(billingStatus(r))) return false;

  const types = asFacetStrings(values.type) as ReservationType[];
  if (types.length && !types.includes(r.type)) return false;

  return true;
}

/** Is any block-level filter actually narrowing anything? Drives whether we dim at all. */
export function hasBoardFilters(values: ListFilterValues, q: string): boolean {
  if (q.trim()) return true;
  return BOARD_FACET_KEYS.some((k) => asFacetStrings(values[k]).length > 0);
}

/**
 * What the board is currently marking. Passed to every schedule view so the lane grid, the
 * week grid, the month grid and both agendas can't disagree about which bookings are lit.
 */
export type BoardMarks = {
  /** Ids matching the active block filters, or null when none are active. */
  matchedIds: Set<number> | null;
  /** The live search text, for highlighting the matched substring inside a lit block. */
  query: string;
  /** The booking open in the detail panel, so the board says which one you're reading. */
  selectedId?: number | null;
};

/**
 * Tailwind for a booking the active filters didn't match.
 *
 * Dimmed, never hidden, `opacity` and a light desaturation, so the block still occupies
 * its slot and still reads as "something is booked here", just not as something you asked
 * about. It stays clickable on purpose: noticing a conflict you filtered out and opening it
 * is exactly the workflow this design is for.
 */
export function dimClass(marks: BoardMarks, id: number): string | undefined {
  if (!marks.matchedIds || marks.matchedIds.has(id)) return undefined;
  return "opacity-35 saturate-50 transition-opacity hover:opacity-70";
}

/** True when this booking is one the filters singled out (and something is being filtered). */
export function isMarked(marks: BoardMarks, id: number): boolean {
  return marks.matchedIds != null && marks.matchedIds.has(id);
}

/**
 * Tailwind for the booking whose record is open in the detail panel.
 *
 * A ring rather than a fill or an opacity change: blocks already spend colour on
 * type and opacity on the filter dimming, so selection needs a channel neither of
 * those is using or the three states start cancelling each other out. Sits at full
 * strength even on a dimmed block, you can open something the filters excluded,
 * and while you're reading it, it should be the thing that stands out.
 */
export function selectedClass(marks: BoardMarks, id: number): string | undefined {
  if (marks.selectedId == null || marks.selectedId !== id) return undefined;
  return "opacity-100! saturate-100! ring-2 ring-primary ring-offset-1 ring-offset-background";
}

/**
 * Which rostered name to show on a block that only has room for one.
 *
 * Normally the first, but when a search matched a person further down the list, show THAT
 * one. Otherwise searching "Dana" lights up a block reading ", Sarah Okafor" with nothing
 * highlighted, and the board looks like it matched at random.
 */
export function preferredName(names: string[], query: string): string | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) return names[0];
  return names.find((n) => n.toLowerCase().includes(needle)) ?? names[0];
}

/**
 * What a calendar block calls its crew.
 *
 * One name plus a count once there are several. "Amy Reyes +2". A block only has room for
 * one name, and showing just the first made a six-student ground school look exactly like a
 * 1:1 at a glance: the dispatcher's whole job is reading the board, and it was hiding the
 * thing that changes how a booking is staffed and billed.
 *
 * The +N is appended to whichever name was CHOSEN, so a search for a student who is third on
 * the list surfaces them by name rather than burying them behind somebody else's.
 */
export function crewLabel(names: string[], query: string): string | undefined {
  const shown = preferredName(names, query);
  if (!shown) return undefined;
  const others = names.length - 1;
  return others > 0 ? `${shown} +${others}` : shown;
}
