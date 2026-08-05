import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Plus, Wrench } from "lucide-react";
import {
  pageRows,
  useSquawksPage,
  useMaintenanceRemindersPage,
  usePlanes,
} from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { resourceLabel, type Squawk } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canResolveSquawk, guardRoute } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { useListQueryState, asFacetInts, validateListSearch } from "@/lib/list-query-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { SquawkDetailSheet } from "@/components/maintenance/squawk-detail-sheet";
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
  const { roles } = useAuth();
  const canResolve = canResolveSquawk(roles);
  const filter = { resolved: false, q: searchQ, resourceId };
  const paging = usePaging({ resetKey: filter, defaultSort: { key: "createdAt", dir: "desc" } });
  const q = useSquawksPage(filter, paging);
  const [resolving, setResolving] = React.useState<Squawk | null>(null);
  const [viewing, setViewing] = React.useState<Squawk | null>(null);
  const { rows: squawks, total } = pageRows(q);
  const empty = total === 0 && !searchQ && !hasResourceFilter(resourceId);
  const noMatch = total === 0 && !empty;

  const step = (delta: -1 | 1) => {
    if (!viewing || squawks.length === 0) return;
    const i = squawks.findIndex((s) => s.id === viewing.id);
    if (i === -1) return;
    const next = squawks[Math.min(squawks.length - 1, Math.max(0, i + delta))];
    if (next) setViewing(next);
  };

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
        <>
          <TableView.Body>
            <div className={cn("space-y-2.5", q.isFetching && "opacity-60")}>
              {squawks.map((s) => (
                <SquawkCard
                  key={s.id}
                  squawk={s}
                  onOpen={setViewing}
                  // Omitted for a dispatcher, who can read this board but whom
                  // the server won't let close a squawk. SquawkCard hides the
                  // button when there's no handler.
                  onResolve={canResolve ? setResolving : undefined}
                  resolving={resolving?.id === s.id}
                  selected={viewing?.id === s.id}
                />
              ))}
            </div>
          </TableView.Body>
          <TablePagination paging={paging} total={total} returned={squawks.length} loading={q.isFetching} />
        </>
      )}

      <SquawkDetailSheet
        squawk={viewing}
        open={viewing != null}
        onOpenChange={(o) => !o && setViewing(null)}
        onResolve={
          canResolve
            ? (s) => {
                setViewing(null);
                setResolving(s);
              }
            : undefined
        }
        onStep={step}
      />

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
  const filter = { resolved: true, q: searchQ, resourceId };
  const paging = usePaging({ resetKey: filter, defaultSort: { key: "resolvedAt", dir: "desc" } });
  const q = useSquawksPage(filter, paging);
  const { rows: squawks, total } = pageRows(q);
  const [viewing, setViewing] = React.useState<Squawk | null>(null);
  const empty = total === 0 && !searchQ && !hasResourceFilter(resourceId);
  const noMatch = total === 0 && !empty;

  const step = (delta: -1 | 1) => {
    if (!viewing || squawks.length === 0) return;
    const i = squawks.findIndex((s) => s.id === viewing.id);
    if (i === -1) return;
    const next = squawks[Math.min(squawks.length - 1, Math.max(0, i + delta))];
    if (next) setViewing(next);
  };

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
        <>
          <TableView.Body>
            <div className={cn("space-y-2.5", q.isFetching && "opacity-60")}>
              {squawks.map((s) => (
                <SquawkCard
                  key={s.id}
                  squawk={s}
                  onOpen={setViewing}
                  selected={viewing?.id === s.id}
                />
              ))}
            </div>
          </TableView.Body>
          <TablePagination paging={paging} total={total} returned={squawks.length} loading={q.isFetching} />
        </>
      )}

      <SquawkDetailSheet
        squawk={viewing}
        open={viewing != null}
        onOpenChange={(o) => !o && setViewing(null)}
        onStep={step}
      />
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
  const filter = { q: searchQ, resourceId };
  const paging = usePaging({ resetKey: filter });
  const q = useMaintenanceRemindersPage(filter, paging);
  const { rows: reminders, total } = pageRows(q);
  const empty = total === 0 && !searchQ && !hasResourceFilter(resourceId);
  const noMatch = total === 0 && !empty;

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
        <>
          <TableView.Body>
            <div className={cn("space-y-2.5", q.isFetching && "opacity-60")}>
              {reminders.map((r) => (
                <ReminderCard key={r.id} reminder={r} />
              ))}
            </div>
          </TableView.Body>
          <TablePagination paging={paging} total={total} returned={reminders.length} loading={q.isFetching} />
        </>
      )}
    </Frame>
  );
}
