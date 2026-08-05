/**
 * Smart-scheduling engine — a TypeScript port of the Flutter app's
 * AvailabilityController (app/lib/controllers/availability_controller.dart).
 *
 * The web fetches conflict-free windows straight from the server availability
 * endpoints (`/availability/resource/:id`, `/availability/user/:userId`) — those
 * already have existing reservations subtracted server-side, which is exactly
 * what the server re-checks at create time (`resourceIsAvailable` +
 * `orgUserIsAvailable`, both pure overlap counts). So this module never
 * re-derives conflicts from the reservation list; it only INTERSECTS the free
 * windows of the resource + each assigned person and slices the result into a
 * 15-minute grid of valid start/end options.
 *
 * Deltas from Flutter, chosen deliberately for correctness/clarity:
 *  - Slots are aligned to the clock (:00/:15/:30/:45), not to a free window's
 *    ragged start, so a gap of 9:07–10:30 offers 9:15, 9:30, … (still never
 *    overlapping the 9:07 boundary). Flutter aligned to the window start.
 *  - A present-but-empty free-window list means "fully booked", so it blocks
 *    the intersection. (Flutter dropped empty lists, which would let you book a
 *    fully-booked resource — not sound.)
 */
import { addDays, addMinutes, startOfDay } from "date-fns";

export type Window = { start: Date; end: Date };
export type RawWindow = { start: string; end: string };

export const SLOT_MIN = 15;
export const DEFAULT_DURATION_MIN = 60;
export const MIN_DURATION_MIN = 15;
/** Fallback ladder when the default hour doesn't fit the free window. */
const DURATION_LADDER_MIN = [60, 45, 30, 15];
export const MAX_ADVANCE_DAYS = 365;

// ── window helpers ───────────────────────────────────────────────────────────

/** Parse `{start,end}` ISO windows into Date windows, dropping unparseable/empty. */
export function parseWindows(raw: RawWindow[] | undefined | null): Window[] {
  if (!raw) return [];
  const out: Window[] = [];
  for (const w of raw) {
    const start = new Date(w.start);
    const end = new Date(w.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end.getTime() <= start.getTime()) continue;
    out.push({ start, end });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Intersect two sorted window lists (both must actually constrain). */
function intersectTwo(a: Window[], b: Window[]): Window[] {
  const out: Window[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start.getTime(), b[j].start.getTime());
    const end = Math.min(a[i].end.getTime(), b[j].end.getTime());
    if (end > start) out.push({ start: new Date(start), end: new Date(end) });
    // Advance whichever window ends first.
    if (a[i].end.getTime() < b[j].end.getTime()) i++;
    else j++;
  }
  return out;
}

/**
 * Intersect the free windows of every constraining entity. Each entry is a
 * window list, or `null` for "no constraint" (entity not selected / still
 * loading) which is skipped. Returns `null` when nothing constrains at all
 * (caller treats that as "the whole day is open"). A present but empty list
 * ([]) means the entity is fully booked → the intersection is empty.
 */
export function intersectAvailability(lists: (Window[] | null)[]): Window[] | null {
  const active = lists.filter((l): l is Window[] => l !== null);
  if (active.length === 0) return null;
  return active.reduce((acc, cur) => intersectTwo(acc, cur));
}

/**
 * Add `extra` back into a free-window list, merging it with anything it touches.
 *
 * Needed when EDITING a reservation: the server's availability endpoints count
 * that reservation as busy, so its own slot would show as unavailable and the
 * picker would refuse to re-offer the time it already occupies. Passing the
 * reservation's current interval here restores it. `null` windows ("nothing
 * constrains") stay null — there is nothing to add to an already-open day.
 */
export function withWindowRestored(windows: Window[] | null, extra: Window | null): Window[] | null {
  if (windows === null || extra === null) return windows;
  if (!(extra.end.getTime() > extra.start.getTime())) return windows;

  const merged = [...windows, extra].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Window[] = [];
  for (const w of merged) {
    const last = out[out.length - 1];
    // Adjacent windows count as touching — back-to-back bookings are legal, so
    // 09:00-10:00 and 10:00-11:00 form one continuous 09:00-11:00 span.
    if (last && w.start.getTime() <= last.end.getTime()) {
      if (w.end.getTime() > last.end.getTime()) last.end = w.end;
    } else {
      out.push({ start: w.start, end: w.end });
    }
  }
  return out;
}

// ── slot grid ────────────────────────────────────────────────────────────────

/** Round a Date UP to the next clock-aligned 15-minute mark (seconds zeroed). */
function ceilTo15(d: Date): Date {
  const base = startOfDay(d);
  const slotMs = SLOT_MIN * 60_000;
  // Work in elapsed milliseconds so sub-minute components round UP too — using
  // differenceInMinutes here would truncate seconds first and round a 09:00:30
  // window start down to 09:00 (offering a start with no valid end).
  const up = Math.ceil((d.getTime() - base.getTime()) / slotMs) * slotMs;
  return new Date(base.getTime() + up);
}

/**
 * Clip the free windows to the selected calendar day and to "not in the past",
 * dropping anything shorter than the minimum bookable duration. When `windows`
 * is `null` (no constraints), the whole day is open.
 */
export function windowsForDay(windows: Window[] | null, day: Date, now: Date): Window[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1); // exclusive next-midnight
  const floor = Math.max(dayStart.getTime(), now.getTime());
  const base: Window[] = windows ?? [{ start: dayStart, end: dayEnd }];

  const out: Window[] = [];
  for (const w of base) {
    const start = Math.max(w.start.getTime(), floor);
    const end = Math.min(w.end.getTime(), dayEnd.getTime());
    if (end - start >= MIN_DURATION_MIN * 60_000) {
      out.push({ start: new Date(start), end: new Date(end) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Every clock-aligned 15-min mark in [ceil15(w.start), w.end]. */
function marksInWindow(w: Window): Date[] {
  const out: Date[] = [];
  let t = ceilTo15(w.start);
  while (t.getTime() <= w.end.getTime()) {
    out.push(t);
    t = addMinutes(t, SLOT_MIN);
  }
  return out;
}

/**
 * Valid START times for the day: clock-aligned marks that leave at least the
 * minimum duration before the window closes.
 */
export function startOptions(dayWindows: Window[]): Date[] {
  const out: Date[] = [];
  for (const w of dayWindows) {
    for (const m of marksInWindow(w)) {
      if (addMinutes(m, MIN_DURATION_MIN).getTime() <= w.end.getTime()) out.push(m);
    }
  }
  return out;
}

/** The free window that contains `t` (start-inclusive, end-exclusive). */
function windowContaining(dayWindows: Window[], t: Date): Window | null {
  const ms = t.getTime();
  return (
    dayWindows.find((w) => ms >= w.start.getTime() && ms < w.end.getTime()) ?? null
  );
}

/**
 * Valid END times once a START is chosen: marks strictly after the start, up to
 * the end of the SAME contiguous free window (so you can never book across a
 * busy gap). Empty if the start isn't inside any window.
 */
export function endOptions(dayWindows: Window[], start: Date): Date[] {
  const w = windowContaining(dayWindows, start);
  if (!w) return [];
  return marksInWindow(w).filter((m) => m.getTime() > start.getTime());
}

/**
 * The auto-selected END when a START is picked: the default hour, backing off
 * 45 → 30 → 15 min until it fits inside the containing window. Mirrors Flutter's
 * `retrieveAdjustedEndTimeBecauseStartTimeChanged`.
 */
export function defaultEnd(dayWindows: Window[], start: Date): Date | null {
  const w = windowContaining(dayWindows, start);
  if (!w) return null;
  for (const dur of DURATION_LADDER_MIN) {
    const candidate = addMinutes(start, dur);
    if (candidate.getTime() <= w.end.getTime()) return candidate;
  }
  return null;
}

/** True iff [start, end) sits entirely inside one free window (a bookable slot). */
export function isBookable(dayWindows: Window[], start: Date, end: Date): boolean {
  if (end.getTime() <= start.getTime()) return false;
  const w = windowContaining(dayWindows, start);
  return !!w && end.getTime() <= w.end.getTime();
}

// ── multi-day bookings ───────────────────────────────────────────────────────
//
// Everything above works a DAY at a time: `windowsForDay` clips the free windows to one
// calendar day, so `endOptions` can only ever offer an end before the next midnight. That
// is the reason a trip could not be booked from this form at all, whatever the server
// allowed.
//
// These four work on the UNCLIPPED window list instead, so a booking may run to the end of
// the contiguous free span it starts in, however many midnights that crosses. Only reached
// when the school has turned multi-day bookings on AND the chosen end date differs from the
// start date, so the same-day path above is untouched by design: it is the overwhelmingly
// common case and it already works.

/**
 * The contiguous free window containing `t`, with no day boundary applied.
 *
 * `null` windows mean "nothing constrains" (no resource picked, still loading), which the
 * day-based code treats as an open day. The equivalent here is an open booking horizon,
 * because the whole point is that the booking is not confined to a day.
 */
export function containingWindow(windows: Window[] | null, t: Date, now: Date): Window | null {
  const ms = t.getTime();
  if (windows === null) {
    const horizon = addDays(now, MAX_ADVANCE_DAYS);
    return ms >= now.getTime() && ms < horizon.getTime()
      ? { start: new Date(Math.max(ms, now.getTime())), end: horizon }
      : null;
  }
  return windows.find((w) => ms >= w.start.getTime() && ms < w.end.getTime()) ?? null;
}

/**
 * Valid END times on a specific later day, for a booking that starts at `start`.
 *
 * Bounded by the free window the START sits in, so a trip still cannot be booked straight
 * through somebody else's reservation: if the aeroplane is booked out on the Saturday, the
 * window containing Friday ends on Saturday and no Sunday end is offered.
 *
 * Includes the following midnight as a mark, matching the same-day picker (which offers
 * 00:00 as an end for a booking that runs to the end of the day).
 */
export function endOptionsOnDay(
  windows: Window[] | null,
  start: Date,
  endDay: Date,
  now: Date
): Date[] {
  const w = containingWindow(windows, start, now);
  if (!w) return [];

  const dayStart = startOfDay(endDay);
  const from = Math.max(dayStart.getTime(), addMinutes(start, MIN_DURATION_MIN).getTime());
  const to = Math.min(addDays(dayStart, 1).getTime(), w.end.getTime());
  if (to < from) return [];

  return marksInWindow({ start: new Date(from), end: new Date(to) }).filter(
    (m) => m.getTime() > start.getTime()
  );
}

/**
 * The last calendar day a booking starting at `start` could end on.
 *
 * Feeds the end-date picker's `max`, so a date that could never produce a valid end time is
 * not offerable in the first place. An operator picking a date and finding the time list
 * empty learns nothing about why.
 */
export function lastEndDay(windows: Window[] | null, start: Date, now: Date): Date | null {
  const w = containingWindow(windows, start, now);
  if (!w) return null;
  // A window ending exactly at midnight cannot host an end time on that midnight's own day,
  // so the last usable day is the one before it. Anything later in the day extends the day.
  const end = w.end;
  const atMidnight = end.getTime() === startOfDay(end).getTime();
  return atMidnight ? startOfDay(addDays(end, -1)) : startOfDay(end);
}

/** As `isBookable`, but without confining the booking to the start's own day. */
export function isBookableAcrossDays(
  windows: Window[] | null,
  start: Date,
  end: Date,
  now: Date
): boolean {
  if (end.getTime() <= start.getTime()) return false;
  const w = containingWindow(windows, start, now);
  return !!w && end.getTime() <= w.end.getTime();
}

/**
 * The earliest bookable START at or after `from` (never before `now`), scanning
 * the full (multi-day) free-window set — this powers "next available" even when
 * the selected day is fully booked. Returns null if nothing is free within the
 * booking horizon.
 */
export function nextAvailable(
  windows: Window[] | null,
  from: Date,
  now: Date
): Date | null {
  const floor = Math.max(from.getTime(), now.getTime());
  const horizon = addDays(now, MAX_ADVANCE_DAYS).getTime();
  const base: Window[] = windows ?? [{ start: new Date(floor), end: new Date(horizon) }];

  let best: number | null = null;
  for (const w of base) {
    if (w.start.getTime() >= horizon) continue;
    const from2 = Math.max(w.start.getTime(), floor);
    const mark = ceilTo15(new Date(from2));
    if (
      mark.getTime() < horizon &&
      addMinutes(mark, MIN_DURATION_MIN).getTime() <= w.end.getTime() &&
      (best === null || mark.getTime() < best)
    ) {
      best = mark.getTime();
    }
  }
  return best === null ? null : new Date(best);
}
