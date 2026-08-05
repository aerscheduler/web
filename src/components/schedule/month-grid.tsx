import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { resourceLabel, type Reservation } from "@/types/api";
import { cn } from "@/lib/utils";
import { dateKeyInZone, minutesFromMidnightInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { highlightMatch } from "@/lib/highlight-match";
import { BORDER_L_CLASS, CHIP_CLASS } from "./meta";
import { dimClass, selectedClass, isMarked, type BoardMarks } from "./board-filters";
import type { ReservationDraft } from "./reservation-form";

const MAX_CHIPS = 3;

/**
 * Desktop month view: a fixed 6-week × 7-day grid. Cells never widen the page —
 * columns are `minmax(0)` and every chip truncates. Clicking empty space in a
 * cell books that day; a chip opens its reservation; the day number / "+N more"
 * drills into the day view.
 */
export function MonthGrid({
  month,
  reservations,
  onView,
  onCreate,
  onSelectDay,
  matchedIds,
  selectedId,
  query,
}: {
  month: Date;
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  /** Omitted for roles that may not create — the cells then aren't clickable. */
  onCreate?: (draft: ReservationDraft) => void;
  onSelectDay: (day: Date) => void;
  /** Block-filter marking — non-matches dim, never disappear. See `board-filters.ts`. */
  matchedIds?: Set<number> | null;
  selectedId?: number | null;
  query?: string;
}) {
  const marks: BoardMarks = { matchedIds: matchedIds ?? null, query: query ?? "", selectedId };
  const tz = useTimeZone();
  const canCreate = onCreate != null;
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
  const weekdays = days.slice(0, 7);

  const byDay = new Map<string, Reservation[]>();
  for (const r of reservations) {
    //The airport's calendar day, not the viewer's — a late-evening Mountain flight is
    //already tomorrow in UTC, and bucketing on the viewer's clock drops it in the wrong cell.
    //
    //EVERY day the booking occupies, not just the one it starts on. Bucketing on the start
    //alone put an aeroplane that was away Friday to Sunday in Friday's cell only, so the
    //Saturday and Sunday cells read as free — the same bug the week grid had, and the month
    //is where somebody looks to find a free weekend.
    const from = dateKeyInZone(r.start, tz.zone);
    const to = dateKeyInZone(r.end, tz.zone);
    //Walk by UTC midnights so the number of steps is exact regardless of daylight saving,
    //then format each back to a key. Capped because a corrupt row with a runaway end date
    //should not spin here; a booking cannot be made longer than the year-ahead horizon.
    const startMs = Date.parse(`${from}T00:00:00Z`);
    const endMs = Date.parse(`${to}T00:00:00Z`);
    const spanDays =
      Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.min(Math.max(0, Math.round((endMs - startMs) / 86_400_000)), 366)
        : 0;

    //A booking ending at exactly local midnight belongs to the day before, not to the day it
    //touches for zero minutes: a 9pm-to-midnight flight must fill one cell, not two. Asked on
    //the AIRPORT's clock, so it is right at any offset.
    const endsAtMidnight = spanDays > 0 && minutesFromMidnightInZone(r.end, tz.zone) === 0;
    const lastDay = endsAtMidnight ? spanDays - 1 : spanDays;

    for (let i = 0; i <= lastDay; i++) {
      const key = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(r);
      else byDay.set(key, [r]);
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.start.localeCompare(b.start));

  //A month cell only has room for MAX_CHIPS, so this is the one view where dimming alone
  //isn't enough — a match sitting fourth would be swallowed by "+N more" and the filter
  //would look like it found nothing. When filtering, float matches to the top of the cell
  //(chronological within each group, so the day still reads in order either side of the
  //split). The cell count is unchanged, so the day's real volume is still on screen.
  if (marks.matchedIds) {
    for (const list of byDay.values()) {
      list.sort((a, b) => {
        const am = isMarked(marks, a.id) ? 0 : 1;
        const bm = isMarked(marks, b.id) ? 0 : 1;
        return am - bm || a.start.localeCompare(b.start);
      });
    }
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      {/* Weekday header */}
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-border bg-card">
        {weekdays.map((d) => (
          <div
            key={d.toISOString()}
            className="truncate px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {format(d, "EEE")}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(format(d, "yyyy-MM-dd")) ?? [];
          const inMonth = isSameMonth(d, month);
          const today = isToday(d);
          const shown = items.slice(0, MAX_CHIPS);
          const extra = items.length - shown.length;

          return (
            <div
              key={d.toISOString()}
              role={canCreate ? "button" : undefined}
              tabIndex={canCreate ? 0 : undefined}
              aria-label={
                canCreate ? `Book a reservation on ${format(d, "EEEE, MMMM d")}` : undefined
              }
              onClick={canCreate ? () => onCreate?.({ date: d }) : undefined}
              onKeyDown={
                canCreate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCreate?.({ date: d });
                      }
                    }
                  : undefined
              }
              className={cn(
                "flex min-h-28 min-w-0 flex-col gap-1 border-b border-r border-border p-1.5 transition-colors last:border-r-0 [&:nth-child(7n)]:border-r-0",
                canCreate &&
                  "cursor-copy hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                !inMonth && "bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label={`Open ${format(d, "EEEE, MMMM d")}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDay(d);
                  }}
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs tabular-nums transition-colors hover:bg-accent",
                    today && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                    !today && !inMonth && "text-muted-foreground/50",
                    !today && inMonth && "text-foreground"
                  )}
                >
                  {format(d, "d")}
                </button>
              </div>

              <div className="min-w-0 space-y-1">
                {shown.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(r);
                    }}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1 rounded border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight",
                      BORDER_L_CLASS[r.type],
                      CHIP_CLASS[r.type],
                      dimClass(marks, r.id),
                      selectedClass(marks, r.id)
                    )}
                  >
                    <span className="shrink-0 tabular-nums opacity-80">
                      {format(parseISO(r.start), "h:mm")}
                    </span>
                    <span className="truncate font-medium text-foreground">
                      {/* Month cells have no resource lane either, and the stored title
                          is generic — lead with the aircraft so a day's chips are
                          distinguishable at a glance. */}
                      {highlightMatch(
                        r.resource ? `${resourceLabel(r.resource).name} · ${r.title}` : r.title,
                        marks.query
                      )}
                    </span>
                  </button>
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDay(d);
                    }}
                    className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
