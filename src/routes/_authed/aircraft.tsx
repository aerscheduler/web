import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlaneTakeoff, Plus } from "lucide-react";
import { toast } from "sonner";
import { pageRows, usePlanesPage, useLocations } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageResources } from "@/lib/permissions";
import type { Resource } from "@/types/api";
import { AircraftCard, type AircraftActions } from "@/components/aircraft/aircraft-card";
import { AircraftListRow } from "@/components/aircraft/aircraft-list-row";
import { AircraftFormModal } from "@/components/aircraft/aircraft-form";
import { GroundModal } from "@/components/aircraft/ground-modal";
import { ApproveRentersSheet } from "@/components/aircraft/approve-renters-sheet";
import { AircraftDetailSheet } from "@/components/aircraft/aircraft-detail-sheet";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ViewModeToggle, type ViewMode } from "@/components/view-mode-toggle";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useListQueryState, asFacetInts, validateListSearch } from "@/lib/list-query-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FACET_KEYS = ["grounded", "locationId"] as const;

export const Route = createFileRoute("/_authed/aircraft")({
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: AircraftPage,
});

function AircraftPage() {
  const locationsQ = useLocations();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "aircraft",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
  });

  const [view, setView] = usePersistedState<ViewMode>("view:aircraft", "grid");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Resource | null>(null);
  const [grounding, setGrounding] = React.useState<Resource | null>(null);
  const [approving, setApproving] = React.useState<Resource | null>(null);
  const [detail, setDetail] = React.useState<Resource | null>(null);

  const locations = locationsQ.data ?? [];
  const locationIds = asFacetInts(facets.locationId);

  const fleetFilter = {
    q: debouncedQ,
    grounded: typeof facets.grounded === "boolean" ? facets.grounded : undefined,
    locationId: locationIds,
  };
  const paging = usePaging({ resetKey: fleetFilter });
  const q = usePlanesPage(fleetFilter, paging);
  const { rows: planes, total } = pageRows(q);

  const filtersActive =
    !!debouncedQ ||
    facets.grounded !== undefined ||
    (locationIds?.length ?? 0) > 0;

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "boolean",
        key: "grounded",
        label: "Status",
        trueLabel: "Grounded",
        falseLabel: "Available",
      },
      {
        kind: "select",
        key: "locationId",
        label: "Location",
        allLabel: "All locations",
        multiple: true,
        options: locations.map((l) => ({ value: String(l.id), label: l.name })),
      },
    ],
    [locations]
  );

  // Ungrounding is a one-shot patch against an arbitrary id (the shared hook is fixed-id).
  const unground = useMutation({
    mutationFn: (id: number) =>
      api<Resource>(`/resources/${id}`, {
        method: "PATCH",
        body: { type: { plane: { grounded: false, groundedReason: null } } },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });

  const actions: AircraftActions = {
    onEdit: (r) => setEditing(r),
    onApprove: (r) => setApproving(r),
    onDetails: (r) => setDetail(r),
    onToggleGround: async (r) => {
      const p = r.type?.plane;
      if (!p) return;
      if (p.grounded) {
        const ok = await confirm({
          title: `Return ${p.tailNumber} to service?`,
          description: "This aircraft will be schedulable again.",
          confirmLabel: "Return to service",
        });
        if (!ok) return;
        unground.mutate(r.id, {
          onSuccess: () => toast.success(`${p.tailNumber} returned to service`),
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Couldn't update aircraft"),
        });
      } else {
        setGrounding(r);
      }
    },
  };

  // Creating aircraft is admin-only on the server; hide the trigger otherwise.
  const addButton = canManageResources(roles) ? (
    <Button onClick={() => setAddOpen(true)}>
      <Plus className="size-4" /> Add aircraft
    </Button>
  ) : null;

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Aircraft"
          subtitle={
            q.data
              ? `${total.toLocaleString()} ${total === 1 ? "tail" : "tails"} in the fleet`
              : "Your fleet"
          }
          actions={
            <>
              {(total > 0 || filtersActive) && (
                <ViewModeToggle value={view} onChange={setView} />
              )}
              {addButton}
            </>
          }
        />
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search tail, make, model…"
          aria-label="Search aircraft"
          facets={facetDefs}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </TableView.Header>

      {q.isPending ? (
        <TableView.Body>
          <CardGridSkeleton />
        </TableView.Body>
      ) : q.isError ? (
        <Card className="min-h-0 flex-1">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : total === 0 && !filtersActive ? (
        <Card className="min-h-0 flex-1">
          <EmptyState
            icon={PlaneTakeoff}
            title="No aircraft yet"
            body="No aircraft yet. Add your first tail to make the schedule real."
            action={addButton}
          />
        </Card>
      ) : total === 0 ? (
        <Card className="min-h-0 flex-1">
          <EmptyState
            icon={PlaneTakeoff}
            title="No aircraft match"
            body="Try a different tail number, make, or model."
          />
        </Card>
      ) : (
        <>
          <TableView.Body>
            {view === "grid" ? (
              <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", q.isFetching && "opacity-60")}>
                {planes.map((r) => (
                  <AircraftCard key={r.id} r={r} actions={actions} />
                ))}
              </div>
            ) : (
              <Card className={cn("divide-y divide-border overflow-hidden", q.isFetching && "opacity-60")}>
                {planes.map((r) => (
                  <AircraftListRow key={r.id} r={r} actions={actions} />
                ))}
              </Card>
            )}
          </TableView.Body>
          <TablePagination paging={paging} total={total} returned={planes.length} loading={q.isFetching} />
        </>
      )}

      <AircraftFormModal
        open={addOpen}
        onOpenChange={setAddOpen}
        locations={locations}
      />
      <AircraftFormModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        resource={editing}
        locations={locations}
      />
      <GroundModal
        open={!!grounding}
        onOpenChange={(o) => !o && setGrounding(null)}
        resource={grounding}
      />
      <ApproveRentersSheet
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        resource={approving}
      />
      <AircraftDetailSheet
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        resource={detail}
      />
    </TableView>
  );
}
