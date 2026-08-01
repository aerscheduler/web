import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarClock, Plus } from "lucide-react";
import { useLocations, useReservations, useResources } from "@/features/queries";
import { zonedStartOfDay, zonedEndOfDay } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { resourceLabel, type Reservation, type Resource, type Role } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canSeeRoomLanes, canSeeSimulatorLanes, isStaff } from "@/lib/permissions";
import { useMediaQuery } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/page-header";
import { CalendarGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableView } from "@/components/table-view";
import { ViewModeToggle, type ViewMode } from "@/components/view-mode-toggle";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useListQueryState, asFacetInts, validateListSearch } from "@/lib/list-query-state";
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
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import {
  ReservationForm,
  type ReservationDraft,
} from "@/components/schedule/reservation-form";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";

const FACET_KEYS = ["resourceId", "locationId"] as const;

export const Route = createFileRoute("/_authed/schedule")({
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: SchedulePage,
});

const REFRESH_MS = 20_000;

function SchedulePage() {
  const { roles } = useAuth();
  // Members see the board read-only and book via /me/book; only staff
  // (owner/admin/dispatcher) get the create-booking entry points. Mirrors the
  // server's guard on reservation creation.
  const staff = isStaff(roles);
  const tz = useTimeZone();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "schedule",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
  });
  const [day, setDay] = React.useState<Date>(() => new Date());
  const [view, setView] = usePersistedState<ScheduleView>("view:schedule-range", "day");
  const [presentation, setPresentation] = usePersistedState<ViewMode>(
    "view:schedule-presentation",
    "grid"
  );
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Mobile always uses the agenda; desktop honors the board/list toggle.
  const showBoard = isDesktop && presentation === "grid";

  //The window we FETCH has to be the same calendar range we RENDER, and rendering is
  //pinned to the airport. Computing the bounds locally while positioning by airport time
  //puts a booking on the board that doesn't belong to that day at all: a 6am-UTC flight is
  //still the previous evening in Hawaii, and a locally-bounded fetch hands it to a grid
  //that then draws it under today.
  //
  //`day` is a picked calendar date, so its own local components are the date; the bounds
  //are then built as midnight-to-midnight IN THE FIELD'S ZONE. A day is padded by one on
  //each side and re-clipped by the grids, so a booking that straddles midnight anywhere in
  //the range is still fetched.
  const rangeDays =
    view === "month"
      ? [startOfWeek(startOfMonth(day)), endOfWeek(endOfMonth(day))]
      : view === "week"
        ? [startOfWeek(day), endOfWeek(day)]
        : [day, day];

  const [startISO, endISO] = [
    zonedStartOfDay(rangeDays[0], tz.zone).toISOString(),
    zonedEndOfDay(rangeDays[1], tz.zone).toISOString(),
  ];

  const resourceIds = asFacetInts(facets.resourceId);
  const locationIds = asFacetInts(facets.locationId);

  const q = useReservations(startISO, endISO, {
    q: debouncedQ,
    resourceId: resourceIds,
    locationId: locationIds,
  });
  const resourcesQ = useResources();
  const locationsQ = useLocations();

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

  // Narrow lanes when a resource/location facet is active (permission filter stays above).
  const filteredResources = React.useMemo(() => {
    let list = resources;
    if (resourceIds?.length)
      list = list.filter((r) => resourceIds.includes(r.id));
    if (locationIds?.length)
      // Match on the nested location relation — see the note in types/api.ts.
      list = list.filter((r) => r.location?.id != null && locationIds.includes(r.location.id));
    return list;
  }, [resources, resourceIds, locationIds]);

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "resourceId",
        label: "Resource",
        allLabel: "All resources",
        multiple: true,
        options: resources.map((r) => ({
          value: String(r.id),
          label: resourceLabel(r).name,
        })),
      },
      {
        kind: "select",
        key: "locationId",
        label: "Location",
        allLabel: "All locations",
        multiple: true,
        options: (locationsQ.data ?? []).map((l) => ({
          value: String(l.id),
          label: l.name,
        })),
      },
    ],
    [resources, locationsQ.data]
  );

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
    cancelDialog,
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
    <TableView>
      <TableView.Header>
        <PageHeader
          title="The Ramp"
          subtitle="Dispatch board — aircraft, instructors and students at a glance."
          actions={
            <>
              {isDesktop && (
                <ViewModeToggle value={presentation} onChange={setPresentation} />
              )}
              {staff && (
                <Button onClick={openNew}>
                  <Plus className="size-4" /> New reservation
                </Button>
              )}
            </>
          }
        />

        <ScheduleControls
          day={day}
          onDayChange={setDay}
          view={view}
          onViewChange={setView}
          count={count}
        />
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search people, aircraft, dual, solo…"
          aria-label="Search schedule"
          facets={facetDefs}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </TableView.Header>

      <TableView.Body className="flex flex-col overflow-hidden">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
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
            showBoard ? (
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
            showBoard ? (
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
          ) : showBoard ? (
            <LaneGrid
              day={day}
              resources={filteredResources}
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
      </TableView.Body>

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

      <CancelReservationDialog {...cancelDialog} />

      <ReservationDetailSheet
        reservation={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCancel={handleCancel}
        onEdit={startEdit}
      />
    </TableView>
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
