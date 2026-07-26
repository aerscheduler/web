import { addDays, format, isSameDay, isToday, parseISO } from "date-fns";
import type { Reservation } from "@/types/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { END_HOUR, START_HOUR } from "./lane-grid";
import { BLOCK_CLASS, personnelNames, typeLabel } from "./meta";
import { packTracks } from "./pack";
import type { ReservationDraft } from "./reservation-form";

const HOUR_HEIGHT = 48; // px per hour
const HOURS = END_HOUR - START_HOUR;
const TOTAL_MIN = HOURS * 60;
const GRID_HEIGHT = HOURS * HOUR_HEIGHT;
const MIN_BLOCK = 20; // px

/** Minutes past START_HOUR for an instant (local time). */
function minutesInWindow(d: Date) {
  return (d.getHours() - START_HOUR) * 60 + d.getMinutes();
}

function hourLabel(h: number) {
  const period = h < 12 || h === 24 ? "a" : "p";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

/** Vertical top/height (px) for a reservation block, clamped to the window. */
function blockGeometry(r: Reservation): { top: number; height: number } {
  const totalMin = HOURS * 60;
  // Clamp BOTH ends to the visible window and derive height from the clamped
  // span — otherwise a reservation starting before START_HOUR keeps its full
  // duration and draws too tall (past its real end). Mirrors the lane grid.
  const s = Math.max(0, Math.min(totalMin, minutesInWindow(parseISO(r.start))));
  const e = Math.max(0, Math.min(totalMin, minutesInWindow(parseISO(r.end))));
  const top = (s / 60) * HOUR_HEIGHT;
  const height = Math.max(MIN_BLOCK, ((e - s) / 60) * HOUR_HEIGHT);
  return { top, height };
}

/** Desktop week view: a vertical time grid, one column per day. */
export function WeekTimeGrid({
  weekStart,
  reservations,
  onView,
  onCreate,
  onSelectDay,
}: {
  weekStart: Date;
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  /** Omitted for roles that may not create — the columns then aren't clickable. */
  onCreate?: (draft: ReservationDraft) => void;
  onSelectDay: (day: Date) => void;
}) {
  const canCreate = onCreate != null;
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const now = new Date();
  const nowMin = minutesInWindow(now);
  const showNow = nowMin >= 0 && nowMin <= TOTAL_MIN;

  return (
    <div className="max-h-[70vh] overflow-auto">
      <div className="grid min-w-[52rem] grid-cols-[auto_repeat(7,minmax(0,1fr))]">
        {/* Header row: corner + day headers (sticky top) */}
        <div className="sticky left-0 top-0 z-30 border-b border-r border-border bg-card" />
        {days.map((d) => (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onSelectDay(d)}
            className={cn(
              "sticky top-0 z-20 flex items-baseline justify-center gap-1.5 border-b border-l border-border bg-card px-2 py-2 text-sm transition-colors hover:bg-accent/50",
              isToday(d) && "bg-accent/40"
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {format(d, "EEE")}
            </span>
            <span
              className={cn(
                "tabular-nums",
                isToday(d) ? "font-semibold text-primary" : "text-foreground"
              )}
            >
              {format(d, "d")}
            </span>
          </button>
        ))}

        {/* Body row: hour gutter + day columns */}
        <div
          className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
          style={{ height: GRID_HEIGHT }}
        >
          {Array.from({ length: HOURS }).map((_, i) => (
            <div
              key={i}
              className="absolute right-1.5 pt-0.5 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: i * HOUR_HEIGHT }}
            >
              {hourLabel(START_HOUR + i)}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const items = reservations.filter((r) => isSameDay(parseISO(r.start), d));
          const { placed, tracks } = packTracks(items);
          const today = isToday(d);
          return (
            <div
              key={d.toISOString()}
              role={canCreate ? "button" : undefined}
              tabIndex={canCreate ? 0 : undefined}
              aria-label={canCreate ? `Book time on ${format(d, "EEEE, MMMM d")}` : undefined}
              onClick={
                canCreate
                  ? (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const hour = Math.min(
                        END_HOUR - 1,
                        Math.max(START_HOUR, START_HOUR + Math.floor(y / HOUR_HEIGHT))
                      );
                      const hh = String(hour).padStart(2, "0");
                      const eh = String(hour + 1).padStart(2, "0");
                      onCreate?.({ date: d, start: `${hh}:00`, end: `${eh}:00` });
                    }
                  : undefined
              }
              onKeyDown={
                canCreate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCreate?.({ date: d, start: "09:00", end: "10:00" });
                      }
                    }
                  : undefined
              }
              className={cn(
                "relative border-l border-border",
                canCreate &&
                  "cursor-copy focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              )}
              style={{
                height: GRID_HEIGHT,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_HEIGHT}px)`,
              }}
            >
              {today && showNow && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 h-px bg-destructive"
                  style={{ top: (nowMin / 60) * HOUR_HEIGHT }}
                  aria-hidden
                >
                  <span className="absolute -left-1 -top-1 size-2 rounded-full bg-destructive" />
                </div>
              )}
              {placed.map(({ r, track }) => {
                const { top, height } = blockGeometry(r);
                return (
                  <div
                    key={r.id}
                    className="absolute"
                    style={{
                      top,
                      height,
                      left: `${((track / tracks) * 100).toFixed(4)}%`,
                      width: `calc(${(100 / tracks).toFixed(4)}% - 2px)`,
                    }}
                  >
                    <WeekBlock r={r} onView={onView} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekBlock({ r, onView }: { r: Reservation; onView: (r: Reservation) => void }) {
  const names = personnelNames(r);
  const timeRange = `${format(parseISO(r.start), "h:mm a")} – ${format(parseISO(r.end), "h:mm a")}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onView(r);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          className={cn(
            "flex h-full w-full flex-col overflow-hidden rounded-md border border-l-2 px-1.5 py-0.5 text-left shadow-sm",
            BLOCK_CLASS[r.type]
          )}
        >
          <span className="truncate text-[11px] font-semibold leading-tight text-foreground">
            {r.title}
          </span>
          <span className="truncate text-[10px] leading-tight opacity-80 tabular-nums">
            {format(parseISO(r.start), "h:mm a")}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div className="font-medium">{r.title}</div>
          <div className="tabular-nums">{timeRange}</div>
          <div className="opacity-80">
            {typeLabel(r.type)}
            {names.length > 0 ? ` · ${names.join(", ")}` : ""}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
