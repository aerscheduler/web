import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DoorOpen, MonitorPlay, Plus } from "lucide-react";
import { useLocations, useRooms, useSimulators } from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import type { Resource } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import {
  FacilityFormModal,
  type FacilityKind,
} from "@/components/facilities/facility-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/facilities")({
  beforeLoad: guardRoute("/facilities"),
  component: FacilitiesPage,
});

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

function FacilitiesPage() {
  const { organization } = useAuth();
  const simsQ = useSimulators({ enabled: organization != null });
  const roomsQ = useRooms({ enabled: organization != null });
  const locationsQ = useLocations({ enabled: organization != null });

  const sims = simsQ.data ?? [];
  const rooms = roomsQ.data ?? [];
  const locations = locationsQ.data ?? [];

  const [addKind, setAddKind] = useState<FacilityKind | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facilities"
        subtitle="Simulators and ground-school rooms — bookable for sim and ground lessons."
      />

      {/* Simulators */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Simulators
          </h2>
          <Button size="sm" onClick={() => setAddKind("simulator")}>
            <Plus className="size-4" /> Add simulator
          </Button>
        </div>

        {simsQ.isLoading ? (
          <CardGridSkeleton count={3} />
        ) : simsQ.isError ? (
          <Card>
            <ErrorState error={simsQ.error} onRetry={() => simsQ.refetch()} />
          </Card>
        ) : sims.length === 0 ? (
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
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sims.map((r) => (
              <SimulatorCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      {/* Rooms */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rooms
          </h2>
          <Button size="sm" onClick={() => setAddKind("room")}>
            <Plus className="size-4" /> Add room
          </Button>
        </div>

        {roomsQ.isLoading ? (
          <Card className="h-24 animate-pulse" />
        ) : roomsQ.isError ? (
          <Card>
            <ErrorState error={roomsQ.error} onRetry={() => roomsQ.refetch()} />
          </Card>
        ) : rooms.length === 0 ? (
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
      </section>

      <FacilityFormModal
        open={addKind !== null}
        onOpenChange={(o) => !o && setAddKind(null)}
        kind={addKind ?? "simulator"}
        locations={locations}
      />
    </div>
  );
}
