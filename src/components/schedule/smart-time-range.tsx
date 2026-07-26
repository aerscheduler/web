import * as React from "react";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { CalendarClock, Loader2 } from "lucide-react";
import { useResourceAvailability, useUsersAvailability } from "@/features/queries";
import {
  defaultEnd,
  endOptions,
  intersectAvailability,
  withWindowRestored,
  isBookable,
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

export function SmartTimeRange({
  date,
  onDateChange,
  start,
  end,
  onChange,
  resourceId,
  personnelUserIds,
  disabled,
  restoreWindow = null,
  lockStart = false,
}: {
  /** "yyyy-MM-dd" of the selected day. */
  date: string;
  onDateChange: (date: string) => void;
  start: Date | null;
  end: Date | null;
  /** Emits the resolved start/end instants (or null while incomplete). */
  onChange: (start: Date | null, end: Date | null) => void;
  resourceId: number | null;
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
}) {
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

  const day = React.useMemo(() => {
    if (!date) return null;
    const parsed = parseISO(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [date]);

  const dayWindows = React.useMemo(
    () => (day ? windowsForDay(allWindows, day, now) : []),
    [allWindows, day, now]
  );
  const starts = React.useMemo(() => valid(startOptions(dayWindows)), [dayWindows]);
  const ends = React.useMemo(
    () => (start ? valid(endOptions(dayWindows, start)) : []),
    [dayWindows, start]
  );

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
    if (!end || !isBookable(dayWindows, start, end)) {
      onChange(start, defaultEnd(dayWindows, start));
    }
  }, [loading, start, end, starts, dayWindows, onChange]);

  const pickStart = (iso: string) => {
    const s = new Date(iso);
    onChange(s, defaultEnd(dayWindows, s));
  };
  const pickEnd = (iso: string) => {
    if (start) onChange(start, new Date(iso));
  };

  const jumpToNextAvailable = () => {
    const from = day ? startOfDay(day) : now;
    const slot = nextAvailable(allWindows, from, now);
    if (!slot) return;
    onDateChange(format(slot, "yyyy-MM-dd"));
    onChange(slot, defaultEnd(windowsForDay(allWindows, slot, now), slot));
  };

  const minDate = format(now, "yyyy-MM-dd");
  const maxDate = format(addDays(now, MAX_ADVANCE_DAYS), "yyyy-MM-dd");
  const noSlots = !loading && day != null && starts.length === 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="smart-date">Date</Label>
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
            <SelectContent className="max-h-64">
              {starts.map((s) => (
                <SelectItem key={s.toISOString()} value={s.toISOString()}>
                  {format(s, "h:mm a")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smart-end">End</Label>
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
                  {format(e, "h:mm a")}
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
              Next available: {format(next, "EEE, MMM d · h:mm a")}
            </Button>
          )}
        </div>
      ) : (
        allWindows != null && (
          <p className="text-xs text-muted-foreground">
            Only times when the aircraft and everyone assigned are free are shown.
          </p>
        )
      )}
    </div>
  );
}
