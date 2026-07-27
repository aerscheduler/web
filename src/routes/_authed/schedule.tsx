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
import { resourceLabel, type Reservation, type Resource, type Role } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canSeeRoomLanes, canSeeSimulatorLanes, isStaff } from "@/lib/permissions";
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
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";

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
  const resources = useResolvedResources(resourcesQ.data, reservations, roles);

  // Modal state.
  const [formOpen, setFormOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ReservationDraft>({ date: day });
  // "Book another like this" — seeds a CREATE from an existing reservation.
  const [duplicating, setDuplicating] = React.useState<Reservation | null>(null);

  const {
    detail,
    open: detailOpen,
    setOpen: setDetailOpen,
    openDetail,
    cancelReservation: handleCancel,
    editing,
    setEditing,
    startEdit,
  } = useReservationDetail(reservations);

  const openNew = () => {
    setDraft({ date: day });
    setFormOpen(true);
  };
  const openCreate = (d: ReservationDraft) => {
    setDraft(d);
    setFormOpen(true);
  };
  const selectDay = (d: Date) => {
    setDay(d);
    setView("day");
  };
  // Members are read-only on the board (they book via /me/book), so they get no
  // click-to-create regions at all rather than ones that silently do nothing.
  const onCreate = staff ? openCreate : undefined;

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
        {q.isPending ? (
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
              onCreate={onCreate}
              onSelectDay={selectDay}
            />
          ) : (
            <MonthAgenda
              reservations={reservations}
              onView={openDetail}
              onEdit={startEdit}
              onCancel={handleCancel}
            />
          )
        ) : view === "week" ? (
          isDesktop ? (
            <WeekTimeGrid
              weekStart={startOfWeek(day)}
              reservations={reservations}
              onView={openDetail}
              onCreate={onCreate}
              onSelectDay={selectDay}
            />
          ) : (
            <AgendaList
              reservations={reservations}
              onView={openDetail}
              onEdit={startEdit}
              onCancel={handleCancel}
            />
          )
        ) : isDesktop ? (
          <LaneGrid
            day={day}
            resources={resources}
            reservations={reservations}
            onView={openDetail}
            onEdit={startEdit}
            onDuplicate={setDuplicating}
            onCancel={handleCancel}
            onCreate={onCreate}
          />
        ) : (
          <AgendaList
            reservations={reservations}
            onView={openDetail}
            onEdit={startEdit}
            onDuplicate={setDuplicating}
            onCancel={handleCancel}
          />
        )}
      </Card>

      <ReservationForm open={formOpen} onOpenChange={setFormOpen} draft={draft} />

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={{ date: new Date(editing.start) }}
          editing={editing}
        />
      )}

      {duplicating && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setDuplicating(null)}
          draft={{ date: new Date(duplicating.start) }}
          duplicating={duplicating}
        />
      )}

      <ReservationDetailSheet
        reservation={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCancel={handleCancel}
        onEdit={startEdit}
      />
    </div>
  );
}

/**
 * The lane grid needs a resource list even when `/resources` is empty or slow —
 * so merge the fleet endpoint with any resources embedded on the reservations,
 * then drop the lanes this role has no business scanning.
 *
 * The filter lives here, at the single data source, rather than in each grid:
 * only the day board draws lanes, and this way the rule is stated once. It
 * filters LANES only — every member still sees the whole org's bookings, and
 * the lane grid folds any reservation whose lane is missing into its "Other"
 * row so nothing is silently dropped.
 */
function useResolvedResources(
  fromApi: Resource[] | undefined,
  reservations: Reservation[],
  roles: Role[]
): Resource[] {
  return React.useMemo(() => {
    const byId = new Map<number, Resource>();
    for (const r of fromApi ?? []) byId.set(r.id, r);
    for (const res of reservations) {
      if (res.resource && !byId.has(res.resource.id)) byId.set(res.resource.id, res.resource);
    }
    return [...byId.values()].filter((r) => canSeeLane(r, roles));
  }, [fromApi, reservations, roles]);
}

/**
 * Which resource lanes a role sees. Mirrors the Flutter calendar's `canSee*`
 * getters: planes for everyone, rooms and sims only for the instruction roles
 * (a renter's or technician's board is planes-only).
 */
function canSeeLane(r: Resource, roles: Role[]): boolean {
  switch (resourceLabel(r).kind) {
    case "Room":
      return canSeeRoomLanes(roles);
    case "Simulator":
      return canSeeSimulatorLanes(roles);
    default:
      return true;
  }
}
