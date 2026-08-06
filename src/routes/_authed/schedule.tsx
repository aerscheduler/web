import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarClock, Plus } from "lucide-react";
import { useLocations, useOrgUsers, useReservations, useResources } from "@/features/queries";
import { zonedStartOfDay, zonedEndOfDay } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { resourceLabel, rolesOf, type Reservation, type Resource, type Role } from "@/types/api";
import { useAuth } from "@/lib/auth";
import {
  bookActionLabel,
  canSeeRoomLanes,
  canSeeSimulatorLanes,
  canSelfBook,
  isStaff,
} from "@/lib/permissions";
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
import { useScheduleDrag } from "@/components/schedule/use-schedule-drag";
import { DragCallout } from "@/components/schedule/drag-affordances";
import {
  BILLING_OPTIONS,
  RAMP_OPTIONS,
  hasBoardFilters,
  matchesBoardFilters,
  type BoardMarks,
} from "@/components/schedule/board-filters";
import { TYPE_LABEL, TYPE_ORDER } from "@/components/schedule/meta";

/**
 * Facets that remove LANES from the board. Narrowing to two aircraft is honest — the rows
 * you didn't ask for are visibly gone, so nothing claims to be free that isn't.
 */
const ROW_FACET_KEYS = ["resourceId", "locationId"] as const;

/**
 * Facets that mark BOOKINGS. These never remove anything: they dim non-matches so the
 * board's occupancy stays true. See `board-filters.ts` for why that distinction matters.
 */
const BLOCK_FACET_KEYS = ["personId", "ramp", "billing", "type"] as const;

const FACET_KEYS = [...ROW_FACET_KEYS, ...BLOCK_FACET_KEYS] as const;

export const Route = createFileRoute("/_authed/schedule")({
  /**
   * `reservation` is which booking the detail panel is showing — kept OUTSIDE the
   * facet list on purpose. Facets are remembered in localStorage and restored on
   * the next visit, and a booking reopened days later is not something anyone
   * asked for. Held as a NUMBER because the router JSON-encodes strings, which
   * would spell it `?reservation=%221204%22`.
   */
  validateSearch: (s) => {
    const list = validateListSearch(s, [...FACET_KEYS]);
    const reservation = Number.parseInt(String(s.reservation ?? ""), 10);
    return {
      ...list,
      ...(Number.isFinite(reservation) ? { reservation } : {}),
    };
  },
  component: SchedulePage,
});

const REFRESH_MS = 20_000;

function SchedulePage() {
  const { roles, orgUserId, userId } = useAuth();
  //Who may open a booking from the board, and as what.
  //
  //Staff dispatch: they assign other people, from a full picker.
  //
  //Everyone else self-books — the same form /me/book shows, in a modal, with them
  //already on it. This board used to be flatly read-only for them, which made the
  //calendar the one place in the product where clicking an empty Tuesday morning did
  //nothing at all: the Book page would take the reservation, the mobile app's calendar
  //takes it on a tap, and a student staring at the gap they wanted had to go find
  //another page and re-enter the slot by hand.
  const staff = isStaff(roles);
  const selfBooks =
    !staff && canSelfBook(roles) && orgUserId != null && userId != null;
  const canBook = staff || selfBooks;
  const tz = useTimeZone();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const navigateSearch = navigate as Parameters<typeof useListQueryState>[0]["navigate"];
  // Which booking is open is not a list filter — split off so it never reaches the
  // facet machinery (string-valued, and persisted to localStorage).
  const { reservation: openReservationId, ...listSearch } = routeSearch;
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "schedule",
    search: listSearch,
    navigate: navigateSearch,
    facetKeys: [...FACET_KEYS],
  });

  // `replace`, always: stepping through bookings with ↑/↓ would otherwise stack a
  // history entry per record, and Back would walk the panel backwards one booking
  // at a time instead of leaving the board.
  const setOpenReservationId = React.useCallback(
    (id: number | null) => {
      navigateSearch({
        search: ({ reservation: _drop, ...rest }: Record<string, unknown>) =>
          id == null ? rest : { ...rest, reservation: id },
        replace: true,
      });
    },
    [navigateSearch]
  );
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

  //Only the ROW facets are sent to the server. `q` deliberately is not: the board dims
  //non-matching bookings instead of dropping them, and it can't dim rows it was never
  //given. Matching runs in the browser over the range we already fetched — see
  //`board-filters.ts`. That also keeps one cache entry per date range rather than one per
  //filter permutation, which is what makes the 20s auto-refresh below worth anything.
  const q = useReservations(startISO, endISO, {
    resourceId: resourceIds,
    locationId: locationIds,
  });
  const resourcesQ = useResources();
  const locationsQ = useLocations();
  const peopleQ = useOrgUsers();

  const reservations = React.useMemo(() => q.data ?? [], [q.data]);
  const resources = useResolvedResources(resourcesQ.data, reservations, roles);

  //Drag-to-reschedule. Instantiated once here and handed to every grid, so the day board
  //and the week board share one set of rules, one optimistic write and one undo — see
  //`use-schedule-drag.ts`. Permission is decided per booking inside, not per role here: a
  //student may drag their own lesson even though they can't create one.
  //The roster is already loaded for the Personnel filter, and it is the only place the
  //client can see who has been grounded — a reservation's personnel carry just id and name.
  const groundedCrew = React.useCallback(
    (id: number) => {
      const ou = (peopleQ.data ?? []).find((p) => p.id === id);
      if (!ou?.grounded) return null;
      return {
        name: ou.user?.name ?? ou.identifier ?? `Member #${id}`,
        reason: ou.groundedReason ?? null,
      };
    },
    [peopleQ.data]
  );

  const drag = useScheduleDrag({
    zone: tz.zone,
    reservations,
    resources,
    roles,
    orgUserId,
    groundedCrew,
  });

  // Live board: quietly re-pull the range on an interval (ref keeps the timer
  // stable across renders while always calling the latest refetch).
  const refetchRef = React.useRef(q.refetch);
  refetchRef.current = q.refetch;
  //A refetch mid-drag would yank the block out from under the cursor, and one landing
  //between the optimistic write and the server's answer would flash it back to where it
  //started. Skipping a tick costs 20 seconds of staleness; both alternatives look broken.
  const dragBusyRef = React.useRef(false);
  dragBusyRef.current = drag.isBusy;
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (dragBusyRef.current) return;
      void refetchRef.current();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

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

  //Which bookings the block filters mark. `null` when nothing is selected — the board then
  //renders every block at full strength rather than treating "no filter" as "all match",
  //which would still pay for a Set on every render and every auto-refresh.
  //`debouncedQ` is undefined when blank (it was shaped for API params, where an empty `q`
  //should be omitted). Everything below treats "no search" as the empty string.
  const queryText = debouncedQ ?? "";
  const dimming = hasBoardFilters(facets, queryText);
  const matchedIds = React.useMemo(() => {
    if (!dimming) return null;
    //One `now` for the whole pass so "overdue" can't flip mid-list.
    const now = new Date();
    const ids = new Set<number>();
    for (const r of reservations) {
      if (matchesBoardFilters(r, facets, queryText, now)) ids.add(r.id);
    }
    return ids;
  }, [dimming, reservations, facets, queryText]);

  const locationNames = React.useMemo(
    () => new Map((locationsQ.data ?? []).map((l) => [l.id, l.name])),
    [locationsQ.data]
  );

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "resourceId",
        label: "Resource",
        allLabel: "All resources",
        multiple: true,
        //`hint` is searched as well as shown, so typing an airport in the Resource filter
        //surfaces every aircraft based there — the fleet list itself never says "KTEST".
        //Resources carry only a { id } location stub, so the name is looked up from the
        //locations list rather than read off the resource.
        options: resources.map((r) => ({
          value: String(r.id),
          label: resourceLabel(r).name,
          hint: r.location?.id != null ? locationNames.get(r.location.id) : undefined,
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
      {
        kind: "select",
        key: "personId",
        label: "Personnel",
        allLabel: "Anyone",
        multiple: true,
        //Everyone in the org, not just those rostered today — a dispatcher pins an
        //instructor and then pages through the week, and an option list rebuilt from the
        //visible day would drop out from under them when they stepped to a day off.
        //Role rides along as a searchable hint, so "instructor" narrows to the instructors
        //without anyone having to remember which of forty names those are.
        options: (peopleQ.data ?? [])
          .map((ou) => ({
            value: String(ou.id),
            label: ou.user?.name ?? ou.user?.email ?? `#${ou.id}`,
            hint: rolesOf(ou).join(" ") || undefined,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        kind: "select",
        key: "ramp",
        label: "Ramp status",
        allLabel: "Any status",
        multiple: true,
        options: RAMP_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        kind: "select",
        key: "billing",
        label: "Billing",
        allLabel: "Any billing",
        multiple: true,
        options: BILLING_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        kind: "select",
        key: "type",
        label: "Type",
        allLabel: "All types",
        multiple: true,
        options: TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABEL[t] })),
      },
    ],
    [resources, locationsQ.data, locationNames, peopleQ.data]
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
    selectedId,
    step,
  } = useReservationDetail(reservations, {
    selectedId: openReservationId ?? null,
    setSelectedId: setOpenReservationId,
  });

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
  //Anyone who can't book at all still gets no click-to-create regions, rather than ones
  //that silently do nothing.
  const onCreate = canBook ? openCreate : undefined;
  //"New reservation" when you're dispatching someone else; "Book a flight" — or
  //"Schedule maintenance" for a technician — when the booking is your own.
  const bookLabel = staff ? "New reservation" : bookActionLabel(roles);
  //Spread onto every CREATE form on this page so the empty-slot click and "Book another
  //like this" can't drift into showing a member two different booking forms.
  const selfProps = selfBooks
    ? { variant: "self" as const, self: { orgUserId: orgUserId!, userId: userId! } }
    : {};

  const count = q.data ? reservations.length : null;

  //Spread into every view so all five stay in agreement about what is lit — a booking
  //dimmed on the lane board and solid in the agenda would be worse than not dimming.
  const marks: BoardMarks = { matchedIds, query: queryText, selectedId };

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
              {canBook && (
                <Button onClick={openNew}>
                  <Plus className="size-4" /> {bookLabel}
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
          matchCount={matchedIds ? matchedIds.size : null}
        />
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search…"
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
              body="Book a reservation to see aircraft and instructors line up."
              action={
                canBook && (
                  <Button onClick={openNew}>
                    <Plus className="size-4" /> {bookLabel}
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
                {...marks}
              />
            ) : (
              <MonthAgenda
                reservations={reservations}
                onView={openDetail}
                onEdit={startEdit}
                onCancel={handleCancel}
                {...marks}
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
                drag={drag}
                {...marks}
              />
            ) : (
              <AgendaList
                reservations={reservations}
                onView={openDetail}
                onEdit={startEdit}
                onCancel={handleCancel}
                {...marks}
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
              drag={drag}
              {...marks}
            />
          ) : (
            <AgendaList
              reservations={reservations}
              onView={openDetail}
              onEdit={startEdit}
              onDuplicate={setDuplicating}
              onCancel={handleCancel}
              {...marks}
            />
          )}
        </Card>
      </TableView.Body>

      {/* One form, two audiences — see ReservationForm. A member gets the SAME component
          /me/book renders, with themselves already seated on the booking, drawn as a
          modal so the slot they clicked isn't traded for a page navigation. */}
      {canBook && (
        <ReservationForm
          open={formOpen}
          onOpenChange={setFormOpen}
          draft={draft}
          presentation="modal"
          {...selfProps}
        />
      )}

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={{ date: new Date(editing.start) }}
          editing={editing}
        />
      )}

      {/* "Book another like this" is a CREATE, so it takes the same variant the empty-slot
          click does. Left on dispatch it would be the one place a student got the other
          form — a Title field and two full personnel pickers — from the same menu.
          Editing above deliberately stays on dispatch: an update REPLACES personnel, and
          the self shape would quietly reseat a booking somebody else is already on. */}
      {duplicating && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setDuplicating(null)}
          draft={{ date: new Date(duplicating.start) }}
          duplicating={duplicating}
          presentation="modal"
          {...selfProps}
        />
      )}

      {/* One callout for every board — it's a viewport overlay that follows the cursor, not
          something a lane owns, so it can't be clipped by the board or change its layout. */}
      <DragCallout drag={drag} />

      <CancelReservationDialog {...cancelDialog} />

      <ReservationDetailSheet
        reservation={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCancel={handleCancel}
        onEdit={startEdit}
        onStep={step}
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
