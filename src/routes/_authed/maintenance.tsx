import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Plus, Wrench } from "lucide-react";
import {
  useSquawks,
  useMaintenanceReminders,
  usePlanes,
} from "@/features/queries";
import { resourceLabel, type Squawk } from "@/types/api";
import { guardRoute } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearch } from "@/components/list-search";
import { ListFilters, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { ReminderCard } from "@/components/maintenance/reminder-card";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/maintenance")({
  beforeLoad: guardRoute("/maintenance"),
  component: MaintenancePage,
});

type ViewKey = "open" | "resolved" | "reminders";

function MaintenancePage() {
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const debouncedQ = useDebouncedValue(search);
  const [facets, setFacets] = React.useState<ListFilterValues>({ view: "open" });
  const planesQ = usePlanes();

  const view: ViewKey =
    facets.view === "resolved" || facets.view === "reminders" ? facets.view : "open";
  const resourceIdRaw =
    typeof facets.resourceId === "string" ? Number(facets.resourceId) : undefined;
  const resourceId = Number.isFinite(resourceIdRaw) ? resourceIdRaw : undefined;
  const q = debouncedQ || undefined;

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "view",
        label: "Show",
        required: true,
        options: [
          { value: "open", label: "Open squawks" },
          { value: "resolved", label: "Resolved" },
          { value: "reminders", label: "Reminders" },
        ],
      },
      {
        kind: "select",
        key: "resourceId",
        label: "Aircraft",
        allLabel: "All aircraft",
        options: (planesQ.data ?? []).map((r) => ({
          value: String(r.id),
          label: resourceLabel(r).name,
        })),
      },
    ],
    [planesQ.data]
  );

  // "Open squawks" is the default — don't treat clearing the Show facet as "all views".
  function onFacetsChange(next: ListFilterValues) {
    setFacets({
      ...next,
      view: next.view === undefined || next.view === "" ? "open" : next.view,
    });
  }

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Maintenance"
          subtitle="Squawks and upcoming maintenance across the fleet."
          actions={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Log a squawk
            </Button>
          }
        />
        <div className="flex flex-col gap-2">
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder="Search squawks or reminders…"
            aria-label="Search maintenance"
          />
          <ListFilters facets={facetDefs} values={facets} onChange={onFacetsChange} />
        </div>
      </TableView.Header>

      {view === "open" && (
        <OpenSquawks onLog={() => setAddOpen(true)} q={q} resourceId={resourceId} />
      )}
      {view === "resolved" && <ResolvedSquawks q={q} resourceId={resourceId} />}
      {view === "reminders" && <Reminders q={q} resourceId={resourceId} />}

      <LogSquawkModal open={addOpen} onOpenChange={setAddOpen} />
    </TableView>
  );
}

function Frame({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isLoading)
    return (
      <TableView.Body>
        <CardGridSkeleton count={3} />
      </TableView.Body>
    );
  if (error)
    return (
      <Card className="min-h-0 flex-1 p-0">
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    );
  return <>{children}</>;
}

function OpenSquawks({
  onLog,
  q: searchQ,
  resourceId,
}: {
  onLog: () => void;
  q?: string;
  resourceId?: number;
}) {
  const q = useSquawks({ resolved: false, q: searchQ, resourceId });
  const [resolving, setResolving] = React.useState<Squawk | null>(null);
  const squawks = q.data ?? [];
  const empty = squawks.length === 0 && !searchQ && resourceId == null;
  const noMatch = squawks.length === 0 && !empty;

  return (
    <Frame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={CheckCircle2}
            title="No open squawks — the fleet's clean."
            body="Anything a pilot reports shows up here until a technician signs it off."
            action={
              <Button onClick={onLog}>
                <Plus className="size-4" /> Log a squawk
              </Button>
            }
          />
        </Card>
      ) : noMatch ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState icon={ClipboardList} title="No matches" body="Nothing matches that search." />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {squawks.map((s) => (
              <SquawkCard
                key={s.id}
                squawk={s}
                onResolve={setResolving}
                resolving={resolving?.id === s.id}
              />
            ))}
          </div>
        </TableView.Body>
      )}

      <ResolveSquawkModal
        squawk={resolving}
        open={resolving != null}
        onOpenChange={(o) => !o && setResolving(null)}
      />
    </Frame>
  );
}

function ResolvedSquawks({ q: searchQ, resourceId }: { q?: string; resourceId?: number }) {
  const q = useSquawks({ resolved: true, q: searchQ, resourceId });
  const squawks = q.data ?? [];
  const empty = squawks.length === 0 && !searchQ && resourceId == null;
  const noMatch = squawks.length === 0 && !empty;

  return (
    <Frame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={ClipboardList}
            title="Nothing resolved yet"
            body="Squawks you sign off will be archived here for the record."
          />
        </Card>
      ) : noMatch ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState icon={ClipboardList} title="No matches" body="Nothing matches that search." />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {squawks.map((s) => (
              <SquawkCard key={s.id} squawk={s} />
            ))}
          </div>
        </TableView.Body>
      )}
    </Frame>
  );
}

function Reminders({ q: searchQ, resourceId }: { q?: string; resourceId?: number }) {
  const q = useMaintenanceReminders({ q: searchQ, resourceId });
  const reminders = q.data ?? [];
  const empty = reminders.length === 0 && !searchQ && resourceId == null;
  const noMatch = reminders.length === 0 && !empty;

  return (
    <Frame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Wrench}
            title="No maintenance reminders"
            body="Recurring inspections and due-by items will appear here as they're scheduled."
          />
        </Card>
      ) : noMatch ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState icon={Wrench} title="No matches" body="Nothing matches that search." />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {reminders.map((r) => (
              <ReminderCard key={r.id} reminder={r} />
            ))}
          </div>
        </TableView.Body>
      )}
    </Frame>
  );
}
