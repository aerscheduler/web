import { format } from "date-fns";
import { resourceLabel, type Reservation, type Resource } from "@/types/api";
import { dateKeyInZone, minutesFromMidnightInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BLOCK_CLASS, personnelNames, resourceIcon, typeLabel } from "./meta";
import { packTracks } from "./pack";
import { ReservationMenu } from "./reservation-menu";
import type { ReservationDraft } from "./reservation-form";

// The visible window is shared with the vertical week time-grid.
export const START_HOUR = 6;
export const END_HOUR = 22;
const HOURS = END_HOUR - START_HOUR;
const HOUR_WIDTH = 68; // px
const LABEL_WIDTH = 176; // px
const TRACK_HEIGHT = 46; // px
const TRACK_GAP = 4; // px
const LANE_PAD_Y = 8; // px
const TOTAL_MIN = HOURS * 60;

/**
 * Minutes past START_HOUR, measured on the AIRPORT's clock (unclamped).
 *
 * This used to read `d.getHours()` — the viewer's clock — which is what made the whole board
 * slide an hour when a dispatcher opened it from another zone. The instant is unchanged; only
 * the clock we measure it against is now the right one.
 */
function minutesInWindow(iso: string, zone: string) {
  return minutesFromMidnightInZone(iso, zone) - START_HOUR * 60;
}

/** Horizontal geometry for one block: left + width in px along the hour ruler. */
function laneBlockGeometry(r: Reservation, zone: string): { leftPx: number; widthPx: number } {
  const s = minutesInWindow(r.start, zone);
  const e = minutesInWindow(r.end, zone);
  const cs = Math.max(0, Math.min(TOTAL_MIN, s));
  const ce = Math.max(0, Math.min(TOTAL_MIN, e));
  if (ce <= 0 || cs >= TOTAL_MIN || ce <= cs) {
    // Outside the visible window — still show it pinned to the nearest edge.
    const left = cs >= TOTAL_MIN ? TOTAL_MIN - 30 : 0;
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

function hourLabel(h: number) {
  const period = h < 12 || h === 24 ? "a" : "p";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

type Row = { key: string; resource: Resource | null; items: Reservation[] };

/** Desktop resource-lane board: rows = resources, columns = hours of the day. */
export function LaneGrid({
  day,
  resources,
  reservations,
  onView,
  onEdit,
  onDuplicate,
  onCancel,
  onCreate,
}: {
  day: Date;
  resources: Resource[];
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onDuplicate?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  /** Omitted for roles that may not create — the lanes then aren't clickable. */
  onCreate?: (draft: ReservationDraft) => void;
}) {
  const tz = useTimeZone();
  const canCreate = onCreate != null;
  const byResource = new Map<number, Reservation[]>();
  const unassigned: Reservation[] = [];
  for (const r of reservations) {
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

  // Reservations on a resource that has no lane — either the caller filtered
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
  // Only "Unassigned" when it really is — an off-lane booking does have a resource.
  const leftoverLabel = offLane.length > 0 ? "Other" : "Unassigned";

  const laneWidth = HOURS * HOUR_WIDTH;
  //"Is the selected day today" is asked at the AIRPORT, not here. A dispatcher opening the
  //board from Tokyo is looking at the school's day, so the now-line belongs on the school's
  //today. `day` is a picked calendar date, so its own local components ARE the date.
  const isToday = dateKeyInZone(new Date(), tz.zone) === format(day, "yyyy-MM-dd");
  const nowMin = isToday ? minutesInWindow(new Date().toISOString(), tz.zone) : -1;
  const showNow = nowMin >= 0 && nowMin <= TOTAL_MIN;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: LABEL_WIDTH + laneWidth }}>
        {/* Header — hour ruler */}
        <div className="flex border-b border-border">
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ width: LABEL_WIDTH }}
          >
            Resource
          </div>
          <div className="relative bg-card" style={{ width: laneWidth, height: 32 }}>
            {Array.from({ length: HOURS + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full text-[11px] tabular-nums text-muted-foreground"
                style={{ left: i * HOUR_WIDTH }}
              >
                <span className="absolute -translate-x-1/2 pt-2">
                  {i < HOURS ? hourLabel(START_HOUR + i) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Body — one lane per resource */}
        <div className="relative">
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
            return (
              <div key={row.key} className="flex border-b border-border last:border-b-0">
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
                  role={canCreate ? "button" : undefined}
                  tabIndex={canCreate ? 0 : undefined}
                  className={cn(
                    "relative shrink-0",
                    canCreate &&
                      "cursor-copy focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                              start: "09:00",
                              end: "10:00",
                            });
                          }
                        }
                      : undefined
                  }
                  onClick={
                    canCreate
                      ? (e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const hour = Math.min(
                            END_HOUR - 1,
                            Math.max(START_HOUR, START_HOUR + Math.floor(x / HOUR_WIDTH))
                          );
                          const hh = String(hour).padStart(2, "0");
                          const eh = String(hour + 1).padStart(2, "0");
                          onCreate?.({
                            date: day,
                            resourceId: row.resource?.id,
                            start: `${hh}:00`,
                            end: `${eh}:00`,
                          });
                        }
                      : undefined
                  }
                >
                  {placed.map(({ r, track }) => {
                    const { leftPx, widthPx } = laneBlockGeometry(r, tz.zone);
                    return (
                      <div
                        key={r.id}
                        className="absolute"
                        style={{
                          left: leftPx,
                          width: widthPx,
                          top: LANE_PAD_Y + track * (TRACK_HEIGHT + TRACK_GAP),
                          height: TRACK_HEIGHT,
                        }}
                      >
                        <LaneBlock
                          r={r}
                          onView={onView}
                          onEdit={onEdit}
                          onDuplicate={onDuplicate}
                          onCancel={onCancel}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LaneBlock({
  r,
  onView,
  onEdit,
  onDuplicate,
  onCancel,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onDuplicate?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
}) {
  //Per-reservation so a school with fields in two zones labels each block correctly.
  const tz = useTimeZone(r.location);
  const names = personnelNames(r);
  const timeRange = tz.range(r.start, r.end);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onView(r);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onView(r);
            }
          }}
          className={cn(
            "group flex h-full w-full items-center gap-1 overflow-hidden rounded-md border-l-2 border px-1.5 text-left shadow-sm",
            BLOCK_CLASS[r.type]
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold leading-tight text-foreground">
              {r.title}
            </div>
            <div className="truncate text-[11px] leading-tight opacity-80">
              {names.length > 0 ? names[0] : typeLabel(r.type)}
            </div>
          </div>
          <div
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <ReservationMenu
              r={r}
              onView={onView}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onCancel={onCancel}
            />
          </div>
        </div>
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
