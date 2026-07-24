import { createFileRoute } from "@tanstack/react-router";
import { Gauge, Plane, PlaneTakeoff, Plus } from "lucide-react";
import { usePlanes } from "@/features/queries";
import type { Resource } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/aircraft")({
  component: AircraftPage,
});

function AircraftPage() {
  const q = usePlanes();
  const planes = q.data ?? [];

  return (
    <div>
      <PageHeader
        title="Aircraft"
        subtitle={q.data ? `${planes.length} in the fleet` : "Your fleet"}
        actions={
          <Button disabled title="Coming soon">
            <Plus className="size-4" /> Add aircraft
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-28 w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </Card>
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : planes.length === 0 ? (
        <Card>
          <EmptyState
            icon={PlaneTakeoff}
            title="No aircraft yet"
            body="Add your planes to start scheduling and billing flight time."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planes.map((r) => (
            <PlaneCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaneCard({ r }: { r: Resource }) {
  const p = r.type?.plane;
  if (!p) return null;

  const status = p.grounded
    ? { label: "Grounded", variant: "danger" as const }
    : p.rampedIn
      ? { label: "Ramped in", variant: "warning" as const }
      : { label: "Available", variant: "success" as const };

  const rate = p.cost?.wetRate ?? p.cost?.dryRate;
  const rateLabel = p.cost?.wetRate ? "wet" : p.cost?.dryRate ? "dry" : null;

  return (
    <Card className="overflow-hidden">
      <div className="relative h-28 bg-sidebar">
        {r.featuredImage ? (
          <img src={r.featuredImage} alt={p.tailNumber} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-white/25">
            <Plane className="size-10" />
          </div>
        )}
        <div className="absolute right-3 top-3">
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-mono text-lg font-semibold tracking-tight">{p.tailNumber}</div>
          {rate != null && (
            <div className="text-sm font-medium tabular-nums">
              {formatMoney(rate)}
              <span className="text-xs text-muted-foreground">/hr {rateLabel}</span>
            </div>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {[p.year, p.make, p.model].filter(Boolean).join(" ") || "Aircraft"}
        </div>
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Gauge className="size-3.5" /> {Math.round(p.hobbsTime)} hobbs
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="size-3.5" /> {Math.round(p.tachTime)} tach
          </span>
          {p.categoryClass && (
            <span className="ml-auto truncate capitalize">{p.categoryClass}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
