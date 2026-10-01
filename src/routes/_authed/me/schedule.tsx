import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, endOfDay, endOfWeek, startOfDay, startOfWeek } from "date-fns";
import { CalendarClock, CalendarPlus, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { bookActionLabel, bookingNouns } from "@/lib/permissions";
import { useLocations, useResources, useUserReservations } from "@/features/queries";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
import type { ListTableSort } from "@/components/list-table";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  ReservationListSkeleton,
  ReservationListTable,
  asGroupBy,
  useReservationGroups,
  type ReservationGroupBy,
} from "@/components/schedule/reservation-list-table";
import { useListQueryState, asFacetInts, validateListSearch } from "@/lib/list-query-state";
import {
  ME_SCHEDULE_TAB_VALUES,
  ME_SCHEDULE_TABS,
  type MeScheduleTab,
} from "@/lib/me-schedule-sections";
import { orgSlotOffersEnabled } from "@/lib/slot-offers-enabled";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";
import { MySlotOffersPanel } from "@/components/slot-offers/my-slot-offers-panel";
import { FirstDibsCallout } from "@/components/slot-offers/quick-standby";
import { MyBookingRequestsPanel } from "@/components/booking-requests/my-booking-requests-panel";
import { resourceLabel } from "@/types/api";

/** `when` is the date window: the three ranges that used to be buttons above the list. */
export const FACET_KEYS = ["when", "resourceId", "locationId"] as const;

export const Route = createFileRoute("/_authed/me/schedule")({
  /** `reservation` = which booking the detail panel shows. Outside the facet list
   *  so it is never persisted and reopened on a later visit; a number so the
   *  router doesn't JSON-quote it into `?reservation=%221204%22`.
   *  `tab` picks Schedule vs Slot offers (deep-linkable from old /me/slot-offers). */
  validateSearch: (s) => {
    const list = validateListSearch(s, [...FACET_KEYS]);
    const reservation = Number.parseInt(String(s.reservation ?? ""), 10);
    const tabRaw = s.tab;
    const tab =
      typeof tabRaw === "string" &&
      (ME_SCHEDULE_TAB_VALUES as readonly string[]).includes(tabRaw)
        ? (tabRaw as MeScheduleTab)
        : undefined;
    return {
      ...list,
      ...(Number.isFinite(reservation) ? { reservation } : {}),
      ...(tab ? { tab } : {}),
    };
  },
  component: MySchedulePage,
});

type Range = "upcoming" | "week" | "past";

// The first is the default: a required facet shows no chip while it holds the first option.
const RANGES: { value: Range; label: string }[] = [
  { value: "upcoming", label: "Upcoming 30 days" },
  { value: "week", label: "This week" },
  { value: "past", label: "Past 30 days" },
];

function asRange(v: unknown): Range {
  return RANGES.some((r) => r.value === v) ? (v as Range) : "upcoming";
}


function rangeBounds(range: Range, now: Date): [string, string] {
  switch (range) {
    case "week":
      return [startOfWeek(now).toISOString(), endOfWeek(now).toISOString()];
    case "past":
      return [startOfDay(addDays(now, -30)).toISOString(), endOfDay(now).toISOString()];
    case "upcoming":
    default:
      return [startOfDay(now).toISOString(), endOfDay(addDays(now, 30)).toISOString()];
  }
}


function MySchedulePage() {
  const { organization, userId, roles } = useAuth();
  const bookLabel = bookActionLabel(roles);
  // A technician's calendar holds maintenance, not flights.
  const bookings = bookingNouns(roles);
  const maintenanceOnly = bookings.many === "maintenance";
  const slotOffersOn = orgSlotOffersEnabled(organization);
  const scheduleRail = React.useMemo(
    () => [
      {
        items: ME_SCHEDULE_TABS.filter((t) => t.value !== "offers" || slotOffersOn),
      },
    ],
    [slotOffersOn]
  );
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const navigateSearch = navigate as Parameters<typeof useListQueryState>[0]["navigate"];
  const { reservation: openReservationId, tab: tabSearch, ...listSearch } = routeSearch;
  const activeTab: MeScheduleTab =
    tabSearch === "offers" && !slotOffersOn ? "schedule" : (tabSearch ?? "schedule");
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "me-schedule",
    search: listSearch,
    navigate: navigateSearch,
    facetKeys: [...FACET_KEYS],
    defaults: { when: "upcoming" },
  });

  // `replace`, so ↑/↓ doesn't stack one history entry per booking.
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
  const range = asRange(facets.when);
  const [groupByRaw, setGroupBy] = usePersistedState<ReservationGroupBy>("view:me-schedule-group", "date");
  const groupBy = asGroupBy(groupByRaw);
  const [sort, setSort] = React.useState<ListTableSort | null>(null);

  const now = React.useMemo(() => new Date(), []);
  const [startISO, endISO] = rangeBounds(range, now);

  const resourceIds = asFacetInts(facets.resourceId);
  const locationIds = asFacetInts(facets.locationId);

  const resourcesQ = useResources();
  const locationsQ = useLocations();
  const q = useUserReservations(userId, startISO, endISO, {
    q: debouncedQ,
    resourceId: resourceIds,
    locationId: locationIds,
  });

  const reservations = React.useMemo(() => q.data ?? [], [q.data]);
  const filtersActive =
    !!debouncedQ || (resourceIds?.length ?? 0) > 0 || (locationIds?.length ?? 0) > 0;
  // The window filters what is fetched; only the other filters count as "nothing matches".
  const { groups: days, ordered } = useReservationGroups(reservations, {
    groupBy,
    sort,
    newestFirst: range === "past",
  });

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "when",
        label: "When",
        required: true,
        options: RANGES.map((r) => ({ value: r.value, label: r.label })),
      },
      {
        kind: "select",
        key: "resourceId",
        label: "Resource",
        allLabel: "All resources",
        multiple: true,
        options: (resourcesQ.data ?? []).map((r) => ({
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
    [resourcesQ.data, locationsQ.data]
  );

  // Same detail sheet the dispatch board opens: cancel and the ramp-out /
  // ramp-in / close-out flow behave identically here.
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
    selectedId,
    step,
  } = useReservationDetail(ordered, {
    selectedId: openReservationId ?? null,
    setSelectedId: setOpenReservationId,
  });

  const pick = (next: string) => {
    const tab = (ME_SCHEDULE_TAB_VALUES as readonly string[]).includes(next)
      ? (next as MeScheduleTab)
      : "schedule";
    if (tab === "offers" || tab === "requests") setOpen(false);
    void navigate({
      search: (prev) => {
        const { reservation: _drop, ...rest } = prev as Record<string, unknown> & {
          reservation?: number;
        };
        // Default tab omits the param so /me/schedule stays clean.
        if (tab === "schedule") {
          const { tab: _tab, ...withoutTab } = rest as { tab?: string };
          return withoutTab;
        }
        return { ...rest, tab };
      },
      replace: true,
    });
  };

  if (organization === null) {
    return (
      <TableView>
        <TableView.Header>
          <PageHeader title="Schedule" />
        </TableView.Header>
        <Card className="flex flex-col min-h-0 flex-1">
          <EmptyState
            icon={UserRound}
            title="You're not in an organization yet"
            body="Accept an invite or ask your organization's admin to add you, and your schedule will show up here."
            docs="join-a-school"
          />
        </Card>
      </TableView>
    );
  }

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Schedule"
          subtitle={
            maintenanceOnly
              ? "The maintenance you've scheduled."
              : "Your flights, ground and sim sessions."
          }
          actions={
            <Button asChild>
              <Link to="/me/book">
                <CalendarPlus className="size-4" /> Book
              </Link>
            </Button>
          }
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail
          label="Schedule"
          sections={scheduleRail}
          value={activeTab}
          onChange={pick}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          {activeTab === "offers" && slotOffersOn ? (
            <MySlotOffersPanel />
          ) : activeTab === "requests" ? (
            <MyBookingRequestsPanel />
          ) : (
            <>
              <FirstDibsCallout />
              <ListSearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search people, aircraft, dual, solo…"
                aria-label="Search calendar"
                facets={facetDefs}
                filterValues={facets}
                onFilterChange={setFacets}
              />

              {q.isPending ? (
                <ReservationListSkeleton groupBy={groupBy} hideColumns={["billing"]} className="min-h-0 flex-1" />
              ) : q.isError ? (
                <Card className="flex flex-col min-h-0 flex-1 p-0">
                  <ErrorState error={q.error} onRetry={() => q.refetch()} />
                </Card>
              ) : days.length === 0 && !filtersActive && range === "upcoming" ? (
                <Card className="flex flex-col min-h-0 flex-1 p-0">
                  <EmptyState
                    graphic="my-schedule"
                    title={`No ${bookings.many} on your schedule`}
                    body="Book one to get started. You only see the kinds of booking your roles allow."
                    docs="book-a-reservation"
                    action={
                      <Button asChild>
                        <Link to="/me/book">
                          <CalendarPlus className="size-4" /> {bookLabel}
                        </Link>
                      </Button>
                    }
                  />
                </Card>
              ) : days.length === 0 ? (
                <Card className="flex flex-col min-h-0 flex-1 p-0">
                  <EmptyState
                    icon={CalendarClock}
                    title="No matches"
                    body={
                      filtersActive
                        ? "Nothing matches that search."
                        : `No ${bookings.many} ${range === "past" ? "in the past 30 days" : "this week"}.`
                    }
                  />
                </Card>
              ) : (
                <div data-doc-shot="my-schedule-list" className="flex min-h-0 flex-1 flex-col">
                  <ReservationListTable
                    label="Your schedule"
                    docShot="me-schedule-list"
                    className="min-h-0"
                    groups={days}
                    groupBy={groupBy}
                    onGroupByChange={setGroupBy}
                    sort={sort}
                    onSortChange={setSort}
                    selectedId={selectedId}
                    onOpen={openDetail}
                    hideColumns={["billing"]}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
        open={open && activeTab === "schedule"}
        onOpenChange={setOpen}
        onCancel={cancelReservation}
        onEdit={startEdit}
        onStep={step}
      />
    </TableView>
  );
}
