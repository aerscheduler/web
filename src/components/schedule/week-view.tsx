import { addDays, format, isSameDay, isToday, parseISO } from "date-fns";
import { resourceLabel, type Reservation } from "@/types/api";
import { cn } from "@/lib/utils";
import { BORDER_L_CLASS } from "./meta";

/** 7-day overview: one column per day, reservations as compact chips. */
export function WeekView({
  weekStart,
  reservations,
  onView,
  onSelectDay,
}: {
  weekStart: Date;
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  onSelectDay: (day: Date) => void;
}) {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const byDay = days.map((d) =>
    [...reservations]
      .filter((r) => isSameDay(parseISO(r.start), d))
      .sort((a, b) => a.start.localeCompare(b.start))
  );

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[52rem] grid-cols-7 divide-x divide-border">
        {days.map((d, i) => (
          <div key={d.toISOString()} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelectDay(d)}
              className={cn(
                "flex w-full items-baseline justify-between gap-1 border-b border-border px-2.5 py-2 text-left transition-colors hover:bg-accent/50",
                isToday(d) && "bg-accent/40"
              )}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {format(d, "EEE")}
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  isToday(d) ? "font-semibold text-primary" : "text-foreground"
                )}
              >
                {format(d, "d")}
              </span>
            </button>
            <div className="min-h-24 space-y-1 p-1.5">
              {byDay[i].length === 0 ? (
                <div className="px-1 pt-2 text-center text-[11px] text-muted-foreground/60">—</div>
              ) : (
                byDay[i].map((r) => {
                  const res = r.resource ? resourceLabel(r.resource) : null;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onView(r)}
                      className={cn(
                        "block w-full rounded-md border border-l-4 border-border bg-card px-1.5 py-1 text-left shadow-sm transition-colors hover:bg-accent/50",
                        BORDER_L_CLASS[r.type]
                      )}
                    >
                      <div className="truncate text-[11px] font-medium tabular-nums text-muted-foreground">
                        {format(parseISO(r.start), "h:mm a")}
                      </div>
                      <div className="truncate text-xs font-medium">{r.title}</div>
                      {res && (
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {res.name}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
