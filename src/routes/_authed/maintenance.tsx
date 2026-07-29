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
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { useListQueryState, asFacetInts, validateListSearch } from "@/lib/list-query-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { ReminderCard } from "@/components/maintenance/reminder-card";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FACET_KEYS = ["view", "resourceId"] as const;

export const Route = createFileRoute("/_authed/maintenance")({
  beforeLoad: guardRoute("/maintenance"),
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: MaintenancePage,
});

type ViewKey = "open" | "resolved" | "reminders";

function MaintenancePage() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "maintenance",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
    defaults: { view: "open" },
  });
  const [addOpen, setAddOpen] = React.useState(false);
  const planesQ = usePlanes();

  const view: ViewKey =
    facets.view === "resolved" || facets.view === "reminders" ? facets.view : "open";
  const resourceIds = asFacetInts(facets.resourceId);
  const q = debouncedQ;

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
        multiple: true,
        options: (planesQ.data ?? []).map((r) => ({
          value: String(r.id),
          label: resourceLabel(r).name,
        })),
      },
    ],
    [planesQ.data]
  );

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
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search squawks or reminders…"
          aria-label="Search maintenance"
          facets={facetDefs}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </TableView.Header>

      {view === "open" && (
        <OpenSquawks onLog={() => setAddOpen(true)} q={q} resourceId={resourceIds} />
      )}
      {view === "resolved" && <ResolvedSquawks q={q} resourceId={resourceIds} />}
      {view === "reminders" && <Reminders q={q} resourceId={resourceIds} />}

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

function hasResourceFilter(resourceId?: number | number[]) {
  return Array.isArray(resourceId) ? resourceId.length > 0 : resourceId != null;
}

function OpenSquawks({
  onLog,
  q: searchQ,
  resourceId,
}: {
  onLog: () => void;
  q?: string;
  resourceId?: number | number[];
}) {
  const q = useSquawks({ resolved: false, q: searchQ, resourceId });
  const [resolving, setResolving] = React.useState<Squawk | null>(null);
  const squawks = q.data ?? [];
  const empty = squawks.length === 0 && !searchQ && !hasResourceFilter(resourceId);
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

function ResolvedSquawks({
  q: searchQ,
  resourceId,
}: {
  q?: string;
  resourceId?: number | number[];
}) {
  const q = useSquawks({ resolved: true, q: searchQ, resourceId });
  const squawks = q.data ?? [];
  const empty = squawks.length === 0 && !searchQ && !hasResourceFilter(resourceId);
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

function Reminders({
  q: searchQ,
  resourceId,
}: {
  q?: string;
  resourceId?: number | number[];
}) {
  const q = useMaintenanceReminders({ q: searchQ, resourceId });
  const reminders = q.data ?? [];
  const empty = reminders.length === 0 && !searchQ && !hasResourceFilter(resourceId);
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
