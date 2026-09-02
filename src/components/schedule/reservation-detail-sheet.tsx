import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Ban,
  Clock,
  FileText,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plane,
  Users,
} from "lucide-react";
import { resourceLabel, type Reservation } from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WeatherBadge } from "@/components/weather-badge";
import { SheetDetailField, SheetDetailFields } from "@/components/sheet-detail-field";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DOT_CLASS, personnelEntries, resourceIcon, typeLabel } from "./meta";
import { CloseOutSection } from "./close-out-section";
import { ReservationAudit } from "./reservation-audit";
import { ReservationStandby } from "@/components/slot-offers/reservation-standby";
import { canCancelReservation, canEditReservation } from "./close-out";
import { formatTimeInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";

/**
 * A booking at a glance, beside the board.
 *
 * THIS IS A PEEK, NOT A WORKSPACE. It answers "what is this flight, and what does it want
 * from me right now", and it hands everything else to the record page. What used to live
 * here (grading a lesson, who pays what, hand-typed rates, corrections, filing a squawk)
 * put five same-sized buttons and two collapsibles into a 384px column, none of which was
 * the thing the reader had opened it to see.
 *
 * The layout follows from that. Facts are hairline-separated rows, the ONE action the
 * booking is asking for is the sticky footer (the close-out section portals it there), the
 * rare acts sit in an overflow menu next to the close button, and the last line out is the
 * link to the full record.
 */
export function ReservationDetailSheet({
  reservation,
  open,
  onOpenChange,
  onCancel,
  onEdit,
  onStep,
}: {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (r: Reservation) => void;
  /** Omitted on surfaces with no edit form mounted. */
  onEdit?: (r: Reservation) => void;
  /**
   * ↑/↓ through the bookings on screen. Omitted on My day, which is a dashboard
   * because there is no single ordered list there for a step to mean anything.
   */
  onStep?: (delta: -1 | 1) => void;
}) {
  const { roles, orgUserId } = useAuth();
  const r = reservation;
  const tz = useTimeZone(r?.location);
  const canCancel = r ? canCancelReservation(r, roles, orgUserId) : false;
  const canEdit = r != null && onEdit != null && canEditReservation(r, roles, orgUserId);
  const res = r?.resource ? resourceLabel(r.resource) : null;
  const ResourceIcon = r?.resource ? resourceIcon(r.resource) : Plane;
  const people = r ? personnelEntries(r) : [];
  // `/aircraft/:id` is the AIRCRAFT page and bounces a simulator or a room to Facilities,
  // so only a plane is a link. Same rule the search results follow.
  const resourceHref = r?.resource && res?.kind === "Aircraft" ? r.resource.id : null;
  // `reservation.location` is hydrated (name + address + geocoded coordinates);
  // `reservation.resource.location` is only a { id } stub. The weather lookup needs
  // the former. See the Location field below.
  // Typed narrowly here rather than in types/api.ts, which doesn't declare the
  // reservation's location relation. WeatherBadge narrows the address itself.
  const reservationLocation =
    (r as unknown as { location?: { name?: string } | null } | null)?.location ?? null;

  // The close-out's primary action is drawn in here. Held in state rather than a ref
  // because the portal has to re-run once the node exists.
  const [actionSlot, setActionSlot] = React.useState<HTMLDivElement | null>(null);

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={r?.title ?? ""}
      description={r ? tz.date(r.start, "long") : undefined}
      badge={
        r ? (
          <span className="flex shrink-0 items-center gap-2">
            <span className={cn("size-2.5 rounded-full", DOT_CLASS[r.type])} aria-hidden />
            <Badge variant="outline">{typeLabel(r.type)}</Badge>
          </span>
        ) : undefined
      }
      actions={
        r && (canEdit || canCancel) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label="Reservation actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onSelect={() => onEdit(r)}>
                  <Pencil className="size-4" /> Edit reservation
                </DropdownMenuItem>
              )}
              {canCancel && (
                <>
                  {canEdit && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="destructive" onSelect={() => onCancel(r)}>
                    <Ban className="size-4" /> Cancel reservation
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
      /* THE ONE THING TO DO, and nothing else. The close-out portals the current step's
         action in here (Ramp out, Ramp in, Confirm review, …); on a booking with no
         action for this reader the slot stays empty and the bar takes itself away. */
      footer={r ? <div ref={setActionSlot} /> : undefined}
      footerClassName="has-[>div:empty]:hidden"
    >
      {r && (
        /* Keyed on the booking, so picking another row REPLACES this subtree rather
           than re-rendering it with new props. Everything below holds typed state
           seeded from the reservation (hours in the close-out, a grade and lesson
           notes in the training record), and React keeps that state across a prop
           change: open one booking, type a grade, click the next booking in the
           list, and the previous student's grade and notes were still sitting in
           the form under someone else's name, ready to submit. */
        <div key={r.id} data-doc-shot="reservation-detail-panel" className="space-y-5 pt-4">
          <SheetDetailFields>
            {/* Airport time, and only says so when the reader is somewhere else. The old
                version formatted with r.timeZoneName, the zone of the DEVICE THAT BOOKED
                IT, and printed the raw "America/Boise" next to every booking whether or
                not it told the reader anything. */}
            {/* A booking that ends on a later day says so. Without the date, a trip out
                Friday and back Sunday read here as a one-hour Friday flight. */}
            <SheetDetailField icon={Clock} label="Time">
              <span className="tabular-nums">
                {tz.time(r.start)} –{" "}
                {tz.spansDays(r.start, r.end)
                  ? `${tz.date(r.end, "short")} at ${tz.time(r.end)}`
                  : tz.time(r.end)}
              </span>
              {tz.differs(r.start) && (
                <span className="mt-0.5 block text-muted-foreground">
                  {tz.label(r.start)} · {formatTimeInZone(r.start, tz.viewerZone)} your time
                </span>
              )}
            </SheetDetailField>

            <SheetDetailField icon={ResourceIcon} label="Resource">
              {res ? (
                resourceHref != null ? (
                  <Link
                    to="/aircraft/$resourceId"
                    params={{ resourceId: String(resourceHref) }}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {res.name}
                  </Link>
                ) : (
                  <span className="font-medium">{res.name}</span>
                )
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
              {res && <span className="ml-2 text-muted-foreground">{res.kind}</span>}
            </SheetDetailField>

            {(reservationLocation?.name ?? r.resource?.location?.name) && (
              <SheetDetailField icon={MapPin} label="Location">
                {reservationLocation?.name ?? r.resource?.location?.name}
              </SheetDetailField>
            )}

            {/* Renders nothing at all, with no row or spinner, unless the location is
                geocoded AND a lookup came back. Its own markup mirrors the field row
                above so it can hide the whole row rather than leave an empty label. */}
            <WeatherBadge
              variant="detail"
              location={reservationLocation}
              start={r.start}
              timeZone={r.timeZoneName}
            />

            <SheetDetailField icon={Users} label="Personnel">
              {people.length > 0 ? (
                <ul className="space-y-0.5">
                  {people.map((p, i) => (
                    <li key={`${p.name}-${i}`}>
                      {/* A guest is a name captured on the booking, not a member, so
                          there is no record behind them to open. */}
                      {p.orgUserId != null ? (
                        <Link
                          to="/people/$orgUserId"
                          params={{ orgUserId: String(p.orgUserId) }}
                          className="underline-offset-2 hover:underline"
                        >
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                      <span className="ml-2 text-muted-foreground">{p.seat}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">No one assigned</span>
              )}
            </SheetDetailField>

            {r.notes && (
              <SheetDetailField icon={FileText} label="Notes" stacked>
                <p className="whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
              </SheetDetailField>
            )}
          </SheetDetailFields>

          <ReservationStandby reservation={r} />

          <CloseOutSection reservation={r} variant="panel" actionSlot={actionSlot} />

          {/* Last, and always rendered, including on a cancelled booking, where
              CloseOutSection bails out entirely and this is the only thing left
              that explains what happened to it. */}
          <ReservationAudit reservation={r} />

          {/* The panel is a peek at a row on the board. The record page is the thing you
              can bookmark, link a colleague to, and do the fiddly half of a close-out on:
              who pays what, a hand-typed rate, a correction, the lesson grade. */}
          <Link
            to="/schedule/reservations/$reservationId"
            params={{ reservationId: String(r.id) }}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Open the full booking
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      )}
    </DetailPanel>
  );
}
