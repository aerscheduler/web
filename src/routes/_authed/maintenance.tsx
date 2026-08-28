import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, PlaneTakeoff, Plus, Wrench } from "lucide-react";
import {
  pageRows,
  useSquawksPage,
  useMaintenanceRemindersPage,
  usePlanes,
  type MaintenanceDueStatus,
} from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { resourceLabel, type MaintenanceReminder, type Squawk } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canResolveSquawk, guardRoute } from "@/lib/permissions";
import { MAINTENANCE_RAIL, MAINTENANCE_VIEWS } from "@/lib/maintenance-sections";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import {
  useListQueryState,
  asFacetInts,
  asFacetStrings,
  validateListSearch,
} from "@/lib/list-query-state";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { DocsLink } from "@/components/docs-hint";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { SquawkDetailSheet } from "@/components/maintenance/squawk-detail-sheet";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { FleetStatus } from "@/components/maintenance/fleet-status";
import { InspectionRow } from "@/components/maintenance/inspection-row";
import { InspectionTemplates } from "@/components/maintenance/inspection-templates";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { VerifySquawkModal } from "@/components/maintenance/verify-squawk-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FACET_KEYS = ["view", "resourceId", "status"] as const;

export const Route = createFileRoute("/_authed/maintenance")({
  beforeLoad: guardRoute("/maintenance"),
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: MaintenancePage,
});

/**
 * `aircraft` leads because that is how the work is actually organised: you deal with a
 * tail, not with the school's reminders in the abstract. Squawks sit behind it; they are
 * the exception, and a flat list of open squawks answers nothing about whether the annual
 * on N12345 is close.
 *
 * The rail list lives in `lib/maintenance-sections.ts` so the command palette can offer
 * each view as a destination. `?view=` keeps its old key and values: squawk hits land on
 * `view=open|resolved`, and an aircraft's panel links to `view=reminders` for one tail.
 */
type ViewKey = (typeof MAINTENANCE_VIEWS)[number]["value"];

const isView = (v: unknown): v is ViewKey => MAINTENANCE_VIEWS.some((x) => x.value === v);

function MaintenancePage() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "maintenance",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
    defaults: { view: "aircraft" },
  });
  const { roles } = useAuth();
  const canManage = canResolveSquawk(roles);
  const [squawkOpen, setSquawkOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const planesQ = usePlanes();

  const view: ViewKey = isView(facets.view) ? facets.view : "aircraft";
  const resourceIds = asFacetInts(facets.resourceId);
  const q = debouncedQ;
  const statuses = asFacetStrings(facets.status);

  const showsSquawks = view === "open" || view === "resolved";

  const facetDefs = React.useMemo<FacetDef[]>(() => {
    const defs: FacetDef[] = [];

    // The tail filter is meaningless on the set-up view, which lists rules rather than
    // anything belonging to an aircraft. Offering it there would be a control that
    // silently does nothing.
    if (view !== "templates") {
      defs.push({
        kind: "select",
        key: "resourceId",
        label: "Aircraft",
        allLabel: "All aircraft",
        multiple: true,
        options: (planesQ.data ?? []).map((r) => ({
          value: String(r.id),
          label: resourceLabel(r).name,
        })),
      });
    }

    // Filtering on the computed band, which only the inspection list can honour.
    if (view === "reminders") {
      defs.push({
        kind: "select",
        key: "status",
        label: "Status",
        allLabel: "Any status",
        multiple: true,
        options: [
          { value: "overdue", label: "Overdue" },
          { value: "dueSoon", label: "Due soon" },
          { value: "ok", label: "Not yet due" },
        ],
      });
    }

    return defs;
  }, [planesQ.data, view]);

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Maintenance"
          subtitle="What each aircraft owes, and what's been squawked."
          actions={
            <>
              {canManage && (
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Wrench className="size-4" /> Add inspections
                </Button>
              )}
              <Button onClick={() => setSquawkOpen(true)}>
                <Plus className="size-4" /> Log a squawk
              </Button>
            </>
          }
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail
          label="Maintenance"
          sections={MAINTENANCE_RAIL}
          value={view}
          onChange={(v) => setFacets({ ...facets, view: v })}
        />

        {/* The search and filters belong to the section, not to the page: what
            they search changes with it, and Set up has nothing to filter by tail. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <ListSearchBar
            value={search}
            onChange={setSearch}
            placeholder={showsSquawks ? "Search squawks…" : "Search aircraft or inspections…"}
            aria-label="Search maintenance"
            facets={facetDefs}
            filterValues={facets}
            onFilterChange={setFacets}
          />

          {view === "aircraft" && (
            <TableView.Body>
              <FleetStatus q={q} resourceId={resourceIds} canManage={canManage} />
            </TableView.Body>
          )}
          {view === "templates" && (
            <TableView.Body>
              <InspectionTemplates q={q} canManage={canManage} onAdd={() => setAddOpen(true)} />
            </TableView.Body>
          )}
          {view === "open" && (
            <OpenSquawks onLog={() => setSquawkOpen(true)} q={q} resourceId={resourceIds} />
          )}
          {view === "resolved" && <ResolvedSquawks q={q} resourceId={resourceIds} />}
          {view === "reminders" && (
            <Reminders
              q={q}
              resourceId={resourceIds}
              status={statuses}
              canManage={canManage}
              onAdd={() => setAddOpen(true)}
            />
          )}
        </div>
      </div>

      <LogSquawkModal open={squawkOpen} onOpenChange={setSquawkOpen} />
      {canManage && <AddInspectionsModal open={addOpen} onOpenChange={setAddOpen} />}
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
  const [verifying, setVerifying] = React.useState<Squawk | null>(null);
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
            title="No open squawks, the fleet's clean."
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
            <div
              data-doc-shot="maintenance-squawks-open"
              className={cn("space-y-2.5", q.isFetching && "opacity-60")}
            >
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
        //Verifying is a judgement about a fault you have just read, so it is offered from
        //the write-up rather than as a second button on every row of the board. Same
        //placement the phone uses, and the same viewers as resolve.
        onVerify={
          canResolve
            ? (s) => {
                setViewing(null);
                setVerifying(s);
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

      <VerifySquawkModal
        squawk={verifying}
        open={verifying != null}
        onOpenChange={(o) => !o && setVerifying(null)}
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

/**
 * Every live inspection in the school, worst first.
 *
 * `resolved: false` is baked in rather than offered as a filter: this view is a work
 * queue, and a signed-off item belongs to the aircraft's history, not to the queue. The
 * server sorts by urgency, so the page order is the same order the aircraft cards and the
 * per-tail panel use.
 */
function Reminders({
  q: searchQ,
  resourceId,
  status,
  canManage,
  onAdd,
}: {
  q?: string;
  resourceId?: number | number[];
  status?: string[];
  canManage: boolean;
  onAdd: () => void;
}) {
  const filter = {
    q: searchQ,
    resourceId,
    resolved: false,
    status: status?.length ? (status as MaintenanceDueStatus[]) : undefined,
  };
  const paging = usePaging({ resetKey: filter });
  const q = useMaintenanceRemindersPage(filter, paging);
  const { rows: reminders, total } = pageRows(q);
  const [resolving, setResolving] = React.useState<MaintenanceReminder | null>(null);
  const filtered = !!searchQ || hasResourceFilter(resourceId) || !!status?.length;
  const empty = total === 0 && !filtered;
  const noMatch = total === 0 && !empty;

  return (
    <Frame isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
      {empty ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Wrench}
            title="Nothing being tracked yet"
            body="Add the AVIATES set and every aircraft you pick starts counting down its annual, 100-hour, transponder and the rest."
            action={
              <div className="flex flex-col items-center gap-3">
                {canManage ? (
                  <Button onClick={onAdd}>
                    <Wrench className="size-4" /> Add inspections
                  </Button>
                ) : null}
                <DocsLink topic="track-inspections" />
              </div>
            }
          />
        </Card>
      ) : noMatch ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState icon={Wrench} title="No matches" body="Nothing matches those filters." />
        </Card>
      ) : (
        <>
          <TableView.Body>
            <Card
              data-doc-shot="maintenance-all-inspections"
              className={cn("divide-y divide-border p-0", q.isFetching && "opacity-60")}
            >
              {reminders.map((r) => (
                <div key={r.id} className="px-3.5 py-3">
                  <InspectionRow
                    reminder={r}
                    className="py-0"
                    action={
                      canManage ? (
                        <Button variant="ghost" size="sm" onClick={() => setResolving(r)}>
                          Sign off
                        </Button>
                      ) : undefined
                    }
                  />
                  {/* Which tail, on the list that spans the whole fleet. The per-aircraft
                      panel omits it, there it would repeat on every row. */}
                  {r.resource && (
                    <Link
                      to="/aircraft/$resourceId"
                      params={{ resourceId: String(r.resource.id) }}
                      className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    >
                      <PlaneTakeoff className="size-3" />
                      {resourceLabel(r.resource).name}
                    </Link>
                  )}
                </div>
              ))}
            </Card>
          </TableView.Body>
          <TablePagination paging={paging} total={total} returned={reminders.length} loading={q.isFetching} />
        </>
      )}

      <ResolveReminderModal
        reminder={resolving}
        open={resolving != null}
        onOpenChange={(o) => !o && setResolving(null)}
      />
    </Frame>
  );
}
