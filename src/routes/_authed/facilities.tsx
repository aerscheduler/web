import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DoorOpen, MonitorPlay, Plus } from "lucide-react";
import { pageRows, useLocations, useRoomsPage, useSimulatorsPage } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { guardRoute } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import type { Resource } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ViewModeToggle, type ViewMode } from "@/components/view-mode-toggle";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useListQueryState, asFacetInts, validateListSearch } from "@/lib/list-query-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import {
  FacilityFormModal,
  type FacilityKind,
} from "@/components/facilities/facility-form";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

const FACET_KEYS = ["tab", "locationId", "grounded"] as const;

export const Route = createFileRoute("/_authed/facilities")({
  beforeLoad: guardRoute("/facilities"),
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: FacilitiesPage,
});

type TabKey = "simulators" | "rooms";

/**
 * Two rails, not two tabs: a simulator and a classroom share nothing but being
 * bookable — different filters, different cards, different empty states — so
 * these are two screens rather than two filters of one list. `?tab=` keeps its
 * old key and values, so existing links and saved filters still land right.
 */
const SECTIONS: RailSection[] = [
  {
    items: [
      { value: "simulators", label: "Simulators", icon: MonitorPlay },
      { value: "rooms", label: "Rooms", icon: DoorOpen },
    ],
  },
];

const panelClass = "flex min-h-0 min-w-0 flex-1 flex-col gap-3";

function SimulatorCard({ r }: { r: Resource }) {
  const sim = r.type?.simulator;
  if (!sim) return null;
  const rate = sim.cost?.rate;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MonitorPlay className="size-4 shrink-0 text-res-sim" />
            <span className="truncate font-semibold">{sim.name}</span>
          </div>
          {r.location?.name && (
            <div className="truncate text-xs text-muted-foreground">{r.location.name}</div>
          )}
        </div>
        {sim.grounded ? (
          <Badge variant="danger">Grounded</Badge>
        ) : (
          <Badge variant="secondary">Available</Badge>
        )}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex gap-4">
          <span>
            <span className="tnum font-medium text-foreground">
              {((sim.hobbsTime ?? 0) / 10).toFixed(1)}
            </span>{" "}
            Hobbs
          </span>
          <span>
            <span className="tnum font-medium text-foreground">
              {((sim.tachTime ?? 0) / 10).toFixed(1)}
            </span>{" "}
            tach
          </span>
        </div>
        {rate != null && (
          <div className="text-right text-sm">
            <span className="tnum font-semibold text-foreground">{formatMoney(rate)}</span>
            <span className="text-xs text-muted-foreground">
              {" "}
              /{sim.cost?.billByHobbsTime ? "Hobbs" : "tach"} hr
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function SimulatorListRow({ r }: { r: Resource }) {
  const sim = r.type?.simulator;
  if (!sim) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-res-sim">
        <MonitorPlay className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{sim.name}</div>
        {r.location?.name && (
          <div className="truncate text-xs text-muted-foreground">{r.location.name}</div>
        )}
      </div>
      {sim.grounded ? (
        <Badge variant="danger">Grounded</Badge>
      ) : (
        <Badge variant="secondary">Available</Badge>
      )}
    </div>
  );
}

function FacilitiesPage() {
  const { organization } = useAuth();
  const locationsQ = useLocations({ enabled: organization != null });
  const locations = locationsQ.data ?? [];

  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "facilities",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
    defaults: { tab: "simulators" },
  });

  const [addKind, setAddKind] = useState<FacilityKind | null>(null);
  const [view, setView] = usePersistedState<ViewMode>("view:facilities", "grid");

  const tab: TabKey = facets.tab === "rooms" ? "rooms" : "simulators";
  const locationIds = asFacetInts(facets.locationId);

  const simFilter = {
    q: debouncedQ,
    locationId: locationIds,
    grounded: typeof facets.grounded === "boolean" ? facets.grounded : undefined,
  };
  const simPaging = usePaging({ resetKey: simFilter });
  const simsQ = useSimulatorsPage(simFilter, simPaging, { enabled: organization != null });

  const roomFilter = { q: debouncedQ, locationId: locationIds };
  const roomPaging = usePaging({ resetKey: roomFilter });
  const roomsQ = useRoomsPage(roomFilter, roomPaging, { enabled: organization != null });

  const { rows: sims, total: simTotal } = pageRows(simsQ);
  const { rows: rooms, total: roomTotal } = pageRows(roomsQ);

  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: String(l.id), label: l.name })),
    [locations]
  );

  const simFacetDefs = useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "locationId",
        label: "Location",
        allLabel: "All locations",
        multiple: true,
        options: locationOptions,
      },
      {
        kind: "boolean",
        key: "grounded",
        label: "Status",
        trueLabel: "Grounded",
        falseLabel: "Available",
      },
    ],
    [locationOptions]
  );

  const roomFacetDefs = useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "locationId",
        label: "Location",
        allLabel: "All locations",
        multiple: true,
        options: locationOptions,
      },
    ],
    [locationOptions]
  );

  const simFiltersActive =
    !!debouncedQ ||
    facets.grounded !== undefined ||
    (typeof facets.locationId === "string" && facets.locationId !== "");
  const roomFiltersActive =
    !!debouncedQ || (typeof facets.locationId === "string" && facets.locationId !== "");

  const addButton =
    tab === "simulators" ? (
      <Button onClick={() => setAddKind("simulator")}>
        <Plus className="size-4" /> Add simulator
      </Button>
    ) : (
      <Button onClick={() => setAddKind("room")}>
        <Plus className="size-4" /> Add room
      </Button>
    );

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Facilities"
          subtitle="Simulators and ground-school rooms — bookable for sim and ground lessons."
          actions={
            <>
              {(tab === "simulators"
                ? simTotal > 0 || simFiltersActive
                : roomTotal > 0 || roomFiltersActive) && (
                <ViewModeToggle value={view} onChange={setView} />
              )}
              {addButton}
            </>
          }
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail
          label="Facilities"
          sections={SECTIONS}
          value={tab}
          onChange={(v) => setFacets({ ...facets, tab: v as TabKey })}
        />

        {tab === "simulators" && (
          <div className={panelClass}>
            <ListSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search simulators…"
              aria-label="Search simulators"
              facets={simFacetDefs}
              filterValues={facets}
              onFilterChange={setFacets}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {simsQ.isPending ? (
                <CardGridSkeleton count={3} />
              ) : simsQ.isError ? (
                <Card>
                  <ErrorState error={simsQ.error} onRetry={() => simsQ.refetch()} />
                </Card>
              ) : simTotal === 0 && !simFiltersActive ? (
                <Card>
                  <EmptyState
                    icon={MonitorPlay}
                    title="No simulators yet"
                    body="Add a simulator to schedule and bill sim sessions."
                    action={
                      <Button size="sm" onClick={() => setAddKind("simulator")}>
                        <Plus className="size-4" /> Add simulator
                      </Button>
                    }
                  />
                </Card>
              ) : simTotal === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No simulators match your search.
                </p>
              ) : view === "grid" ? (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {sims.map((r) => (
                    <SimulatorCard key={r.id} r={r} />
                  ))}
                </div>
              ) : (
                <Card className="divide-y divide-border overflow-hidden">
                  {sims.map((r) => (
                    <SimulatorListRow key={r.id} r={r} />
                  ))}
                </Card>
              )}
            </div>
            <TablePagination
              paging={simPaging}
              total={simTotal}
              returned={sims.length}
              loading={simsQ.isFetching}
            />
          </div>
        )}

        {tab === "rooms" && (
          <div className={panelClass}>
            <ListSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search rooms…"
              aria-label="Search rooms"
              facets={roomFacetDefs}
              filterValues={facets}
              onFilterChange={setFacets}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {roomsQ.isPending ? (
                <Card className="h-24 animate-pulse" />
              ) : roomsQ.isError ? (
                <Card>
                  <ErrorState error={roomsQ.error} onRetry={() => roomsQ.refetch()} />
                </Card>
              ) : roomTotal === 0 && !roomFiltersActive ? (
                <Card>
                  <EmptyState
                    icon={DoorOpen}
                    title="No rooms yet"
                    body="Add a ground-school room to schedule ground lessons."
                    action={
                      <Button size="sm" onClick={() => setAddKind("room")}>
                        <Plus className="size-4" /> Add room
                      </Button>
                    }
                  />
                </Card>
              ) : roomTotal === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No rooms match your search.
                </p>
              ) : view === "grid" ? (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {rooms.map((r) => {
                    const room = r.type?.room;
                    if (!room) return null;
                    return (
                      <Card key={r.id} className="flex items-center gap-3 p-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          <DoorOpen className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{room.roomNumber}</div>
                          {r.location?.name && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.location.name}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="divide-y divide-border overflow-hidden">
                  {rooms.map((r) => {
                    const room = r.type?.room;
                    if (!room) return null;
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          <DoorOpen className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{room.roomNumber}</div>
                          {r.location?.name && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.location.name}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </div>
            <TablePagination
              paging={roomPaging}
              total={roomTotal}
              returned={rooms.length}
              loading={roomsQ.isFetching}
            />
          </div>
        )}
      </div>

      <FacilityFormModal
        open={addKind !== null}
        onOpenChange={(o) => !o && setAddKind(null)}
        kind={addKind ?? "simulator"}
        locations={locations}
      />
    </TableView>
  );
}
