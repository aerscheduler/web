import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { useReservations, type ReportRange } from "@/features/queries";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { ReservationCard } from "@/components/me/reservation-card";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";
import { Button } from "@/components/ui/button";

const UPCOMING_DAYS = 14;
const UPCOMING_SHOWN = 6;
const LOG_SHOWN = 8;

/**
 * This aircraft's board — what's booked on it next, and what it last flew.
 *
 * Reads the org-wide reservation list narrowed to one resource, which is the
 * same query the dispatch board runs, so a booking made on the board appears
 * here without a second cache to keep in sync.
 */
export function ResourceSchedule({
  resourceId,
  range,
  canBook,
}: {
  resourceId: number;
  range: ReportRange | undefined;
  canBook: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const upcomingStart = useMemo(() => startOfDay(now).toISOString(), [now]);
  const upcomingEnd = useMemo(
    () => endOfDay(addDays(now, UPCOMING_DAYS)).toISOString(),
    [now]
  );

  const upcomingQ = useReservations(upcomingStart, upcomingEnd, { resourceId });
  const logQ = useReservations(
    range?.startDate ?? upcomingStart,
    range?.endDate ?? upcomingEnd,
    { resourceId },
    { enabled: range != null }
  );

  const upcoming = useMemo(
    () =>
      [...(upcomingQ.data ?? [])]
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, UPCOMING_SHOWN),
    [upcomingQ.data]
  );

  const log = useMemo(() => {
    const nowISO = now.toISOString();
    return [...(logQ.data ?? [])]
      .filter((r) => r.start <= nowISO)
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, LOG_SHOWN);
  }, [logQ.data, now]);

  const all = useMemo(
    () => [...(upcomingQ.data ?? []), ...(logQ.data ?? [])],
    [upcomingQ.data, logQ.data]
  );
  const {
    detail,
    open,
    setOpen,
    openDetail,
    cancelReservation,
    editing,
    setEditing,
    startEdit,
    cancelDialog,
  } = useReservationDetail(all);

  return (
    <>
      <DetailCard
        title="On the schedule"
        description={`Booked on this tail in the next ${UPCOMING_DAYS} days.`}
        action={
          canBook ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/schedule">Open Calendar</Link>
            </Button>
          ) : undefined
        }
      >
        {upcomingQ.isPending ? (
          <CardSkeleton rows={2} />
        ) : upcomingQ.isError ? (
          <CardEmpty>Couldn&apos;t load the schedule.</CardEmpty>
        ) : upcoming.length === 0 ? (
          <CardEmpty>Nothing booked on this aircraft for the next {UPCOMING_DAYS} days.</CardEmpty>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((r) => (
              <li key={r.id}>
                <ReservationCard r={r} showDate onOpen={openDetail} />
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      <DetailCard
        // Maintenance and ground bookings land in this list too, so "flew" would
        // be wrong for a fair share of the rows.
        title="Recent bookings"
        description="What this aircraft was booked for in the selected window."
      >
        {logQ.isPending ? (
          <CardSkeleton rows={4} />
        ) : logQ.isError ? (
          <CardEmpty>Couldn&apos;t load recent bookings.</CardEmpty>
        ) : log.length === 0 ? (
          <CardEmpty>Nothing booked in this window.</CardEmpty>
        ) : (
          <ul className="space-y-2">
            {log.map((r) => (
              <li key={r.id}>
                <ReservationCard r={r} showDate onOpen={openDetail} />
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={{ date: new Date(editing.start) }}
          editing={editing}
        />
      )}
      <CancelReservationDialog {...cancelDialog} />
      <ReservationDetailSheet
        reservation={detail}
        open={open}
        onOpenChange={setOpen}
        onCancel={cancelReservation}
        onEdit={startEdit}
      />
    </>
  );
}
