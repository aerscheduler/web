import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarClock, Plus } from "lucide-react";
import { useReservations, useResources } from "@/features/queries";
import type { Reservation, Resource } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { useMediaQuery } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/page-header";
import { CalendarGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ScheduleControls,
  type ScheduleView,
} from "@/components/schedule/schedule-controls";
import { LaneGrid } from "@/components/schedule/lane-grid";
import { WeekTimeGrid } from "@/components/schedule/week-time-grid";
import { MonthGrid } from "@/components/schedule/month-grid";
import { MonthAgenda } from "@/components/schedule/month-agenda";
import { AgendaList } from "@/components/schedule/agenda-list";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import {
  ReservationForm,
  type ReservationDraft,
} from "@/components/schedule/reservation-form";
import { useReservationActions } from "@/components/schedule/use-reservation-actions";

export const Route = createFileRoute("/_authed/schedule")({
  component: SchedulePage,
});

const REFRESH_MS = 20_000;

function SchedulePage() {
  const { roles } = useAuth();
  // Members see the board read-only and book via /me/book; only staff
  // (owner/admin/dispatcher) get the create-booking entry points. Mirrors the
  // server's guard on reservation creation.
  const staff = isStaff(roles);
  const [day, setDay] = React.useState<Date>(() => new Date());
  const [view, setView] = React.useState<ScheduleView>("day");
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [startISO, endISO] =
    view === "month"
      ? [
          startOfWeek(startOfMonth(day)).toISOString(),
          endOfWeek(endOfMonth(day)).toISOString(),
        ]
      : view === "week"
        ? [startOfWeek(day).toISOString(), endOfWeek(day).toISOString()]
        : [startOfDay(day).toISOString(), endOfDay(day).toISOString()];

  const q = useReservations(startISO, endISO);
  const resourcesQ = useResources();

  // Live board: quietly re-pull the range on an interval (ref keeps the timer
  // stable across renders while always calling the latest refetch).
  const refetchRef = React.useRef(q.refetch);
  refetchRef.current = q.refetch;
  React.useEffect(() => {
    const id = window.setInterval(() => void refetchRef.current(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const reservations = React.useMemo(() => q.data ?? [], [q.data]);
  const resources = useResolvedResources(resourcesQ.data, reservations);

  // Modal + sheet state.
  const [formOpen, setFormOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ReservationDraft>({ date: day });
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailRes, setDetailRes] = React.useState<Reservation | null>(null);

  // Keep the open detail sheet in sync with the live list so the close-out flow
  // (ramp out → ramp in → confirm → invoice) advances as mutations invalidate/refetch.
  const detail = React.useMemo(
    () => reservations.find((x) => x.id === detailRes?.id) ?? detailRes,
    [reservations, detailRes]
  );

  const actions = useReservationActions();

  const openNew = () => {
    setDraft({ date: day });
    setFormOpen(true);
  };
  const openCreate = (d: ReservationDraft) => {
    if (!staff) return; // members are read-only here; they book via /me/book
    setDraft(d);
    setFormOpen(true);
  };
  const openDetail = (r: Reservation) => {
    setDetailRes(r);
    setDetailOpen(true);
  };
  const selectDay = (d: Date) => {
    setDay(d);
    setView("day");
  };
  const handleCancel = async (r: Reservation) => {
    if (await actions.cancelReservation(r)) setDetailOpen(false);
  };
  const handleNoShow = async (r: Reservation) => {
    if (await actions.markNoShow(r)) setDetailOpen(false);
  };

  const count = q.data ? reservations.length : null;

  return (
    <div>
      <PageHeader
        title="The Ramp"
        subtitle="Dispatch board — aircraft, instructors and students at a glance."
        actions={
          staff && (
            <Button onClick={openNew}>
              <Plus className="size-4" /> New reservation
            </Button>
          )
        }
      />

      <ScheduleControls
        day={day}
        onDayChange={setDay}
        view={view}
        onViewChange={setView}
        count={count}
      />

      <Card className="overflow-hidden p-0">
        {q.isLoading ? (
          <CalendarGridSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : view === "day" && reservations.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Your dispatch board is clear"
            body="Book a flight to see aircraft and instructors line up."
            action={
              staff && (
                <Button onClick={openNew}>
                  <Plus className="size-4" /> Book a flight
                </Button>
              )
            }
          />
        ) : view === "month" ? (
          isDesktop ? (
            <MonthGrid
              month={day}
              reservations={reservations}
              onView={openDetail}
              onCreate={openCreate}
              onSelectDay={selectDay}
            />
          ) : (
            <MonthAgenda
              reservations={reservations}
              onView={openDetail}
              onCancel={handleCancel}
              onNoShow={handleNoShow}
            />
          )
        ) : view === "week" ? (
          isDesktop ? (
            <WeekTimeGrid
              weekStart={startOfWeek(day)}
              reservations={reservations}
              onView={openDetail}
              onCreate={openCreate}
              onSelectDay={selectDay}
            />
          ) : (
            <AgendaList
              reservations={reservations}
              onView={openDetail}
              onCancel={handleCancel}
              onNoShow={handleNoShow}
            />
          )
        ) : isDesktop ? (
          <LaneGrid
            day={day}
            resources={resources}
            reservations={reservations}
            onView={openDetail}
            onCancel={handleCancel}
            onNoShow={handleNoShow}
            onCreate={openCreate}
          />
        ) : (
          <AgendaList
            reservations={reservations}
            onView={openDetail}
            onCancel={handleCancel}
            onNoShow={handleNoShow}
          />
        )}
      </Card>

      <ReservationForm open={formOpen} onOpenChange={setFormOpen} draft={draft} />

      <ReservationDetailSheet
        reservation={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCancel={handleCancel}
        onNoShow={handleNoShow}
      />
    </div>
  );
}

/**
 * The lane grid needs a resource list even when `/resources` is empty or slow —
 * so merge the fleet endpoint with any resources embedded on the reservations.
 */
function useResolvedResources(
  fromApi: Resource[] | undefined,
  reservations: Reservation[]
): Resource[] {
  return React.useMemo(() => {
    const byId = new Map<number, Resource>();
    for (const r of fromApi ?? []) byId.set(r.id, r);
    for (const res of reservations) {
      if (res.resource && !byId.has(res.resource.id)) byId.set(res.resource.id, res.resource);
    }
    return [...byId.values()];
  }, [fromApi, reservations]);
}
