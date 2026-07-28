/**
 * Time zones for the console.
 *
 * The rule: **a scheduled time belongs to the airport, not to the browser looking at it.**
 * A 9am lesson at a field in Idaho is 9am for a student reading it in Phoenix. Today every
 * grid positions blocks with `d.getHours()` — the *viewer's* clock — so the whole board
 * slides when someone travels. That is the bug this file exists to fix.
 *
 * Two halves, and the second one is the dangerous one:
 *
 * - **Output.** Format and position in the airport's zone. Visible, annoying, harmless.
 * - **Input.** When a dispatcher picks "9:00 AM" they mean 9am *at the field*. The form
 *   currently builds that instant from the browser's wall clock, so a dispatcher working
 *   from a different zone books flights at the wrong time with no error anywhere.
 *
 * `date-fns` has no zone support and `date-fns-tz` isn't a dependency, so the conversions
 * here are hand-rolled on `Intl` — which every target browser has, and which carries the
 * tzdata we'd otherwise be shipping ourselves. The maths mirrors the server's
 * `utils/timeZone.ts` deliberately; the two must agree or a booking round-trips wrong.
 *
 * Reasoning behind the fallback order lives in `insights/timezones-design.md`.
 */

/** The browser's own zone. Updates by itself when the machine moves. */
export const DEVICE_TIME_ZONE: string = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Follow the device, or use a pinned zone. */
export type TimeZoneMode = "auto" | "manual";

/** Render the schedule in airport time (the safe default) or the viewer's own. */
export type ScheduleTimeZoneMode = "location" | "user";

/**
 * Is this a real IANA zone?
 *
 * Asked by trying it, because `Intl` is the same authority every formatter downstream will
 * consult. A bare offset (`+07:00`) is rejected on purpose: it has no DST rules, so anything
 * scheduled through one drifts twice a year.
 */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string") return false;

  const trimmed = zone.trim();
  if (!trimmed) return false;
  if (trimmed !== "UTC" && !/^[A-Za-z]+(?:[_/][A-Za-z0-9+-]+)+$/.test(trimmed)) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone something at a field should display in.
 *
 * location → organization → the viewer's own. That last step is **today's behaviour**, which
 * is what makes this safe to ship: an org that never sets a zone renders exactly as it does
 * now, and only starts changing once somebody configures one.
 */
export function resolveDisplayZone(options: {
  locationZone?: string | null;
  orgZone?: string | null;
  viewerZone?: string | null;
}): string {
  const { locationZone, orgZone, viewerZone } = options;

  if (isValidTimeZone(locationZone)) return locationZone;
  if (isValidTimeZone(orgZone)) return orgZone;
  if (isValidTimeZone(viewerZone)) return viewerZone;

  return DEVICE_TIME_ZONE;
}

/** The viewer's own zone, from their stored preference plus what this browser reports. */
export function resolveViewerZone(preference?: {
  timeZone?: string | null;
  timeZoneMode?: string | null;
}): string {
  if (preference?.timeZoneMode === "manual" && isValidTimeZone(preference.timeZone)) {
    return preference.timeZone;
  }
  return DEVICE_TIME_ZONE;
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  //`en-CA` gives YYYY-MM-DD, which parses back with no locale ambiguity.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    //Some ICU builds render midnight as hour 24.
    get("hour") % 24,
    get("minute"),
    get("second")
  );

  return asUtc - instant.getTime();
}

/**
 * The wall clock an instant reads as in a zone. Months are 1-based, to compose with
 * `zonedWallClockToUtc` below without an off-by-one.
 */
export function wallClockInZone(
  instant: Date | string,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const date = typeof instant === "string" ? new Date(instant) : instant;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/**
 * The UTC instant for a wall clock in a zone — **the input half of the fix.**
 *
 * Brackets the answer rather than guessing: treat the wall clock as if it were UTC, ask what
 * that instant looks like in the target zone, correct by the difference, and verify the
 * candidate renders back as what was asked for.
 *
 * - Normal day: both candidates agree.
 * - Fall back (01:30 happens twice): both round-trip; take the earlier, which is what a
 *   person means by "half one".
 * - Spring forward (02:30 never happens): neither round-trips; take the later, which is a
 *   real instant just after the jump. An uncorrected loop silently slides an hour backwards
 *   into the previous offset instead.
 *
 * Mirrors `zonedWallClockToUtc` on the server; they must stay in step.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const candidateA = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone);
  const candidateB = asIfUtc - zoneOffsetMs(new Date(candidateA), timeZone);

  const roundTrips = (instant: number) =>
    instant + zoneOffsetMs(new Date(instant), timeZone) === asIfUtc;

  const valid = [candidateA, candidateB].filter(roundTrips);
  if (valid.length > 0) return new Date(Math.min(...valid));

  return new Date(Math.max(candidateA, candidateB));
}

/**
 * Minutes from midnight in a zone — what a day grid positions a block by.
 *
 * Replacing `d.getHours() * 60 + d.getMinutes()` with this is the entire fix for a board that
 * slides when the viewer travels.
 */
export function minutesFromMidnightInZone(instant: Date | string, timeZone: string): number {
  const { hour, minute } = wallClockInZone(instant, timeZone);
  return hour * 60 + minute;
}

/** `2026-07-28` as the date reads in the zone — which calendar cell a block belongs to. */
export function dateKeyInZone(instant: Date | string, timeZone: string): string {
  const { year, month, day } = wallClockInZone(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Midnight at the start of a zone's calendar day, as a UTC instant. */
export function startOfDayInZone(instant: Date | string, timeZone: string): Date {
  const { year, month, day } = wallClockInZone(instant, timeZone);
  return zonedWallClockToUtc(year, month, day, 0, 0, timeZone);
}

/**
 * The short label a person reads — "MDT", "CST".
 *
 * Season-dependent, so it needs the instant: the same zone is MST in January and MDT in July,
 * and the wrong one is worse than none.
 */
export function zoneAbbreviation(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;

  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
        .formatToParts(date)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * Do two zones read the same at this instant?
 *
 * The test for whether a zone label is worth showing. Comparing NAMES would be wrong:
 * `America/Phoenix` and `America/Denver` are identical for half the year, so a name check
 * labels every time on the page for a Phoenix viewer in January — clutter carrying no
 * information. **Getting this right is what keeps the feature invisible for the ~99% of users
 * who are sitting at their own airport**, which is the whole point.
 */
export function zonesAgreeAt(
  instant: Date | string,
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b || a === b) return true;
  if (!isValidTimeZone(a) || !isValidTimeZone(b)) return true;

  const inA = wallClockInZone(instant, a);
  const inB = wallClockInZone(instant, b);

  return (
    inA.year === inB.year &&
    inA.month === inB.month &&
    inA.day === inB.day &&
    inA.hour === inB.hour &&
    inA.minute === inB.minute
  );
}

/** `9:00 AM` in the given zone. The zone-aware replacement for `format(d, "h:mm a")`. */
export function formatTimeInZone(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  }
}

/** `Tue, Jul 28` / `Tuesday, July 28, 2026` in the given zone. */
export function formatDateInZone(
  instant: Date | string,
  timeZone: string,
  style: "short" | "long" = "short"
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;

  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { timeZone, weekday: "short", month: "short", day: "numeric" };

  try {
    return new Intl.DateTimeFormat("en-US", opts).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: undefined }).format(date);
  }
}

/**
 * `9:00 AM – 11:00 AM`, with the zone label appended only when the viewer is somewhere else.
 *
 * The conditional label is deliberate. Everyone at the field sees exactly what they see
 * today; only the person who has travelled pays for the extra word, and they are the one who
 * needs it.
 */
export function formatTimeRangeInZone(
  start: Date | string,
  end: Date | string,
  timeZone: string,
  viewerZone?: string | null
): string {
  const range = `${formatTimeInZone(start, timeZone)} – ${formatTimeInZone(end, timeZone)}`;

  if (zonesAgreeAt(start, timeZone, viewerZone)) return range;

  const label = zoneAbbreviation(start, timeZone);
  return label ? `${range} ${label}` : range;
}

/**
 * A curated zone list for the picker, commonest first.
 *
 * `Intl.supportedValuesOf("timeZone")` returns 400+ names — correct, and unusable as a
 * dropdown. US aviation zones lead because that is the entire customer base today; the full
 * list is still appended so nobody is locked out.
 */
export const COMMON_TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern — New York" },
  { value: "America/Chicago", label: "Central — Chicago" },
  { value: "America/Denver", label: "Mountain — Denver" },
  { value: "America/Boise", label: "Mountain — Boise" },
  { value: "America/Phoenix", label: "Arizona — Phoenix (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Honolulu (no DST)" },
];

/** Every zone this browser knows, for the "somewhere else" case. */
export function allTimeZones(): string[] {
  const supported = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  try {
    return supported ? supported("timeZone") : COMMON_TIME_ZONES.map((z) => z.value);
  } catch {
    return COMMON_TIME_ZONES.map((z) => z.value);
  }
}

/** `Mountain — Boise (MDT)` for a settings row, so the choice is unambiguous. */
export function describeZone(zone: string, at: Date = new Date()): string {
  const known = COMMON_TIME_ZONES.find((z) => z.value === zone);
  const abbr = zoneAbbreviation(at, zone);
  const base = known?.label ?? zone.replace(/_/g, " ");

  return abbr ? `${base} (${abbr})` : base;
}

/**
 * Midnight at the start of a picked calendar date, in a zone.
 *
 * `day` is a date the user chose (a Date whose LOCAL y/m/d are the date they mean), not an
 * instant to be converted — so its own local components are read, then re-anchored in the
 * target zone. Converting it as an instant instead would slide the boundary by the offset
 * between the two zones and silently shift the whole fetched window by a day.
 */
export function zonedStartOfDay(day: Date, timeZone: string): Date {
  return zonedWallClockToUtc(
    day.getFullYear(),
    day.getMonth() + 1,
    day.getDate(),
    0,
    0,
    timeZone
  );
}

/** The last instant of a picked calendar date in a zone (23:59 + a minute, exclusive-ish). */
export function zonedEndOfDay(day: Date, timeZone: string): Date {
  return new Date(
    zonedWallClockToUtc(
      day.getFullYear(),
      day.getMonth() + 1,
      day.getDate(),
      23,
      59,
      timeZone
    ).getTime() + 59_999
  );
}
