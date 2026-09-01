import * as React from "react";
import { format } from "date-fns";
import { resourceLabel, type Reservation, type Resource } from "@/types/api";
import {
  dateKeyInZone,
  daysBetweenDateKeys,
  formatTimeInZone,
  formatTimeRangeInZone,
  minutesFromMidnightInZone,
} from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import {
  holdDragRefusalReason,
  holdOverlaps,
  type SlotOfferHold,
} from "@/lib/slot-offer-holds";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { highlightMatch } from "@/lib/highlight-match";
import {
  closedHourMessage,
  hourLabel,
  hourWindow,
  isOpenHour,
  type FlyingDayFrame,
} from "./hours";
import { BLOCK_CLASS, personnelNames, resourceIcon, typeLabel } from "./meta";
import { packTracks } from "./pack";
import { ReservationMenu } from "./reservation-menu";
import { dimClass, selectedClass, crewLabel, type BoardMarks } from "./board-filters";
import type { ReservationDraft } from "./reservation-form";
import { typeForResource } from "./reservation-shared";
import type { DragGeometry, DropZone, ScheduleDrag } from "./use-schedule-drag";
import { ResizeHandle, dragAriaLabel } from "./drag-affordances";
import { instantAtDayMinutes } from "./drag-rules";

const HOUR_WIDTH = 68; // px
const LABEL_WIDTH = 176; // px
const TRACK_HEIGHT = 46; // px
const TRACK_GAP = 4; // px
const LANE_PAD_Y = 8; // px
/** Arrow-key hint spoken on a draggable block. */
const KEY_HINT_MOVE = "Arrow keys move it 15 minutes; Shift with arrow keys changes the end.";
const KEY_HINT_END = "Shift with arrow keys changes the end.";

/**
 * Minutes past the window's first hour, measured on the AIRPORT's clock (unclamped).
 *
 * This used to read `d.getHours()` (the viewer's clock) which is what made the whole board
 * slide an hour when a dispatcher opened it from another zone. The instant is unchanged; only
 * the clock we measure it against is now the right one.
 *
 * `dayKey` anchors the count to the DISPLAYED day rather than to the instant's own day, which
 * is what a multi-day booking needs: an aircraft out Friday to Sunday must read as -900 on
 * Saturday, not as 15:00 again. The day difference is added as whole days times 1440 while the
 * position WITHIN the day stays a wall-clock count, so the block still lines up with the hour
 * ruler on the two days a year the clocks change.
 */
function minutesInWindow(iso: string, zone: string, startHour: number, dayKey: string) {
  const offsetDays = daysBetweenDateKeys(dayKey, dateKeyInZone(iso, zone));
  return offsetDays * 1440 + minutesFromMidnightInZone(iso, zone) - startHour * 60;
}

/** Horizontal geometry for one block: left + width in px along the hour ruler. */
function laneBlockGeometry(
  r: Reservation,
  zone: string,
  startHour: number,
  totalMin: number,
  dayKey: string
): { leftPx: number; widthPx: number } {
  const s = minutesInWindow(r.start, zone, startHour, dayKey);
  const e = minutesInWindow(r.end, zone, startHour, dayKey);
  const cs = Math.max(0, Math.min(totalMin, s));
  const ce = Math.max(0, Math.min(totalMin, e));
  if (ce <= 0 || cs >= totalMin || ce <= cs) {
    // Now only reachable by a booking with no overlap with this day at all: the window grows
    // to fit its reservations, and one that runs past midnight is clamped to the day's edges
    // above rather than falling in here. Pin it to the nearest edge rather than dropping it.
    const left = cs >= totalMin ? totalMin - 30 : 0;
    return { leftPx: (left / 60) * HOUR_WIDTH, widthPx: 28 };
  }
  return {
    leftPx: (cs / 60) * HOUR_WIDTH,
    widthPx: Math.max(28, ((ce - cs) / 60) * HOUR_WIDTH),
  };
}

function laneHeight(tracks: number) {
  return LANE_PAD_Y * 2 + tracks * TRACK_HEIGHT + (tracks - 1) * TRACK_GAP;
}

type Row = { key: string; resource: Resource | null; items: Reservation[] };

/** Desktop resource-lane board: rows = resources, columns = hours of the day. */
export function LaneGrid({
  day,
  resources,
  reservations,
  slotOfferHolds = [],
  onView,
  onEdit,
  onCancel,
  onCreate,
  onOfferHoldClick,
  matchedIds,
  selectedId,
  query,
  drag,
  flyingDayFrame,
}: {
  day: Date;
  resources: Resource[];
  reservations: Reservation[];
  /** Pending slot-offer soft holds for this org (resource lanes). */
  slotOfferHolds?: SlotOfferHold[];
  /** School flying-day frame from booking policy. */
  flyingDayFrame?: FlyingDayFrame;
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  /** Omitted for roles that may not create. The lanes then aren't clickable. */
  onCreate?: (draft: ReservationDraft) => void;
  /** Open that offer's detail when a hold block is clicked. */
  onOfferHoldClick?: (hold: SlotOfferHold) => void;
  /**
   * Block-filter marking. Non-matches are DIMMED, never removed, the lane geometry has to
   * keep telling the truth about what's occupied, or a dispatcher books over a real flight
   * because the filter made the slot look free. See `board-filters.ts`.
   */
  matchedIds?: Set<number> | null;
  selectedId?: number | null;
  query?: string;
  /**
   * Drag-to-reschedule. Omitted on a read-only board; per-reservation permission is still
   * decided inside (a member can drag their own flight but not somebody else's).
   */
  drag?: ScheduleDrag;
}) {
  const marks: BoardMarks = { matchedIds: matchedIds ?? null, query: query ?? "", selectedId };
  const tz = useTimeZone();
  const canCreate = onCreate != null;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  //Lane rects, kept fresh by React on every render, so a cross-lane drag can ask which row
  //the pointer is over without re-querying the DOM by selector.
  const laneRefs = React.useRef(new Map<string, { el: HTMLElement; zone: DropZone }>());

  const hitTest = React.useCallback((_x: number, y: number): DropZone | null => {
    for (const { el, zone } of laneRefs.current.values()) {
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return zone;
    }
    return null;
  }, []);

  const geom = React.useMemo<DragGeometry>(
    () => ({ axis: "x", pxPerMin: HOUR_WIDTH / 60, scrollRef, hitTest }),
    [hitTest]
  );

  //The board's LAYOUT is computed from the committed reservations, never from the live drag
  //position. That is deliberate: `packTracks` gives overlapping bookings their own track, so
  //previewing the drag through it meant that the moment you held a block over another one
  //the lane grew a second track, the row got taller and the booking you were aiming at slid
  //out from under the cursor. Freezing the layout keeps every other block exactly where it
  //was; the held one is drawn separately, floating over the top (see `heldRowKey` below).
  const drawn = reservations;

  const byResource = new Map<number, Reservation[]>();
  const unassigned: Reservation[] = [];
  for (const r of drawn) {
    // Group by the nested resource object's id, NOT the FK_resourceId scalar:
    // the server's stripForeignKeyFromData middleware deletes every FK_* field
    // from API responses, so r.FK_resourceId is always undefined here (which
    // would drop every reservation into "Unassigned"). The `resource` relation
    // survives the strip, and its id matches the lane row keys. Mirrors Flutter.
    const rid = r.resource?.id;
    if (rid == null) {
      unassigned.push(r);
      continue;
    }
    const bucket = byResource.get(rid);
    if (bucket) bucket.push(r);
    else byResource.set(rid, [r]);
  }

  const rows: Row[] = resources.map((res) => ({
    key: `res-${res.id}`,
    resource: res,
    items: byResource.get(res.id) ?? [],
  }));

  // Reservations on a resource that has no lane, either the caller filtered
  // the lane out (rooms/sims are hidden from renters and technicians) or the
  // fleet list doesn't know it. The board is a view-only mirror of the whole
  // org, so those still get drawn: they fall into the catch-all row rather than
  // disappearing with their lane.
  const laneIds = new Set(resources.map((res) => res.id));
  const offLane = [...byResource.entries()]
    .filter(([id]) => !laneIds.has(id))
    .flatMap(([, items]) => items);
  const leftovers = [...unassigned, ...offLane].sort((a, b) => a.start.localeCompare(b.start));
  if (leftovers.length > 0) {
    rows.push({ key: "other", resource: null, items: leftovers });
  }
  // Only "Unassigned" when it really is: an off-lane booking does have a resource.
  const leftoverLabel = offLane.length > 0 ? "Other" : "Unassigned";

  // Widened past the default 6a–10p by whatever this day's reservations need, so an early or
  // late booking gets its own hour instead of collapsing onto the edge of the ruler, then
  // buffered on both sides so the ruler never stops flush against a block. Hours outside the
  // school's flying day are shaded rather than withheld, see `closedBands` below.
  //The displayed day, as the key both the ruler and the block geometry measure against.
  const dayKey = format(day, "yyyy-MM-dd");
  const win = hourWindow(drawn, tz.zone, dayKey, slotOfferHolds, flyingDayFrame);
  const { startHour, endHour, frameStartHour, frameEndHour } = win;
  //Where the keyboard path starts a booking: mid-morning, unless the school isn't open then.
  const kbHour = Math.min(Math.max(frameStartHour, 9), frameEndHour - 1);
  const kbStart = `${String(kbHour).padStart(2, "0")}:00`;
  const kbEnd = `${String(kbHour + 1).padStart(2, "0")}:00`;
  const hours = endHour - startHour;
  const totalMin = hours * 60;
  const laneWidth = hours * HOUR_WIDTH;
  //The hours the school isn't open, drawn but shaded: the scroll buffer at each end, plus any
  //hour a booking pushed the window into past closing. Shading is what keeps the wider window
  //honest, the board still says where the flying day is, it just no longer stops there. A
  //24-hour flying day produces neither band.
  const closedBands = [
    { fromHour: startHour, toHour: Math.min(frameStartHour, endHour) },
    { fromHour: Math.max(frameEndHour, startHour), toHour: endHour },
  ].filter((b) => b.toHour > b.fromHour);
  //"Is the selected day today" is asked at the AIRPORT, not here. A dispatcher opening the
  //board from Tokyo is looking at the school's day, so the now-line belongs on the school's
  //today. `day` is a picked calendar date, so its own local components ARE the date.
  const isToday = dateKeyInZone(new Date(), tz.zone) === dayKey;
  const nowMin = isToday ? minutesInWindow(new Date().toISOString(), tz.zone, startHour, dayKey) : -1;
  const showNow = nowMin >= 0 && nowMin <= totalMin;

  //The held block leaves an outline in its committed slot (rendered in place of itself, so
  //the lane keeps the same shape) and is redrawn floating over whichever lane the pointer is
  //on. A target that isn't a drawn lane falls into the catch-all row, same as anything else.
  const held = drag?.active?.moved ? drag.active : null;
  const heldPreview = held && drag ? drag.previewOf(held.reservation) : null;
  const heldRowKey = held
    ? held.resourceId != null && laneIds.has(held.resourceId)
      ? `res-${held.resourceId}`
      : "other"
    : null;

  return (
    <div ref={scrollRef} data-doc-shot="schedule-day-board" className="h-full min-h-0 overflow-auto">
      <div style={{ minWidth: LABEL_WIDTH + laneWidth }}>
        {/* Header: hour ruler (sticky while scrolling resource lanes) */}
        <div className="sticky top-0 z-30 flex border-b border-border bg-card">
          <div
            className="sticky left-0 z-40 shrink-0 border-r border-border bg-card px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            style={{ width: LABEL_WIDTH }}
          >
            Resource
          </div>
          <div className="relative" style={{ width: laneWidth, height: 32 }}>
            {closedBands.map((band) => (
              <div
                key={`closed-${band.fromHour}`}
                className="absolute inset-y-0 bg-muted/60"
                style={{
                  left: (band.fromHour - startHour) * HOUR_WIDTH,
                  width: (band.toHour - band.fromHour) * HOUR_WIDTH,
                }}
                aria-hidden
              />
            ))}
            {Array.from({ length: hours + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full text-[11px] tabular-nums text-muted-foreground"
                style={{ left: i * HOUR_WIDTH }}
              >
                {/* Ticks are centred on their gridline, but the two on the ruler's own edges
                    can't be: centring the first slides half the label under the sticky
                    Resource column (which clipped "12 AM" down to "AM"), and centring the last
                    hangs it off the end of the scroll area. Align those two inwards.
                    The closing tick is LABELLED, not blank. It used to be dropped, which left
                    a booking in the final hour sitting under nothing: the board ended at some
                    unnamed time just past the last label. */}
                <span
                  className={cn(
                    //`whitespace-nowrap` is load-bearing: the tick is a zero-width absolutely
                    //positioned box, so "10 AM" wrapped to two lines and the second one hung
                    //below the ruler, where it showed through beside the sticky Resource
                    //column instead of scrolling under it.
                    "absolute whitespace-nowrap pt-2",
                    i === 0 ? "left-0" : i === hours ? "-translate-x-full" : "-translate-x-1/2"
                  )}
                >
                  {hourLabel(startHour + i)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Body: one lane per resource */}
        <div className="relative">
          {closedBands.map((band) => (
            <div
              key={`closed-${band.fromHour}`}
              className="pointer-events-none absolute bottom-0 top-0 z-0 bg-muted/40"
              style={{
                left: LABEL_WIDTH + (band.fromHour - startHour) * HOUR_WIDTH,
                width: (band.toHour - band.fromHour) * HOUR_WIDTH,
              }}
              aria-hidden
            />
          ))}
          {showNow && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-destructive"
              style={{ left: LABEL_WIDTH + (nowMin / 60) * HOUR_WIDTH }}
              aria-hidden
            >
              <span className="absolute -left-1 -top-1 size-2 rounded-full bg-destructive" />
            </div>
          )}
          {rows.map((row) => {
            const { placed, tracks } = packTracks(row.items);
            const h = laneHeight(tracks);
            const label = row.resource ? resourceLabel(row.resource) : null;
            const ResIcon = row.resource ? resourceIcon(row.resource) : null;
            //What booking this lane implies. A room is a ground lesson and a simulator is a
            //sim session; an aircraft could be any of six types, so it says nothing and the
            //form keeps its own default. Undefined for the leftover row, which has no
            //resource at all.
            const laneType = row.resource ? typeForResource(row.resource) ?? undefined : undefined;
            //A lane the held block would land on, highlighted so a cross-lane drop reads as
            //deliberate rather than accidental.
            const isDropLane =
              held != null &&
              (row.resource
                ? held.resourceId === row.resource.id
                : held.resourceId == null);
            return (
              <div
                key={row.key}
                data-doc-shot={row.resource == null ? "schedule-unassigned-row" : undefined}
                className="flex border-b border-border last:border-b-0"
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border bg-card px-3"
                  style={{ width: LABEL_WIDTH, minHeight: h }}
                >
                  {label ? (
                    <>
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                        {ResIcon && <ResIcon className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-sm font-medium">
                          {label.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {label.kind}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      {leftoverLabel}
                    </span>
                  )}
                </div>

                <div
                  ref={(el) => {
                    if (el) {
                      laneRefs.current.set(row.key, {
                        el,
                        zone: { resourceId: row.resource?.id ?? null, leftover: row.resource == null },
                      });
                    } else {
                      laneRefs.current.delete(row.key);
                    }
                  }}
                  role={canCreate ? "button" : undefined}
                  tabIndex={canCreate ? 0 : undefined}
                  className={cn(
                    "relative shrink-0",
                    canCreate &&
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isDropLane && "bg-primary/5"
                  )}
                  style={{
                    width: laneWidth,
                    height: h,
                    backgroundImage: `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${HOUR_WIDTH}px)`,
                  }}
                  aria-label={
                    canCreate
                      ? label
                        ? `Book time on ${label.name}`
                        : "Book an unassigned reservation"
                      : undefined
                  }
                  onKeyDown={
                    canCreate
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCreate?.({
                              date: day,
                              resourceId: row.resource?.id,
                              type: laneType,
                              start: kbStart,
                              end: kbEnd,
                            });
                          }
                        }
                      : undefined
                  }
                  onClick={
                    canCreate
                      ? (e) => {
                          //A drag that finished over empty lane space still lands a click
                          //here. Without this, every drop would also open the booking form.
                          if (drag?.consumeClick()) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const hour = Math.min(
                            endHour - 1,
                            Math.max(startHour, startHour + Math.floor(x / HOUR_WIDTH))
                          );
                          //The shaded hours are drawn so a late booking has somewhere to sit
                          //and so there is room to scroll, not so they can be booked: the
                          //server refuses a same-day booking outside the flying day.
                          if (!isOpenHour(win, hour)) {
                            toast.message(closedHourMessage(win));
                            return;
                          }
                          const hh = String(hour).padStart(2, "0");
                          const eh = String(hour + 1).padStart(2, "0");
                          const startMs = instantAtDayMinutes(
                            dayKey,
                            hour * 60,
                            tz.zone
                          ).getTime();
                          const endMs = instantAtDayMinutes(
                            dayKey,
                            (hour + 1) * 60,
                            tz.zone
                          ).getTime();
                          const blocking = row.resource
                            ? slotOfferHolds.find(
                                (h) =>
                                  h.resourceId === row.resource!.id &&
                                  holdOverlaps(h, startMs, endMs)
                              )
                            : undefined;
                          if (blocking) {
                            toast.message(
                              `Offered to ${blocking.offeredToName} until ${formatTimeInZone(
                                blocking.holdUntil,
                                tz.zone
                              )}. Open Pending offers to withdraw or wait.`
                            );
                            onOfferHoldClick?.(blocking);
                            return;
                          }
                          onCreate?.({
                            date: day,
                            resourceId: row.resource?.id,
                            type: laneType,
                            start: `${hh}:00`,
                            end: `${eh}:00`,
                          });
                        }
                      : undefined
                  }
                >
                  {placed.map(({ r, track }) => {
                    const { leftPx, widthPx } = laneBlockGeometry(r, tz.zone, startHour, totalMin, dayKey);
                    const style = {
                      left: leftPx,
                      width: widthPx,
                      top: LANE_PAD_Y + track * (TRACK_HEIGHT + TRACK_GAP),
                      height: TRACK_HEIGHT,
                    };
                    //The block being carried stays in the layout as an outline, so the lane
                    //never re-packs mid-drag and its old slot stays readable.
                    if (held?.reservation.id === r.id) {
                      return <LaneGhost key={r.id} style={style} />;
                    }
                    return (
                      <div key={r.id} className="absolute" style={style}>
                        <LaneBlock
                          r={r}
                          onView={onView}
                          onEdit={onEdit}
                          onCancel={onCancel}
                          marks={marks}
                          drag={drag}
                          geom={geom}
                        />
                      </div>
                    );
                  })}
                  {slotOfferHolds
                    .filter((h) => row.resource != null && h.resourceId === row.resource.id)
                    .filter((h) => {
                      const s = minutesInWindow(h.start, tz.zone, startHour, dayKey);
                      const e = minutesInWindow(h.end, tz.zone, startHour, dayKey);
                      return e > 0 && s < totalMin;
                    })
                    .map((hold) => {
                      const pseudo = { start: hold.start, end: hold.end } as Reservation;
                      const { leftPx, widthPx } = laneBlockGeometry(
                        pseudo,
                        tz.zone,
                        startHour,
                        totalMin,
                        dayKey
                      );
                      if (widthPx <= 0) return null;
                      return (
                        <OfferHoldBlock
                          key={`hold-${hold.id}`}
                          hold={hold}
                          zone={tz.zone}
                          style={{
                            left: leftPx,
                            width: widthPx,
                            top: LANE_PAD_Y,
                            height: TRACK_HEIGHT,
                          }}
                          onClick={onOfferHoldClick}
                          drag={drag}
                        />
                      );
                    })}
                  {/* The carried block. Rendered last so it paints over whatever is already
                      in this lane, nothing underneath is displaced or hidden, which is the
                      whole point: you can see what you are about to land on. */}
                  {heldPreview && heldRowKey === row.key && (
                    <div
                      className="absolute"
                      style={{
                        ...(() => {
                          const g = laneBlockGeometry(heldPreview, tz.zone, startHour, totalMin, dayKey);
                          return { left: g.leftPx, width: g.widthPx };
                        })(),
                        top: LANE_PAD_Y,
                        height: TRACK_HEIGHT,
                      }}
                    >
                      <LaneBlock
                        r={heldPreview}
                        onView={onView}
                        onCancel={onCancel}
                        marks={marks}
                        drag={drag}
                        geom={geom}
                        floating
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The outline a block leaves in its committed slot while it's being carried. It takes the
 * block's own geometry, so the lane keeps exactly the shape it had before the drag started.
 */
function OfferHoldBlock({
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
            // Opaque fill so a booking underneath cannot bleed through the label.
            "absolute z-[2] flex items-center overflow-hidden rounded-md border border-dashed",
            "border-amber-600/60 bg-amber-50 px-1.5 text-left shadow-sm",
            "dark:border-amber-500/50 dark:bg-amber-950",
            // Locked bookings use pointer, not grab: the block opens, it does not move.
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

function LaneGhost({ style }: { style: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-md border border-dashed border-muted-foreground/50 bg-muted/30"
      style={style}
    />
  );
}

function LaneBlock({
  r,
  onView,
  onEdit,
  onCancel,
  marks,
  drag,
  geom,
  floating,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  marks: BoardMarks;
  drag?: ScheduleDrag;
  geom: DragGeometry;
  /** The carried copy drawn over the board: lifted, inert, and without its own controls. */
  floating?: boolean;
}) {
  //Per-reservation so a school with fields in two zones labels each block correctly.
  const tz = useTimeZone(r.location);
  //The ⋯ menu is collapsed out of the layout until it is needed, so the block has to know
  //when its dropdown is up, see the wrapper below for why the DOM can't tell us.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const names = personnelNames(r);
  //One name plus a count when a booking has a crew, see crewLabel.
  const shownName = crewLabel(names, marks.query);
  const timeRange = tz.range(r.start, r.end);

  const ability = drag?.abilityFor(r);
  //`floating` is the carried copy: it already IS the live drag, so it takes no input of its
  //own and shows no controls, the real block (now an outline) still owns focus and events.
  const held = floating ? (drag?.active ?? null) : null;
  const saving = !floating && drag?.pendingId === r.id;
  const grabbable = Boolean(!floating && drag && ability?.move);

  const body = (
    <div
      role={floating ? "presentation" : "button"}
      aria-hidden={floating || undefined}
      tabIndex={floating ? undefined : 0}
      aria-label={
        floating
          ? undefined
          : dragAriaLabel(r, timeRange, ability, ability?.move ? KEY_HINT_MOVE : KEY_HINT_END)
      }
      onPointerDown={
        //Wired even when this booking can't be moved: `begin` is what explains the refusal,
        //and a block that answers nothing to a drag attempt is the confusion this feature
        //exists to avoid.
        drag && !floating
          ? (e) => {
              //Ignore presses that started on a resize handle or the ⋯ menu.
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
          e.preventDefault();
          e.stopPropagation();
          onView(r);
          return;
        }
        if (!drag || floating || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        //Arrow keys are the no-mouse route to the same rules: one 15-minute slot per press,
        //Shift to stretch the end instead of moving the whole booking.
        e.preventDefault();
        e.stopPropagation();
        const step = e.key === "ArrowLeft" ? -1 : 1;
        drag.nudge(r, e.shiftKey ? "resize-end" : "move", step);
      }}
      className={cn(
        "group relative flex h-full w-full items-center gap-1 overflow-hidden rounded-md border-l-2 border px-1.5 text-left shadow-sm transition-colors",
        BLOCK_CLASS[r.type],
        dimClass(marks, r.id),
        selectedClass(marks, r.id),
        //A locked block still opens its details, so it reads as a pointer target.
        grabbable ? "cursor-grab select-none active:cursor-grabbing" : "cursor-pointer",
        //Lifted: a shadow and a ring say "this one is in your hand", and a touch of
        //translucency lets whatever it is passing over stay readable underneath.
        floating && "pointer-events-none cursor-grabbing opacity-95 shadow-lg ring-2 ring-primary/70",
        floating && held?.reason && "ring-destructive",
        saving && "animate-pulse"
      )}
    >
      {/* Edge handles. Rendered only where that edge may actually move, so the cursor
          never promises something the booking's state won't allow. */}
      {drag && !floating && ability?.resizeStart && (
        <ResizeHandle
          axis="x"
          side="start"
          onPointerDown={(e) => drag.begin(e, r, "resize-start", geom)}
        />
      )}
      {drag && !floating && ability?.resizeEnd && (
        <ResizeHandle axis="x" side="end" onPointerDown={(e) => drag.begin(e, r, "resize-end", geom)} />
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold leading-tight text-foreground">
          {highlightMatch(r.title, marks.query)}
        </div>
        <div className="truncate text-[11px] leading-tight opacity-80 tabular-nums">
          {floating ? timeRange : shownName ? highlightMatch(shownName, marks.query) : typeLabel(r.type)}
        </div>
      </div>
      {!floating && (
        <div
          data-drag-exempt
          //Collapsed to zero WIDTH, not just zero opacity: an invisible menu that still
          //reserves its 28px steals a quarter of the title on a short block, which then
          //reads as an ellipsis for no visible reason. It claims the space only while it
          //is actually on screen.
          //
          //`menuOpen` rather than a CSS `has-[[data-state=open]]`: the tooltip wraps the
          //trigger with `asChild` and its own data-state wins the merge, so the attribute
          //reads "closed" the whole time the dropdown is up, and the menu would collapse
          //out from under the pointer on its way to the dropdown.
          //
          //focus-VISIBLE, not focus-within: closing the dropdown hands focus back to the
          //trigger, and on a mouse close that would slide the menu back in and leave it
          //there. focus-visible only matches when the last input was the keyboard, so
          //tabbing still reveals it and clicking still tidies up after itself.
          className={cn(
            "w-0 -ml-1 shrink-0 overflow-hidden opacity-0 transition-[width,opacity]",
            "group-hover:ml-0 group-hover:w-7 group-hover:opacity-100",
            "group-has-[:focus-visible]:ml-0 group-has-[:focus-visible]:w-7 group-has-[:focus-visible]:opacity-100",
            menuOpen && "ml-0 w-7 opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ReservationMenu
            r={r}
            onView={onView}
            onEdit={onEdit}
            onCancel={onCancel}
            onOpenChange={setMenuOpen}
          />
        </div>
      )}
    </div>
  );

  //The carried copy takes no tooltip: the cursor is busy, and the live time and any refusal
  //are on the callout that follows the pointer (see DragCallout).
  if (floating) return body;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent>
        <div className="max-w-[16rem] text-xs">
          <div className="font-medium">{r.title}</div>
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

