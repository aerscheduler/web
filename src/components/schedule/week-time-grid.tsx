import * as React from "react";
import { addDays, format, isToday } from "date-fns";
import { resourceLabel, type Reservation } from "@/types/api";
import { dateKeyInZone, daysBetweenDateKeys, minutesFromMidnightInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { highlightMatch } from "@/lib/highlight-match";
import {
  holdDragRefusalReason,
  type SlotOfferHold,
} from "@/lib/slot-offer-holds";
import { formatTimeInZone, formatTimeRangeInZone } from "@/lib/timezone";
import {
  closedHourMessage,
  hourLabel,
  hourWindow,
  isOpenHour,
  type FlyingDayFrame,
} from "./hours";
import { BLOCK_CLASS, personnelNames, typeLabel } from "./meta";
import { packTracks } from "./pack";
import { dimClass, selectedClass, type BoardMarks } from "./board-filters";
import type { ReservationDraft } from "./reservation-form";
import type { DragGeometry, DropZone, ScheduleDrag } from "./use-schedule-drag";
import { ResizeHandle, dragAriaLabel } from "./drag-affordances";

const HOUR_HEIGHT = 48; // px per hour
const MIN_BLOCK = 20; // px
/** One arrow-key press sideways = one day, expressed in the hook's 15-minute slots. */
const SLOTS_PER_DAY = (24 * 60) / 15;
const KEY_HINT_MOVE =
  "Up and down move it 15 minutes, left and right move it a day; Shift with up or down changes the end.";
const KEY_HINT_END = "Shift with up or down changes the end.";

/**
 * Minutes past the window's first hour for an instant, measured on the AIRPORT's clock.
 *
 * Was `d.getHours()` (the viewer's clock) which is what slid the whole column an hour when
 * the board was opened from another zone.
 */
function minutesInWindow(d: Date | string, zone: string, startHour: number, dayKey?: string) {
  // Without a dayKey this is the instant's own day, as it always was. With one, the count is
  // anchored to the COLUMN's day, so a booking that began on Friday reads as negative in
  // Saturday's column instead of appearing at its Friday clock time all over again. Whole days
  // are added as days x 1440 while the position within the day stays a wall-clock count, so a
  // block still lines up with the hour ruler across a daylight-saving change.
  const offsetDays = dayKey ? daysBetweenDateKeys(dayKey, dateKeyInZone(d, zone)) : 0;
  return offsetDays * 1440 + minutesFromMidnightInZone(d, zone) - startHour * 60;
}

/** Vertical top/height (px) for a reservation block, clamped to the window. */
function blockGeometry(
  r: Reservation,
  zone: string,
  startHour: number,
  totalMin: number,
  dayKey?: string
): { top: number; height: number } {
  // Clamp BOTH ends to the visible window and derive height from the clamped
  // span, otherwise a reservation starting before the window keeps its full
  // duration and draws too tall (past its real end). Mirrors the lane grid.
  const s = Math.max(0, Math.min(totalMin, minutesInWindow(r.start, zone, startHour, dayKey)));
  const e = Math.max(0, Math.min(totalMin, minutesInWindow(r.end, zone, startHour, dayKey)));
  const top = (s / 60) * HOUR_HEIGHT;
  const height = Math.max(MIN_BLOCK, ((e - s) / 60) * HOUR_HEIGHT);
  return { top, height };
}

/**
 * Does this booking occupy any of the column for `dayKey`?
 *
 * Replaces a filter on the START day alone. That was right while every booking began and
 * ended on one day, and silently wrong the moment one could not: an aircraft booked out
 * Friday to Sunday appeared in Friday's column only, and Saturday showed it as free.
 *
 * Measured against the VISIBLE window rather than the calendar day, so a booking ending
 * exactly at midnight does not leave a stray sliver at the top of the next column.
 */
function occupiesDay(
  r: Reservation,
  zone: string,
  startHour: number,
  totalMin: number,
  dayKey: string
): boolean {
  const s = minutesInWindow(r.start, zone, startHour, dayKey);
  const e = minutesInWindow(r.end, zone, startHour, dayKey);
  return e > 0 && s < totalMin;
}

/** Desktop week view: a vertical time grid, one column per day. */
export function WeekTimeGrid({
  weekStart,
  reservations,
  slotOfferHolds = [],
  onView,
  onCreate,
  onSelectDay,
  onOfferHoldClick,
  matchedIds,
  selectedId,
  query,
  drag,
  flyingDayFrame,
}: {
  weekStart: Date;
  reservations: Reservation[];
  /** Pending soft-holds painted into the day columns (resource lanes live on Day view). */
  slotOfferHolds?: SlotOfferHold[];
  /** School flying-day frame from booking policy. */
  flyingDayFrame?: FlyingDayFrame;
  onView: (r: Reservation) => void;
  /** Omitted for roles that may not create, the columns then aren't clickable. */
  onCreate?: (draft: ReservationDraft) => void;
  onSelectDay: (day: Date) => void;
  onOfferHoldClick?: (hold: SlotOfferHold) => void;
  /** Block-filter marking, non-matches dim, never disappear. See `board-filters.ts`. */
  matchedIds?: Set<number> | null;
  selectedId?: number | null;
  query?: string;
  /** Drag-to-reschedule; here a sideways drag changes the DAY. See `use-schedule-drag.ts`. */
  drag?: ScheduleDrag;
}) {
  const marks: BoardMarks = { matchedIds: matchedIds ?? null, query: query ?? "", selectedId };
  const tz = useTimeZone();
  const canCreate = onCreate != null;
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const columnRefs = React.useRef(new Map<string, HTMLElement>());

  //Which day column the pointer is over. Only X matters: the vertical axis is time, and the
  //hook already turns that into a delta.
  const hitTest = React.useCallback((x: number, _y: number): DropZone | null => {
    for (const [dayKey, el] of columnRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right) return { dayKey };
    }
    return null;
  }, []);

  const geom = React.useMemo<DragGeometry>(
    () => ({ axis: "y", pxPerMin: HOUR_HEIGHT / 60, scrollRef, hitTest }),
    [hitTest]
  );

  //LAYOUT comes from the committed reservations, never the live drag, see the same note in
  //lane-grid.tsx. Packing a previewed block through `packTracks` split the column into extra
  //tracks the moment it overlapped something, which shuffled and shrank every other booking
  //in that day just as you were aiming at one of them.
  const drawn = reservations;

  // Computed over the WHOLE week, not per column, so all seven days share one time axis, then
  // buffered on both sides so the grid never ends flush against a block. Hours outside the
  // school's flying day are shaded rather than withheld, see `closedBands`.
  const win = hourWindow(drawn, tz.zone, undefined, slotOfferHolds, flyingDayFrame);
  const { startHour, endHour, frameStartHour, frameEndHour } = win;
  //Where the keyboard path starts a booking: mid-morning, unless the school isn't open then.
  const kbHour = Math.min(Math.max(frameStartHour, 9), frameEndHour - 1);
  const kbStart = `${String(kbHour).padStart(2, "0")}:00`;
  const kbEnd = `${String(kbHour + 1).padStart(2, "0")}:00`;
  const hours = endHour - startHour;
  const totalMin = hours * 60;
  const gridHeight = hours * HOUR_HEIGHT;
  //The hours the school isn't open: the scroll buffer at each end, plus any hour a booking
  //pushed the window into past closing. A 24-hour flying day produces neither band.
  const closedBands = [
    { fromHour: startHour, toHour: Math.min(frameStartHour, endHour) },
    { fromHour: Math.max(frameEndHour, startHour), toHour: endHour },
  ].filter((b) => b.toHour > b.fromHour);
  const now = new Date();
  const nowMin = minutesInWindow(now, tz.zone, startHour);
  const showNow = nowMin >= 0 && nowMin <= totalMin;

  //The carried block leaves an outline in its committed slot and is redrawn floating over
  //whichever day column the pointer is on.
  const held = drag?.active?.moved ? drag.active : null;
  const heldPreview = held && drag ? drag.previewOf(held.reservation) : null;
  const heldDayKey = held ? dateKeyInZone(held.start, tz.zone) : null;

  return (
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto">
      {/* The gutter column needs an EXPLICIT width: every hour label inside it is absolutely
          positioned, so an `auto` track has no in-flow content to measure and collapses to the
          1px border, the labels then overflow left and get clipped by the scroll container. */}
      <div className="grid min-w-[52rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
        {/* Header row: corner + day headers (sticky top) */}
        <div className="sticky left-0 top-0 z-30 border-b border-r border-border bg-card" />
        {days.map((d) => (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onSelectDay(d)}
            className={cn(
              "sticky top-0 z-20 flex items-baseline justify-center gap-1.5 border-b border-l border-border bg-card px-2 py-1.5 text-xs transition-colors hover:bg-accent/50",
              isToday(d) && "bg-accent/40"
            )}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {format(d, "EEE")}
            </span>
            {/* Today is already marked by the tinted cell, so the date only needs a little
                extra weight. It used to be printed in the brand blue, which read as a link
                rather than as today. */}
            <span
              className={cn("tabular-nums text-foreground", isToday(d) && "font-semibold")}
            >
              {format(d, "d")}
            </span>
          </button>
        ))}

        {/* Body row: hour gutter + day columns */}
        <div
          className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
          style={{ height: gridHeight }}
        >
          {closedBands.map((band) => (
            <div
              key={`closed-${band.fromHour}`}
              className="absolute inset-x-0 bg-muted/60"
              style={{
                top: (band.fromHour - startHour) * HOUR_HEIGHT,
                height: (band.toHour - band.fromHour) * HOUR_HEIGHT,
              }}
              aria-hidden
            />
          ))}
          {/* One more label than there are hour bands: the closing hour gets its own, lifted
              to sit above the bottom edge rather than off the end of the gutter. Without it a
              booking in the last band ran out under nothing, the grid simply stopped at an
              unnamed time. */}
          {Array.from({ length: hours + 1 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "absolute right-1.5 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground",
                i === hours ? "-translate-y-full pb-0.5" : "pt-0.5"
              )}
              style={{ top: i * HOUR_HEIGHT }}
            >
              {hourLabel(startHour + i)}
            </div>
          ))}
        </div>

        {days.map((d) => {
          //Which column a booking belongs in is the airport's calendar day, not the
          //viewer's. A 9pm Mountain flight is already tomorrow in UTC and two days on in
          //Tokyo; isSameDay() on the viewer's clock puts it in the wrong column entirely,
          //which is a worse failure than drawing it at the wrong height.
          const dayKey = format(d, "yyyy-MM-dd");
          //Every day the booking occupies, not only the one it starts on, so an aircraft
          //away for the weekend reads as unavailable on the Saturday too.
          const items = drawn.filter((r) => occupiesDay(r, tz.zone, startHour, totalMin, dayKey));
          const { placed, tracks } = packTracks(items);
          const today = isToday(d);
          const isDropColumn = heldDayKey === dayKey;
          return (
            <div
              key={d.toISOString()}
              ref={(el) => {
                if (el) columnRefs.current.set(dayKey, el);
                else columnRefs.current.delete(dayKey);
              }}
              role={canCreate ? "button" : undefined}
              tabIndex={canCreate ? 0 : undefined}
              aria-label={canCreate ? `Book time on ${format(d, "EEEE, MMMM d")}` : undefined}
              onClick={
                canCreate
                  ? (e) => {
                      //A drop that finished over empty column space still lands a click here.
                      if (drag?.consumeClick()) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const hour = Math.min(
                        endHour - 1,
                        Math.max(startHour, startHour + Math.floor(y / HOUR_HEIGHT))
                      );
                      //The shaded hours are drawn so a late booking has somewhere to sit and
                      //so there is room to scroll, not so they can be booked: the server
                      //refuses a same-day booking outside the flying day.
                      if (!isOpenHour(win, hour)) {
                        toast.message(closedHourMessage(win));
                        return;
                      }
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
                        onCreate?.({ date: d, start: kbStart, end: kbEnd });
                      }
                    }
                  : undefined
              }
              className={cn(
                "relative border-l border-border",
                canCreate &&
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                isDropColumn && "bg-primary/5"
              )}
              style={{
                height: gridHeight,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_HEIGHT}px)`,
              }}
            >
              {closedBands.map((band) => (
                <div
                  key={`closed-${band.fromHour}`}
                  className="pointer-events-none absolute inset-x-0 z-0 bg-muted/40"
                  style={{
                    top: (band.fromHour - startHour) * HOUR_HEIGHT,
                    height: (band.toHour - band.fromHour) * HOUR_HEIGHT,
                  }}
                  aria-hidden
                />
              ))}
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
                const { top, height } = blockGeometry(r, tz.zone, startHour, totalMin, dayKey);
                const style = {
                  top,
                  height,
                  left: `${((track / tracks) * 100).toFixed(4)}%`,
                  width: `calc(${(100 / tracks).toFixed(4)}% - 2px)`,
                };
                //The block being carried stays in the layout as an outline, so the column
                //never re-packs mid-drag.
                if (held?.reservation.id === r.id) return <WeekGhost key={r.id} style={style} />;
                return (
                  <div key={r.id} className="absolute" style={style}>
                    <WeekBlock r={r} onView={onView} marks={marks} drag={drag} geom={geom} />
                  </div>
                );
              })}
              {slotOfferHolds
                .filter((hold) => occupiesDay(
                  { start: hold.start, end: hold.end } as Reservation,
                  tz.zone,
                  startHour,
                  totalMin,
                  dayKey
                ))
                .map((hold) => {
                  const { top, height } = blockGeometry(
                    { start: hold.start, end: hold.end } as Reservation,
                    tz.zone,
                    startHour,
                    totalMin,
                    dayKey
                  );
                  return (
                    <WeekOfferHoldBlock
                      key={`hold-${hold.id}`}
                      hold={hold}
                      zone={tz.zone}
                      style={{ top, height, left: 2, right: 2 }}
                      onClick={onOfferHoldClick}
                      drag={drag}
                    />
                  );
                })}
              {/* The carried block, painted last so it sits over whatever is already in this
                  column rather than displacing it. */}
              {heldPreview && heldDayKey === dayKey && (
                <div
                  className="absolute inset-x-0"
                  style={blockGeometry(heldPreview, tz.zone, startHour, totalMin, dayKey)}
                >
                  <WeekBlock r={heldPreview} onView={onView} marks={marks} drag={drag} geom={geom} floating />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekOfferHoldBlock({
  hold,
  zone,
  style,
  onClick,
  drag,
}: {
  hold: SlotOfferHold;
  zone: string;
  style: React.CSSProperties;
  onClick?: (hold: SlotOfferHold) => void;
  drag?: ScheduleDrag;
}) {
  const label =
    hold.purpose === "instructor_confirm"
      ? `Confirm: ${hold.offeredToName}`
      : `Offer: ${hold.offeredToName}`;
  const detail = `${formatTimeRangeInZone(hold.start, hold.end, zone)}. Expires ${formatTimeInZone(
    hold.holdUntil,
    zone
  )}.`;
  const refuseReason = holdDragRefusalReason(hold);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "absolute z-[2] flex items-center overflow-hidden rounded-md border border-dashed",
            "border-amber-600/60 bg-amber-50 px-1.5 text-left shadow-sm",
            "dark:border-amber-500/50 dark:bg-amber-950",
            "cursor-pointer"
          )}
          style={style}
          aria-label={`${label}. ${detail} Can't be rescheduled: ${refuseReason}`}
          onPointerDown={
            drag
              ? (e) => {
                  e.stopPropagation();
                  drag.refuse(e, refuseReason);
                }
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation();
            if (drag?.consumeClick()) return;
            onClick?.(hold);
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold leading-tight text-foreground">
              {label}
            </div>
            <div className="truncate text-[11px] leading-tight opacity-80">Pending</div>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="max-w-[16rem] text-xs">
          <div className="font-medium">{label}</div>
          <div className="tabular-nums">{detail}</div>
          <div className="mt-1 opacity-80">
            Pending offer: this time is not free to book until the offer ends or is withdrawn.
          </div>
          <div className="mt-1 border-t border-border/50 pt-1 opacity-90">{refuseReason}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function WeekGhost({ style }: { style: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-md border border-dashed border-muted-foreground/50 bg-muted/30"
      style={style}
    />
  );
}

function WeekBlock({
  r,
  onView,
  marks,
  drag,
  geom,
  floating,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  marks: BoardMarks;
  drag?: ScheduleDrag;
  geom: DragGeometry;
  /** The carried copy drawn over the board: lifted, inert, and without its own controls. */
  floating?: boolean;
}) {
  const tz = useTimeZone(r.location);
  const names = personnelNames(r);
  const timeRange = tz.range(r.start, r.end);
  // The week view has no resource lane to read the aircraft off, and a stored title is
  // generic ("Dual Flight"), so without this the week is a wall of identical blocks.
  // resourceLabel covers simulators and rooms too.
  const aircraft = r.resource ? resourceLabel(r.resource).name : null;

  const ability = drag?.abilityFor(r);
  const held = floating ? (drag?.active ?? null) : null;
  const saving = !floating && drag?.pendingId === r.id;
  const grabbable = Boolean(!floating && drag && ability?.move);

  const body = (
    <button
      type="button"
      aria-hidden={floating || undefined}
      tabIndex={floating ? -1 : undefined}
      aria-label={
        floating
          ? undefined
          : dragAriaLabel(r, timeRange, ability, ability?.move ? KEY_HINT_MOVE : KEY_HINT_END)
      }
      onPointerDown={
        //Wired even when this booking can't be moved, see the note in lane-grid.tsx.
        drag && !floating
          ? (e) => {
              if ((e.target as HTMLElement).closest("[data-drag-exempt]")) return;
              drag.begin(e, r, "move", geom);
            }
          : undefined
      }
      onClick={(e) => {
        if (floating) return;
        e.stopPropagation();
        if (drag?.consumeClick()) return;
        onView(r);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          return;
        }
        if (!drag || floating) return;
        //Up/down is time, left/right is the day, the same two axes the pointer has.
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          drag.nudge(r, e.shiftKey ? "resize-end" : "move", e.key === "ArrowUp" ? -1 : 1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          drag.nudge(r, "move", e.key === "ArrowLeft" ? -SLOTS_PER_DAY : SLOTS_PER_DAY);
        }
      }}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-md border border-l-2 px-1.5 py-0.5 text-left shadow-sm transition-colors",
        BLOCK_CLASS[r.type],
        dimClass(marks, r.id),
        selectedClass(marks, r.id),
        grabbable ? "cursor-grab select-none active:cursor-grabbing" : "cursor-pointer",
        floating && "pointer-events-none cursor-grabbing opacity-95 shadow-lg ring-2 ring-primary/70",
        floating && held?.reason && "ring-destructive",
        saving && "animate-pulse"
      )}
    >
      {drag && !floating && ability?.resizeStart && (
        <ResizeHandle
          axis="y"
          side="start"
          onPointerDown={(e) => drag.begin(e, r, "resize-start", geom)}
        />
      )}
      {drag && !floating && ability?.resizeEnd && (
        <ResizeHandle axis="y" side="end" onPointerDown={(e) => drag.begin(e, r, "resize-end", geom)} />
      )}
      <span className="truncate text-[11px] font-semibold leading-tight text-foreground">
        {highlightMatch(aircraft ? `${aircraft} · ${r.title}` : r.title, marks.query)}
      </span>
      <span className="truncate text-[10px] leading-tight opacity-80 tabular-nums">
        {floating ? timeRange : tz.time(r.start)}
      </span>
    </button>
  );

  //No tooltip on the carried copy, the live time and any refusal ride the pointer-following
  //callout instead.
  if (floating) return body;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent>
        <div className="max-w-[16rem] text-xs">
          <div className="font-medium">{aircraft ? `${aircraft} · ${r.title}` : r.title}</div>
          <div className="tabular-nums">{timeRange}</div>
          <div className="opacity-80">
            {typeLabel(r.type)}
            {names.length > 0 ? ` · ${names.join(", ")}` : ""}
          </div>
          {drag && ability?.reason && (
            <div className="mt-1 border-t border-border/50 pt-1 opacity-90">{ability.reason}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

