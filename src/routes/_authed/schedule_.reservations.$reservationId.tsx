import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ban, CalendarClock, MapPin, Pencil, Plane, Users } from "lucide-react";
import { useReservation } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { guardRoute } from "@/lib/permissions";
import { resourceLabel, type Reservation } from "@/types/api";
import { CloseOutSection } from "@/components/schedule/close-out-section";
import { LessonSection } from "@/components/schedule/lesson-section";
import { ReservationAudit } from "@/components/schedule/reservation-audit";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { useReservationActions } from "@/components/schedule/use-reservation-actions";
import { canCancelReservation, canEditReservation } from "@/components/schedule/close-out";
import { DOT_CLASS, personnelEntries, resourceIcon, typeLabel } from "@/components/schedule/meta";
import { ReservationStandby } from "@/components/slot-offers/reservation-standby";
import { WeatherBadge } from "@/components/weather-badge";
import {
  CardEmpty,
  DetailBack,
  DetailCard,
  DetailHeader,
  KeyValue,
  KeyValueList,
  MetaItem,
  RecordNotFound,
  isMissingRecord,
  useDetailTitle,
} from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { TableView } from "@/components/table-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { cn } from "@/lib/utils";

/**
 * One booking, in full.
 *
 * Sibling of the board rather than a child of it (hence the `schedule_` filename), for the
 * same reason as the person, aircraft and squawk pages: Schedule is a full-height page that
 * owns its own scroll container, and making it a layout for this would render the whole
 * dispatch board underneath every booking.
 *
 * WHY IT EXISTS. Everything a booking can be made to do used to live in the 384px panel
 * beside the board: readings, who pays what, hand-typed rates, corrections, a grading form
 * per student per course, and the invoice. That is a workspace, and it was being shown in a
 * column, folded into look-alike buttons, on top of the facts somebody had actually clicked
 * to read. The panel is a peek now, and this is where the work happens: it has the width
 * for the close-out to be laid out beside the record instead of on top of it.
 */
export const Route = createFileRoute("/_authed/schedule_/reservations/$reservationId")({
  // Resolves through `canAccess`'s nearest-parent rule to `/schedule`, i.e. any member,
  // which is the same door the board is behind. `GET /reservations/:id` is `isOrgUser`.
  beforeLoad: guardRoute("/schedule/reservations"),
  component: ReservationDetailPage,
});

function ReservationDetailPage() {
  const { reservationId: param } = Route.useParams();
  const id = Number.parseInt(param, 10);
  const q = useReservation(Number.isFinite(id) ? id : null);
  const reservation = q.data ?? null;

  // A bad id, a booking from another organization, and a deleted one all land here. The
  // server answers 403 rather than 404 (it can't say "no such booking" without confirming
  // one exists somewhere), so surfacing it verbatim would tell somebody who mistyped a URL
  // that they aren't authorized.
  const missing =
    !Number.isFinite(id) ||
    isMissingRecord(q.error) ||
    // Settled with nothing is this page's not-found too, whatever React Query calls it.
    (!q.isLoading && !q.isError && reservation == null);

  if (missing) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={CalendarClock}
          title="Reservation not found"
          body="That link doesn't point at a booking in this organization. It may have been removed."
          backTo="/schedule"
          backLabel="Back to Schedule"
        />
      </PageFrame>
    );
  }

  // `isLoading`, not `isPending`: v5's `isPending` stays true for a settled query with no
  // data, so a skeleton keyed on it spins forever on a bad id.
  if (q.isLoading) {
    return (
      <PageFrame>
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </PageFrame>
    );
  }

  if (q.isError || !reservation) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </PageFrame>
    );
  }

  return <ReservationBody reservation={reservation} />;
}

function ReservationBody({ reservation: r }: { reservation: Reservation }) {
  const { roles, orgUserId } = useAuth();
  const tz = useTimeZone(r.location);
  const actions = useReservationActions();
  const [editing, setEditing] = React.useState(false);

  const title = r.title?.trim() || "Untitled booking";
  useDetailTitle(title);

  const res = r.resource ? resourceLabel(r.resource) : null;
  const ResourceIcon = r.resource ? resourceIcon(r.resource) : Plane;
  const people = personnelEntries(r);
  const canEdit = canEditReservation(r, roles, orgUserId);
  const canCancel = canCancelReservation(r, roles, orgUserId);
  // `/aircraft/:id` is the AIRCRAFT page and bounces a simulator or a room to Facilities,
  // so only a plane is a link.
  const aircraftId = r.resource && res?.kind === "Aircraft" ? r.resource.id : null;
  const locationName = r.location?.name ?? r.resource?.location?.name ?? null;

  const times = `${tz.time(r.start)} – ${
    tz.spansDays(r.start, r.end) ? `${tz.date(r.end, "short")} at ${tz.time(r.end)}` : tz.time(r.end)
  }`;

  return (
    <TableView className="gap-5">
      {/* Same cap as the body below, so the header's actions sit over the content
          rather than out at the far edge of a wide monitor. */}
      <TableView.Header className="max-w-[1080px]">
        <DetailBack to="/schedule" label="Schedule" />

        <DetailHeader
          media={
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
              <ResourceIcon className="size-5" />
            </span>
          }
          title={title}
          badges={
            <span className="flex shrink-0 items-center gap-2">
              <span className={cn("size-2.5 rounded-full", DOT_CLASS[r.type])} aria-hidden />
              <Badge variant="outline">{typeLabel(r.type)}</Badge>
              {r.cancelledAt && <Badge variant="danger">Cancelled</Badge>}
            </span>
          }
          subtitle={
            <span className="tabular-nums">
              {tz.date(r.start, "long")} · {times}
              {tz.differs(r.start) && (
                <span className="ml-2">
                  ({tz.label(r.start)} · {formatTimeInZone(r.start, tz.viewerZone)} your time)
                </span>
              )}
            </span>
          }
          meta={
            <>
              {res && (
                <MetaItem icon={ResourceIcon}>
                  {aircraftId != null ? (
                    <Link
                      to="/aircraft/$resourceId"
                      params={{ resourceId: String(aircraftId) }}
                      className="font-mono underline-offset-2 hover:underline"
                    >
                      {res.name}
                    </Link>
                  ) : (
                    res.name
                  )}
                </MetaItem>
              )}
              {locationName && <MetaItem icon={MapPin}>{locationName}</MetaItem>}
              {people.length > 0 && (
                <MetaItem icon={Users}>
                  {people.map((p) => p.name).join(", ")}
                </MetaItem>
              )}
            </>
          }
          actions={
            <>
              {canEdit && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit reservation
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void actions.cancelReservation(r)}
                >
                  <Ban className="size-4" /> Cancel reservation
                </Button>
              )}
            </>
          }
        />
      </TableView.Header>

      <TableView.Body>
        {/* Capped rather than filling the window. The left column is a close-out, which is
            a form: at 1400px the rail, one sentence and a button sit in a field of empty
            card, and the eye has to travel the width of a monitor to get from the readings
            to the button under them. */}
        <div className="grid max-w-[1080px] gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {/* The work: readings, sign-offs, who pays what, hand-typed rates, the bill.
                `CloseOutSection` and `LessonSection` each open with a Separator, which
                earns its keep stacked in the panel and is noise as a card's first child. */}
            <Card
              className={cn(
                "p-4",
                "[&>[data-slot=separator]:first-child]:hidden",
                //Renders nothing at all on a cancelled booking, and an empty card with a
                //border around it reads as something that failed to load.
                "empty:hidden"
              )}
            >
              <CloseOutSection reservation={r} />
            </Card>

            {/* Grading, on the same page as the close-out and directly after it, so one
                pass produces the invoice AND the training record. Renders nothing unless
                this is instruction with an enrolled student on it. */}
            {!r.cancelledAt && (
              <Card className={cn("p-4", "[&>[data-slot=separator]:first-child]:hidden", "empty:hidden")}>
                <LessonSection reservation={r} />
              </Card>
            )}

            {r.notes && (
              <DetailCard title="Notes" description="What the booking was written up with.">
                <p className="whitespace-pre-wrap text-[13px]">{r.notes}</p>
              </DetailCard>
            )}

            {r.cancelledAt && (
              <DetailCard title="Cancellation" description="Why this booking came off the board.">
                {r.cancellationReason?.trim() ? (
                  <p className="whitespace-pre-wrap text-[13px]">{r.cancellationReason.trim()}</p>
                ) : (
                  <CardEmpty>No reason was recorded.</CardEmpty>
                )}
              </DetailCard>
            )}
          </div>

          <div className="space-y-4">
            <DetailCard title="Details">
              <KeyValueList>
                <KeyValue label="Time">
                  <span className="tabular-nums">{times}</span>
                </KeyValue>
                <KeyValue label="Date">{tz.date(r.start, "short")}</KeyValue>
                <KeyValue label="Type">{typeLabel(r.type)}</KeyValue>
                <KeyValue label="Resource" mono>
                  {res ? `${res.name}` : "Unassigned"}
                </KeyValue>
                {locationName && <KeyValue label="Location">{locationName}</KeyValue>}
                <KeyValue label="Personnel">
                  {people.length > 0 ? (
                    <ul className="space-y-0.5">
                      {people.map((p, i) => (
                        <li key={`${p.name}-${i}`}>
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
                          <span className="ml-2 font-normal text-muted-foreground">{p.seat}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="font-normal text-muted-foreground">No one assigned</span>
                  )}
                </KeyValue>
              </KeyValueList>

              {/* Renders nothing at all unless the location is geocoded AND a lookup came
                  back. A pilot never sees a spinner or an error here.

                  The `inline` variant, not the panel's labelled row: in a 320px sidebar
                  the labelled row leaves ~170px for the value, and the reporting station
                  a pilot is being asked to trust gets truncated mid-name. */}
              <WeatherBadge
                className="mt-2.5 border-t border-border pt-2.5"
                location={r.location}
                start={r.start}
                timeZone={r.timeZoneName}
              />
            </DetailCard>

            <ReservationStandby reservation={r} />

            <Card className="p-4 [&>[data-slot=separator]:first-child]:hidden">
              <ReservationAudit reservation={r} />
            </Card>
          </div>
        </div>
      </TableView.Body>

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(false)}
          draft={{ date: new Date(r.start) }}
          editing={r}
        />
      )}
      <CancelReservationDialog {...actions.cancelDialog} />
    </TableView>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 pb-8">
      <DetailBack to="/schedule" label="Schedule" />
      {children}
    </div>
  );
}
