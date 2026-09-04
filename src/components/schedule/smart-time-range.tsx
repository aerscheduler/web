import * as React from "react";
import { addDays, addMinutes, startOfDay } from "date-fns";
import {
  dateKeyInZone,
  minutesFromMidnightInZone,
  zonedWallClockToUtc,
} from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { CalendarClock, Loader2 } from "lucide-react";
import { useResourceAvailability, useUsersAvailability } from "@/features/queries";
import {
  defaultEnd,
  endOptions,
  endOptionsOnDay,
  filterToStartIncrement,
  fixedEndAcrossDays,
  fixedEndInWindow,
  intersectAvailability,
  withWindowRestored,
  isBookable,
  isBookableAcrossDays,
  lastEndDay,
  MAX_ADVANCE_DAYS,
  nextAvailable,
  parseWindows,
  startOptions,
  windowsForDay,
  type Window,
} from "@/lib/scheduling";
import {
  describeBookingTimePolicy,
  NO_BOOKING_TIME_POLICY,
  type BookingTimePolicy,
} from "./reservation-shared";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Availability-aware date + start + end picker (a web port of the Flutter
 * create-reservation time engine). Given the chosen resource and assigned
 * personnel, it fetches their conflict-free windows, intersects them, and offers
 * only 15-minute slots during which everyone is simultaneously free, so an
 * invalid (double-booked or past) appointment can't be selected. Picking a start
 * auto-fills a valid end (default 1h, backing off to fit the free window).
 *
 * On top of availability it honours the school's SHARED CALENDAR RULES (`policy`): the
 * start grid, the fixed booking length, the minimum notice floor and the booking horizon
 * all narrow what is offered, so the rules shape the picker instead of arriving as a
 * rejection after the form is filled in. Clear-time buffers are already baked into the
 * free windows the availability endpoints return; the guidance line names them so the
 * shortened lists make sense.
 */
/** ISO string for a Select value; "" for null or an invalid Date. Prevents a bad
 * Date from crashing the render via `toISOString()` ("Invalid time value"), the
 * selection then self-heals through the reconcile effect below. */
function isoValue(d: Date | null): string {
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
}

/** Drop any non-finite Date so option keys/values never throw. */
function valid(dates: Date[]): Date[] {
  return dates.filter((d) => !Number.isNaN(d.getTime()));
}

/**
 * A Date that can safely be formatted or compared.
 *
 * The singular counterpart to `valid` above. Needed because an Invalid Date is truthy, so a
 * `d ? …` guard passes it straight into `Intl`, which throws rather than degrading.
 */
function usableDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

export function SmartTimeRange({
  invalidField,
  date,
  onDateChange,
  start,
  end,
  onChange,
  resourceId,
  resourceNoun = "resource",
  personnelUserIds,
  disabled,
  restoreWindow = null,
  lockStart = false,
  allowMultiDay = false,
  policy = NO_BOOKING_TIME_POLICY,
  excludeReservationId = null,
  relaxNoticeAndHorizon = false,
  locationId = null,
}: {
  /**
   * Id of the control the parent's validation is complaining about, so it can be marked
   * `aria-invalid`. That is what lib/form-focus.ts scrolls to and focuses on a failed
   * submit, and what interaction-tracking counts. One of "smart-date" or "smart-start".
   */
  invalidField?: string | null;
  /** "yyyy-MM-dd" of the selected day. */
  date: string;
  onDateChange: (date: string) => void;
  start: Date | null;
  end: Date | null;
  /** Emits the resolved start/end instants (or null while incomplete). */
  onChange: (start: Date | null, end: Date | null) => void;
  resourceId: number | null;
  /**
   * What to CALL the booked thing, lower-cased: "aircraft", ", simulator", ", room". A booking
   * is not always a flight, and this text used to say "aircraft" regardless, which reads
   * as a bug to anyone booking a classroom. Falls back to the neutral "resource", which is
   * the word the dispatch board's own column header uses.
   */
  resourceNoun?: string;
  /** USER ids (not org-user ids) of everyone assigned to the reservation. */
  personnelUserIds: number[];
  disabled?: boolean;
  /**
   * When editing, the reservation's CURRENT interval. The availability endpoints
   * count it as busy, so without this its own slot would read as unavailable.
   */
  restoreWindow?: { start: Date; end: Date } | null;
  /** Lock the date and start, used once a flight has ramped out. */
  lockStart?: boolean;
  /**
   * Whether this school has turned multi-day bookings on. Off, the End field is a time on
   * the same day, exactly as before. On, a second date picker appears so a booking can run
   * to a later day, bounded by the free window it starts in.
   */
  allowMultiDay?: boolean;
  /**
   * The school's shared calendar rules. Off for every field by default, which is every
   * school until an owner turns one on, and then this picker offers only what the server
   * accepts instead of letting somebody find out at Save. See `BookingTimePolicy`.
   */
  policy?: BookingTimePolicy;
  /**
   * When editing, the server excludes this reservation from busy windows so the operator
   * can keep or extend the current slot, including into its own buffer.
   */
  excludeReservationId?: number | null;
  /**
   * Front desk walk-ups: the server skips notice and horizon for staff, so the picker
   * must not hide those times either. Member self-book keeps the floor.
   */
  relaxNoticeAndHorizon?: boolean;
  /** Airport location for weekly hours and booking-policy clipping. */
  locationId?: number | null;
}) {
  const tz = useTimeZone();
  // Captured once so the past-clamp / memo keys stay stable while the form is open.
  const now = React.useMemo(() => new Date(), []);
  const personnelKey = personnelUserIds.join(",");

  const fixedLength = policy.fixedDurationMinutes;
  /**
   * The earliest instant a booking may start: now, pushed out by the school's minimum
   * notice. Used everywhere `now` was the "not in the past" floor, so a school that wants
   * 24 hours' notice simply has no marks inside the next 24 hours rather than a refusal
   * after the form is filled in.
   *
   * NOT applied while editing. The rule is about how far ahead a booking is MADE, and an
   * existing booking that starts in ten minutes is a legitimate thing to extend or move
   * the end of; flooring past its own slot would clear the selection the operator opened
   * the form to change. `restoreWindow` is only passed when editing (see its doc).
   *
   * Memoised on the MINUTE COUNT, not on `restoreWindow`: the parent rebuilds that object
   * every render, and a fresh `bookableFrom` identity each time would re-derive every
   * option list and re-run the reconcile effect below on every keystroke elsewhere in the
   * form. Same reason `restoreKey` exists further down.
   */
  const noticeFloorMinutes =
    restoreWindow != null || relaxNoticeAndHorizon ? null : policy.minimumNoticeMinutes;
  const bookableFrom = React.useMemo(
    () => (noticeFloorMinutes == null ? now : addMinutes(now, noticeFloorMinutes)),
    [now, noticeFloorMinutes]
  );

  /**
   * How far ahead a START may be. The school's horizon, never beyond the client's own
   * one-year cap. Deliberately not applied to the "Back on" date: the server checks the
   * horizon against the start alone, so a trip that leaves inside the window may return
   * after it.
   */
  const advanceDays =
    relaxNoticeAndHorizon || policy.bookingHorizonDays == null
      ? MAX_ADVANCE_DAYS
      : Math.min(policy.bookingHorizonDays, MAX_ADVANCE_DAYS);

  /**
   * Minutes past midnight in the zone the picker RENDERS in, which is the zone whose
   * marks the person is reading. Every US zone is a whole number of hours from UTC, so
   * this agrees with the server's own check (made in the airport's zone) on any 15, 30 or
   * 60 minute grid.
   */
  const minuteOfDay = React.useCallback(
    (instant: Date) => minutesFromMidnightInZone(instant, tz.zone),
    [tz.zone]
  );

  const resQ = useResourceAvailability(resourceId, {
    enabled: !disabled,
    excludeReservationId,
    locationId,
    bookingOnBehalf: relaxNoticeAndHorizon,
  });
  const userResults = useUsersAvailability(personnelUserIds, {
    enabled: !disabled,
    excludeReservationId,
    locationId,
    bookingOnBehalf: relaxNoticeAndHorizon,
  });

  const resUpdated = resQ.dataUpdatedAt;
  const usersUpdated = userResults.map((r) => r.dataUpdatedAt).join(",");
  const availabilityStatus = [
    resQ.status,
    resQ.isError ? "e" : "ok",
    ...userResults.map((r) => `${r.status}:${r.isError ? "e" : "ok"}`),
  ].join(",");
  const loading =
    (resourceId != null && resQ.isLoading) || userResults.some((r) => r.isLoading);

  // Intersect the free windows of every constraining entity. A null entry means
  // "no constraint" (not selected, still loading, or the request errored) and is
  // skipped, so the picker degrades to an open grid rather than blocking.
  const restoreKey = restoreWindow
    ? `${restoreWindow.start.getTime()}-${restoreWindow.end.getTime()}`
    : "";
  const allWindows: Window[] | null = React.useMemo(() => {
    const lists: (Window[] | null)[] = [];
    if (resourceId != null) {
      lists.push(resQ.isError ? [] : resQ.data ? parseWindows(resQ.data) : null);
    }
    userResults.forEach((r) => lists.push(r.isError ? [] : r.data ? parseWindows(r.data) : null));
    // The reservation being edited books itself, so add its own slot back in.
    return withWindowRestored(intersectAvailability(lists), restoreWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, resUpdated, usersUpdated, availabilityStatus, personnelKey, restoreKey]);

  //`date` is "YYYY-MM-DD" chosen by a person, meaning that day AT THE FIELD. Anchored to
  //noon in the airport's zone rather than parsed to local midnight: noon is never within an
  //hour of a DST transition, so the day can't slide when the clocks change.
  const day = React.useMemo(() => {
    if (!date) return null;
    const [yy, mm, dd] = date.split("-").map(Number);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
    return zonedWallClockToUtc(yy, mm, dd, 12, 0, tz.zone);
  }, [date, tz.zone]);

  const dayWindows = React.useMemo(
    () => (day ? windowsForDay(allWindows, day, bookableFrom) : []),
    [allWindows, day, bookableFrom]
  );

  /**
   * The end this start implies. With a fixed length that is the only legal end; otherwise
   * it is the usual default hour, backing off to fit the window. Null means the start
   * cannot host a booking at all, which is what keeps it out of `offerableStarts`.
   */
  const endFor = React.useCallback(
    (dayW: Window[], s: Date): Date | null => {
      if (fixedLength == null) return defaultEnd(dayW, s);
      return allowMultiDay
        ? fixedEndAcrossDays(allWindows, s, fixedLength, bookableFrom)
        : fixedEndInWindow(dayW, s, fixedLength);
    },
    [fixedLength, allowMultiDay, allWindows, bookableFrom]
  );

  /** A day's start marks, narrowed to the ones the school's rules actually allow. */
  const offerableStarts = React.useCallback(
    (dayW: Window[]): Date[] => {
      const grid = filterToStartIncrement(
        valid(startOptions(dayW)),
        policy.startIncrementMinutes,
        minuteOfDay
      );
      //Only worth filtering when a fixed length can fail to fit; otherwise `startOptions`
      //has already guaranteed room for the minimum booking.
      if (fixedLength == null) return grid;
      return grid.filter((s) => endFor(dayW, s) != null);
    },
    [policy.startIncrementMinutes, minuteOfDay, fixedLength, endFor]
  );

  const starts = React.useMemo(() => {
    const offered = offerableStarts(dayWindows);
    if (
      restoreWindow &&
      start &&
      start.getTime() === restoreWindow.start.getTime() &&
      date &&
      dateKeyInZone(start, tz.zone) === date &&
      !offered.some((s) => s.getTime() === start.getTime())
    ) {
      return [start, ...offered];
    }
    return offered;
  }, [offerableStarts, dayWindows, restoreWindow, start, date, tz.zone]);

  //The day the booking ENDS on, as "YYYY-MM-DD" at the field. Derived from the current end
  //rather than held as separate state, so it cannot drift out of step with it: whatever the
  //end instant is, the picker shows that instant's day. Defaults to the start's day, which
  //is what makes the whole multi-day path opt-in per booking as well as per school.
  //`usableDate`, not a truthiness check. An Invalid Date is an OBJECT, so `end ? …` lets it
  //through, and `dateKeyInZone` formats via Intl, which THROWS `RangeError: Invalid time
  //value` on a NaN time rather than returning anything. In a render that throw reaches the
  //error boundary and takes the whole booking form down with it, which it did, because this
  //form has a legitimate transient state where the end is momentarily invalid. That is
  //exactly why `isoValue` and `valid` above exist; this line has to use the same discipline.
  const endDate = usableDate(end) ? dateKeyInZone(end, tz.zone) : date;
  const spansDays = allowMultiDay && usableDate(end) && endDate !== date;

  const endDay = React.useMemo(() => {
    if (!endDate) return null;
    const [yy, mm, dd] = endDate.split("-").map(Number);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
    return zonedWallClockToUtc(yy, mm, dd, 12, 0, tz.zone);
  }, [endDate, tz.zone]);

  //Two paths on purpose. Same-day keeps the day-clipped windows it has always used; a
  //booking that ends on a later day has to ask the UNCLIPPED window list, because the
  //day-clipped one cannot express an end past midnight at all.
  const ends = React.useMemo(() => {
    if (!start) return [];
    //A fixed length leaves exactly one end. It is still offered as an option rather than
    //rendered as text so the field keeps its shape, and the control is disabled below.
    if (fixedLength != null) {
      const only = endFor(dayWindows, start);
      return only ? [only] : [];
    }
    if (!spansDays) return valid(endOptions(dayWindows, start));
    return endDay ? valid(endOptionsOnDay(allWindows, start, endDay, bookableFrom)) : [];
  }, [
    dayWindows,
    allWindows,
    start,
    spansDays,
    endDay,
    bookableFrom,
    fixedLength,
    endFor,
  ]);

  //The furthest day this booking could end on, so a date that can only ever produce an
  //empty time list is not offerable. Bounded by the free window the START sits in, which is
  //what keeps a trip from being booked straight through somebody else's reservation.
  const maxEndDate = React.useMemo(() => {
    if (!allowMultiDay || !start) return date;
    const last = lastEndDay(allWindows, start, bookableFrom);
    const horizon = addDays(now, MAX_ADVANCE_DAYS);
    const capped = last && last.getTime() < horizon.getTime() ? last : horizon;
    return dateKeyInZone(capped, tz.zone);
  }, [allowMultiDay, allWindows, start, now, bookableFrom, date, tz.zone]);

  /**
   * The earliest OFFERABLE slot from the selected day onward, which may be a later day.
   *
   * `nextAvailable` answers "when is anyone free next", which is not the same question
   * once the school books on a grid or at a fixed length: the free scrap it finds can hold
   * no offerable start at all. So each candidate day is checked against the same rules the
   * Start dropdown uses, and the scan moves to the next day when a day has none. Bounded
   * because it is walking days, and a link that names a time the picker then refuses to
   * select is worse than no link.
   */
  const next = React.useMemo(() => {
    const unconstrained =
      policy.startIncrementMinutes == null && fixedLength == null;
    const horizonMs = addDays(now, advanceDays).getTime();
    const scanDays = Math.min(advanceDays, 90);
    let from = day ? startOfDay(day) : bookableFrom;
    for (let i = 0; i < scanDays; i++) {
      const raw = nextAvailable(allWindows, from, bookableFrom);
      if (!raw) return null;
      if (raw.getTime() > horizonMs) return null;
      if (unconstrained) return raw;
      const pick = offerableStarts(windowsForDay(allWindows, raw, bookableFrom)).find(
        (s) => s.getTime() >= raw.getTime()
      );
      if (pick) return pick;
      from = startOfDay(addDays(raw, 1));
    }
    return null;
  }, [
    allWindows,
    day,
    bookableFrom,
    now,
    advanceDays,
    policy.startIncrementMinutes,
    fixedLength,
    offerableStarts,
  ]);

  // Reconcile the selection whenever the loaded availability changes (a refetch,
  // or the resource/personnel/date changed). If the start is no longer a valid
  // slot, clear both; if the start still holds but the window shrank under the
  // chosen end, refit the end to a valid one, otherwise a stale out-of-window
  // end could be submitted while the End field only *looks* empty.
  React.useEffect(() => {
    if (loading || !start) return;
    if (!starts.some((s) => s.getTime() === start.getTime())) {
      const sameDayAsPicker =
        !!date && dateKeyInZone(start, tz.zone) === date;
      const keepingExisting =
        restoreWindow != null &&
        start.getTime() === restoreWindow.start.getTime() &&
        sameDayAsPicker;
      if (!keepingExisting) onChange(null, null);
      return;
    }
    //A multi-day end is judged against the unclipped windows. Checking it with `isBookable`
    //would call every valid trip unbookable, because that asks whether the end fits inside
    //the START's own day, which is precisely what a trip does not do. It would then "refit"
    //the end back to the same day on every render.
    const inWindow = spansDays
      ? isBookableAcrossDays(allWindows, start, end!, bookableFrom)
      : !!end && isBookable(dayWindows, start, end);
    //A fixed length is part of "still valid": an end left over from before the school set
    //the rule, or from a start that has since moved, is a length the server refuses.
    const lengthOk =
      fixedLength == null ||
      (!!end && end.getTime() - start.getTime() === fixedLength * 60_000);
    if (!inWindow || !lengthOk) {
      onChange(start, endFor(dayWindows, start));
    }
  }, [
    loading,
    start,
    end,
    starts,
    dayWindows,
    allWindows,
    spansDays,
    bookableFrom,
    fixedLength,
    endFor,
    onChange,
  ]);

  const pickStart = (iso: string) => {
    const s = new Date(iso);
    onChange(s, endFor(dayWindows, s));
  };
  const pickEnd = (iso: string) => {
    if (start) onChange(start, new Date(iso));
  };

  /**
   * Moving the END DATE keeps the time of day where possible and re-picks an end on the new
   * day. Falls back to the first valid mark on that day, then to the same-day default, so
   * the field is never left holding an end the server would refuse.
   */
  const pickEndDate = (next: string) => {
    //With a fixed length the return day is derived, not chosen; the control is disabled.
    if (fixedLength != null) return;
    if (!start || !next) return;
    const [yy, mm, dd] = next.split("-").map(Number);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return;
    const target = zonedWallClockToUtc(yy, mm, dd, 12, 0, tz.zone);

    if (next === date) {
      onChange(start, endFor(dayWindows, start));
      return;
    }

    const options = valid(endOptionsOnDay(allWindows, start, target, bookableFrom));
    if (!options.length) {
      onChange(start, endFor(dayWindows, start));
      return;
    }
    //Hold the wall-clock time the operator already chose if that mark exists on the new day,
    //so nudging the return date by one day does not silently move a 16:00 return to 00:15.
    //Same trap as `endDate` above: an Invalid Date is truthy and tz.time formats via Intl.
    const wanted = usableDate(end) ? tz.time(end) : null;
    onChange(start, options.find((o) => tz.time(o) === wanted) ?? options[0]);
  };

  //`next` is already an offerable start under the school's rules, so the link and what
  //clicking it selects can never disagree.
  const jumpToNextAvailable = () => {
    if (!next) return;
    onDateChange(dateKeyInZone(next, tz.zone));
    onChange(next, endFor(windowsForDay(allWindows, next, bookableFrom), next));
  };

  const minDate = dateKeyInZone(bookableFrom, tz.zone);
  const maxDate = dateKeyInZone(addDays(now, advanceDays), tz.zone);
  const noSlots = !loading && day != null && starts.length === 0;
  const policyClauses = describeBookingTimePolicy(policy);

  return (
    <div data-doc-shot="overnight-booking-fields" className="space-y-2">
      <div
        className={
          allowMultiDay
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : "grid grid-cols-1 gap-3 sm:grid-cols-3"
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="smart-date">{allowMultiDay ? "Out on" : "Date"}</Label>
          <DatePickerField
            id="smart-date"
            invalid={invalidField === "smart-date"}
            value={date}
            min={minDate}
            max={maxDate}
            disabled={disabled || lockStart}
            onChange={onDateChange}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="smart-start">Start</Label>
            <DocsHint topic="available-times" />
          </div>
          <Select
            value={isoValue(start)}
            onValueChange={pickStart}
            disabled={disabled || lockStart || loading || starts.length === 0}
          >
            <SelectTrigger
              id="smart-start"
              aria-invalid={invalidField === "smart-start"}
              className="w-full"
            >
              <SelectValue placeholder={loading ? "Checking…" : "Select"} />
            </SelectTrigger>
            <SelectContent data-doc-shot="me-book-start-times" className="max-h-64">
              {starts.map((s) => (
                <SelectItem key={s.toISOString()} value={s.toISOString()}>
                  {tz.time(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {allowMultiDay && (
          <div className="space-y-1.5">
            <Label htmlFor="smart-end-date">Back on</Label>
            <DatePickerField
              id="smart-end-date"
              value={endDate}
              //Cannot return before it leaves, and cannot return after the free window it
              //starts in closes.
              min={date}
              max={maxEndDate}
              disabled={disabled || loading || !start || fixedLength != null}
              onChange={pickEndDate}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="smart-end">{allowMultiDay ? "Back at" : "End"}</Label>
          <Select
            value={isoValue(end)}
            onValueChange={pickEnd}
            //A fixed length settles the end, so the field reports it rather than asking.
            disabled={
              disabled || loading || !start || ends.length === 0 || fixedLength != null
            }
          >
            <SelectTrigger
              id="smart-end"
              aria-invalid={invalidField === "smart-end"}
              className="w-full"
            >
              <SelectValue placeholder={start ? "Select" : "Pick a start"} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {ends.map((e) => (
                <SelectItem key={e.toISOString()} value={e.toISOString()}>
                  {tz.time(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* The school's own rules, said where the times are chosen. The picker already
          honours the ones it can, and the availability lists already leave buffer
          time around neighbouring bookings, so this exists to explain why the lists
          look the way they do. Absent for a school that has set none, which is the
          default. */}
      {policyClauses.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Shared calendar rules: {policyClauses.join(", ")}.
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Checking availability…
        </p>
      ) : noSlots ? (
        <div
          data-doc-shot="time-picker-next-available"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <CalendarClock className="size-3.5 shrink-0" />
          <span>
            No open times on this date for everyone selected
            {policyClauses.length > 0
              ? " that fit your school's calendar rules."
              : "."}
          </span>
          {next && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={jumpToNextAvailable}
            >
              Next available: {tz.date(next)} · {tz.time(next)}
            </Button>
          )}
        </div>
      ) : (
        allWindows != null && (
          <p className="text-xs text-muted-foreground">
            Only times when the {resourceNoun} and everyone assigned are free are shown.
          </p>
        )
      )}
    </div>
  );
}
