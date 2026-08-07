import * as React from "react";
import { addDays, startOfDay } from "date-fns";
import { dateKeyInZone, zonedWallClockToUtc } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { CalendarClock, Loader2 } from "lucide-react";
import { useResourceAvailability, useUsersAvailability } from "@/features/queries";
import {
  defaultEnd,
  endOptions,
  endOptionsOnDay,
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
 * only 15-minute slots during which everyone is simultaneously free — so an
 * invalid (double-booked or past) appointment can't be selected. Picking a start
 * auto-fills a valid end (default 1h, backing off to fit the free window).
 */
/** ISO string for a Select value; "" for null or an invalid Date. Prevents a bad
 * Date from crashing the render via `toISOString()` ("Invalid time value") — the
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
}: {
  /** "yyyy-MM-dd" of the selected day. */
  date: string;
  onDateChange: (date: string) => void;
  start: Date | null;
  end: Date | null;
  /** Emits the resolved start/end instants (or null while incomplete). */
  onChange: (start: Date | null, end: Date | null) => void;
  resourceId: number | null;
  /**
   * What to CALL the booked thing, lower-cased: "aircraft", "simulator", "room". A booking
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
  /** Lock the date and start — used once a flight has ramped out. */
  lockStart?: boolean;
  /**
   * Whether this school has turned multi-day bookings on. Off, the End field is a time on
   * the same day, exactly as before. On, a second date picker appears so a booking can run
   * to a later day, bounded by the free window it starts in.
   */
  allowMultiDay?: boolean;
}) {
  const tz = useTimeZone();
  // Captured once so the past-clamp / memo keys stay stable while the form is open.
  const now = React.useMemo(() => new Date(), []);
  const personnelKey = personnelUserIds.join(",");

  const resQ = useResourceAvailability(resourceId, { enabled: !disabled });
  const userResults = useUsersAvailability(personnelUserIds, { enabled: !disabled });

  const resUpdated = resQ.dataUpdatedAt;
  const usersUpdated = userResults.map((r) => r.dataUpdatedAt).join(",");
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
    if (resourceId != null) lists.push(resQ.data ? parseWindows(resQ.data) : null);
    userResults.forEach((r) => lists.push(r.data ? parseWindows(r.data) : null));
    // The reservation being edited books itself, so add its own slot back in.
    return withWindowRestored(intersectAvailability(lists), restoreWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, resUpdated, usersUpdated, personnelKey, restoreKey]);

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
    () => (day ? windowsForDay(allWindows, day, now) : []),
    [allWindows, day, now]
  );
  const starts = React.useMemo(() => valid(startOptions(dayWindows)), [dayWindows]);

  //The day the booking ENDS on, as "YYYY-MM-DD" at the field. Derived from the current end
  //rather than held as separate state, so it cannot drift out of step with it: whatever the
  //end instant is, the picker shows that instant's day. Defaults to the start's day, which
  //is what makes the whole multi-day path opt-in per booking as well as per school.
  //`usableDate`, not a truthiness check. An Invalid Date is an OBJECT, so `end ? …` lets it
  //through, and `dateKeyInZone` formats via Intl, which THROWS `RangeError: Invalid time
  //value` on a NaN time rather than returning anything. In a render that throw reaches the
  //error boundary and takes the whole booking form down with it — which it did, because this
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
    if (!spansDays) return valid(endOptions(dayWindows, start));
    return endDay ? valid(endOptionsOnDay(allWindows, start, endDay, now)) : [];
  }, [dayWindows, allWindows, start, spansDays, endDay, now]);

  //The furthest day this booking could end on, so a date that can only ever produce an
  //empty time list is not offerable. Bounded by the free window the START sits in, which is
  //what keeps a trip from being booked straight through somebody else's reservation.
  const maxEndDate = React.useMemo(() => {
    if (!allowMultiDay || !start) return date;
    const last = lastEndDay(allWindows, start, now);
    const horizon = addDays(now, MAX_ADVANCE_DAYS);
    const capped = last && last.getTime() < horizon.getTime() ? last : horizon;
    return dateKeyInZone(capped, tz.zone);
  }, [allowMultiDay, allWindows, start, now, date, tz.zone]);

  // The earliest bookable slot from the selected day onward (may be a later day).
  const next = React.useMemo(
    () => nextAvailable(allWindows, day ? startOfDay(day) : now, now),
    [allWindows, day, now]
  );

  // Reconcile the selection whenever the loaded availability changes (a refetch,
  // or the resource/personnel/date changed). If the start is no longer a valid
  // slot, clear both; if the start still holds but the window shrank under the
  // chosen end, refit the end to a valid one — otherwise a stale out-of-window
  // end could be submitted while the End field only *looks* empty.
  React.useEffect(() => {
    if (loading || !start) return;
    if (!starts.some((s) => s.getTime() === start.getTime())) {
      onChange(null, null);
      return;
    }
    //A multi-day end is judged against the unclipped windows. Checking it with `isBookable`
    //would call every valid trip unbookable, because that asks whether the end fits inside
    //the START's own day, which is precisely what a trip does not do. It would then "refit"
    //the end back to the same day on every render.
    const stillValid = spansDays
      ? isBookableAcrossDays(allWindows, start, end!, now)
      : !!end && isBookable(dayWindows, start, end);
    if (!stillValid) {
      onChange(start, defaultEnd(dayWindows, start));
    }
  }, [loading, start, end, starts, dayWindows, allWindows, spansDays, now, onChange]);

  const pickStart = (iso: string) => {
    const s = new Date(iso);
    onChange(s, defaultEnd(dayWindows, s));
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
    if (!start || !next) return;
    const [yy, mm, dd] = next.split("-").map(Number);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return;
    const target = zonedWallClockToUtc(yy, mm, dd, 12, 0, tz.zone);

    if (next === date) {
      onChange(start, defaultEnd(dayWindows, start));
      return;
    }

    const options = valid(endOptionsOnDay(allWindows, start, target, now));
    if (!options.length) {
      onChange(start, defaultEnd(dayWindows, start));
      return;
    }
    //Hold the wall-clock time the operator already chose if that mark exists on the new day,
    //so nudging the return date by one day does not silently move a 16:00 return to 00:15.
    //Same trap as `endDate` above: an Invalid Date is truthy and tz.time formats via Intl.
    const wanted = usableDate(end) ? tz.time(end) : null;
    onChange(start, options.find((o) => tz.time(o) === wanted) ?? options[0]);
  };

  const jumpToNextAvailable = () => {
    const from = day ? startOfDay(day) : now;
    const slot = nextAvailable(allWindows, from, now);
    if (!slot) return;
    onDateChange(dateKeyInZone(slot, tz.zone));
    onChange(slot, defaultEnd(windowsForDay(allWindows, slot, now), slot));
  };

  const minDate = dateKeyInZone(now, tz.zone);
  const maxDate = dateKeyInZone(addDays(now, MAX_ADVANCE_DAYS), tz.zone);
  const noSlots = !loading && day != null && starts.length === 0;

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
            value={date}
            min={minDate}
            max={maxDate}
            disabled={disabled || lockStart}
            onChange={onDateChange}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smart-start">Start</Label>
          <Select
            value={isoValue(start)}
            onValueChange={pickStart}
            disabled={disabled || lockStart || loading || starts.length === 0}
          >
            <SelectTrigger id="smart-start" className="w-full">
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
              disabled={disabled || loading || !start}
              onChange={pickEndDate}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="smart-end">{allowMultiDay ? "Back at" : "End"}</Label>
          <Select
            value={isoValue(end)}
            onValueChange={pickEnd}
            disabled={disabled || loading || !start || ends.length === 0}
          >
            <SelectTrigger id="smart-end" className="w-full">
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
          <span>No open times on this date for everyone selected.</span>
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
