import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DoorOpen, MonitorPlay, Plus } from "lucide-react";
import { useLocations, useRooms, useSimulators } from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import type { Resource } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ViewModeToggle, type ViewMode } from "@/components/view-mode-toggle";
import { ListSearch } from "@/components/list-search";
import { ListFilters, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import {
  FacilityFormModal,
  type FacilityKind,
} from "@/components/facilities/facility-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/facilities")({
  beforeLoad: guardRoute("/facilities"),
  component: FacilitiesPage,
});

type TabKey = "simulators" | "rooms";

const tabPanelClass =
  "mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden data-[state=inactive]:hidden";

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

  const [addKind, setAddKind] = useState<FacilityKind | null>(null);
  const [tab, setTab] = usePersistedState<TabKey>("view:facilities-tab", "simulators");
  const [view, setView] = usePersistedState<ViewMode>("view:facilities", "grid");
  const [simSearch, setSimSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const debouncedSim = useDebouncedValue(simSearch);
  const debouncedRoom = useDebouncedValue(roomSearch);
  const [simFacets, setSimFacets] = useState<ListFilterValues>({});
  const [roomFacets, setRoomFacets] = useState<ListFilterValues>({});

  const simLocationId =
    typeof simFacets.locationId === "string" ? Number(simFacets.locationId) : undefined;
  const roomLocationId =
    typeof roomFacets.locationId === "string" ? Number(roomFacets.locationId) : undefined;

  const simsQ = useSimulators(
    {
      q: debouncedSim || undefined,
      locationId: Number.isFinite(simLocationId) ? simLocationId : undefined,
      grounded: typeof simFacets.grounded === "boolean" ? simFacets.grounded : undefined,
    },
    { enabled: organization != null }
  );
  const roomsQ = useRooms(
    {
      q: debouncedRoom || undefined,
      locationId: Number.isFinite(roomLocationId) ? roomLocationId : undefined,
    },
    { enabled: organization != null }
  );

  const sims = simsQ.data ?? [];
  const rooms = roomsQ.data ?? [];

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
        options: locationOptions,
      },
    ],
    [locationOptions]
  );

  const simFiltersActive =
    !!debouncedSim ||
    simFacets.grounded !== undefined ||
    (typeof simFacets.locationId === "string" && simFacets.locationId !== "");
  const roomFiltersActive =
    !!debouncedRoom ||
    (typeof roomFacets.locationId === "string" && roomFacets.locationId !== "");

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
    <TableView>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TableView.Header>
          <PageHeader
            title="Facilities"
            subtitle="Simulators and ground-school rooms — bookable for sim and ground lessons."
            actions={
              <>
                {(tab === "simulators"
                  ? sims.length > 0 || simFiltersActive
                  : rooms.length > 0 || roomFiltersActive) && (
                  <ViewModeToggle value={view} onChange={setView} />
                )}
                {addButton}
              </>
            }
          />
          <TabsList>
            <TabsTrigger value="simulators">Simulators</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
          </TabsList>
        </TableView.Header>

        <TabsContent value="simulators" className={tabPanelClass}>
          <div className="flex flex-col gap-2">
            <ListSearch
              value={simSearch}
              onChange={setSimSearch}
              placeholder="Search simulators…"
              aria-label="Search simulators"
            />
            <ListFilters facets={simFacetDefs} values={simFacets} onChange={setSimFacets} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {simsQ.isPending ? (
              <CardGridSkeleton count={3} />
            ) : simsQ.isError ? (
              <Card>
                <ErrorState error={simsQ.error} onRetry={() => simsQ.refetch()} />
              </Card>
            ) : sims.length === 0 && !simFiltersActive ? (
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
            ) : sims.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No simulators match your search.
              </p>
            ) : view === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </TabsContent>

        <TabsContent value="rooms" className={tabPanelClass}>
          <div className="flex flex-col gap-2">
            <ListSearch
              value={roomSearch}
              onChange={setRoomSearch}
              placeholder="Search rooms…"
              aria-label="Search rooms"
            />
            <ListFilters facets={roomFacetDefs} values={roomFacets} onChange={setRoomFacets} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {roomsQ.isPending ? (
              <Card className="h-24 animate-pulse" />
            ) : roomsQ.isError ? (
              <Card>
                <ErrorState error={roomsQ.error} onRetry={() => roomsQ.refetch()} />
              </Card>
            ) : rooms.length === 0 && !roomFiltersActive ? (
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
            ) : rooms.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No rooms match your search.
              </p>
            ) : view === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </TabsContent>
      </Tabs>

      <FacilityFormModal
        open={addKind !== null}
        onOpenChange={(o) => !o && setAddKind(null)}
        kind={addKind ?? "simulator"}
        locations={locations}
      />
    </TableView>
  );
}
