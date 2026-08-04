import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, endOfDay, startOfDay } from "date-fns";
import type { Reservation } from "@/types/api";
import { useUserReservations, type ReportRange } from "@/features/queries";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { ReservationCard } from "@/components/me/reservation-card";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";
import { Button } from "@/components/ui/button";

const UPCOMING_DAYS = 30;
const UPCOMING_SHOWN = 5;
const LOG_SHOWN = 8;

/**
 * What this person has flown and what they're about to.
 *
 * Two windows, two queries, on purpose. The flight log follows the page's date
 * range so it agrees with the tiles above it; "upcoming" always means the next
 * 30 days regardless, because a page showing "last 90 days" should still tell
 * you they're booked tomorrow morning.
 *
 * Rows open the same detail sheet the dispatch board uses, so ramp-out, close-out
 * and cancel behave identically here — and are gated by the same per-reservation
 * rules, which is why this doesn't do any permission checking of its own.
 */
export function PersonFlights({
  userId,
  range,
  canBookFor,
}: {
  /** The subject's USER id — `/reservations/user/:userId` keys on the user, not the membership. */
  userId: number | null;
  range: ReportRange | undefined;
  /** Staff see an "Open in Calendar" shortcut; a member looking at themselves doesn't need it. */
  canBookFor: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const upcomingWindow = useMemo(
    () => ({
      startDate: startOfDay(now).toISOString(),
      endDate: endOfDay(addDays(now, UPCOMING_DAYS)).toISOString(),
    }),
    [now]
  );

  const upcomingQ = useUserReservations(
    userId,
    upcomingWindow.startDate,
    upcomingWindow.endDate
  );
  const logQ = useUserReservations(
    userId,
    range?.startDate ?? upcomingWindow.startDate,
    range?.endDate ?? upcomingWindow.endDate,
    undefined,
    { enabled: range != null }
  );

  const upcoming = useMemo(
    () =>
      [...(upcomingQ.data ?? [])]
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, UPCOMING_SHOWN),
    [upcomingQ.data]
  );

  // The log reads backwards — the most recent flight is the one you came to see.
  // Anything still in the future inside the window belongs to the card above, not
  // to a list captioned "flown".
  const log = useMemo(() => {
    const nowISO = now.toISOString();
    return [...(logQ.data ?? [])]
      .filter((r) => r.start <= nowISO)
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, LOG_SHOWN);
  }, [logQ.data, now]);

  // One sheet for both lists, so opening a flight from either behaves the same.
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
        title="Upcoming"
        description={`Booked in the next ${UPCOMING_DAYS} days.`}
        action={
          canBookFor ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/schedule">Open Calendar</Link>
            </Button>
          ) : undefined
        }
      >
        {upcomingQ.isPending ? (
          <CardSkeleton rows={2} />
        ) : upcomingQ.isError ? (
          <CardEmpty>Couldn&apos;t load upcoming bookings.</CardEmpty>
        ) : upcoming.length === 0 ? (
          <CardEmpty>Nothing booked in the next {UPCOMING_DAYS} days.</CardEmpty>
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
        // Not "Flight log": this lists whatever they booked, and a technician's
        // window is maintenance while a student's can be all ground lessons.
        title="Booking history"
        description="Bookings in the selected window, most recent first."
      >
        {logQ.isPending ? (
          <CardSkeleton rows={4} />
        ) : logQ.isError ? (
          <CardEmpty>Couldn&apos;t load the booking history.</CardEmpty>
        ) : log.length === 0 ? (
          <CardEmpty>Nothing booked in this window.</CardEmpty>
        ) : (
          <>
            <ul className="space-y-2">
              {log.map((r) => (
                <li key={r.id}>
                  <ReservationCard r={r} showDate onOpen={openDetail} />
                </li>
              ))}
            </ul>
            {(logQ.data?.length ?? 0) > LOG_SHOWN && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Showing the {LOG_SHOWN} most recent of{" "}
                {logQ.data!.filter((r: Reservation) => r.start <= now.toISOString()).length} in
                this window.
              </p>
            )}
          </>
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
