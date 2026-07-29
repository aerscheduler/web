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
import { dateKeyInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { BORDER_L_CLASS, CHIP_CLASS } from "./meta";
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
}: {
  month: Date;
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  /** Omitted for roles that may not create — the cells then aren't clickable. */
  onCreate?: (draft: ReservationDraft) => void;
  onSelectDay: (day: Date) => void;
}) {
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
    const key = dateKeyInZone(r.start, tz.zone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(r);
    else byDay.set(key, [r]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.start.localeCompare(b.start));

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
                      CHIP_CLASS[r.type]
                    )}
                  >
                    <span className="shrink-0 tabular-nums opacity-80">
                      {format(parseISO(r.start), "h:mm")}
                    </span>
                    <span className="truncate font-medium text-foreground">
                      {/* Month cells have no resource lane either, and the stored title
                          is generic — lead with the aircraft so a day's chips are
                          distinguishable at a glance. */}
                      {r.resource ? `${resourceLabel(r.resource).name} · ${r.title}` : r.title}
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
