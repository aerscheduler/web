import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlaneTakeoff, Plus, Wrench } from "lucide-react";
import {
  pageRows,
  useMaintenanceRemindersPage,
  usePlanes,
  type MaintenanceDueStatus,
} from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { resourceLabel, type MaintenanceReminder } from "@/types/api";
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
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { FleetStatus } from "@/components/maintenance/fleet-status";
import { SquawkTable } from "@/components/maintenance/squawk-table";
import { ComplianceLog } from "@/components/maintenance/compliance-log";
import { InspectionRow } from "@/components/maintenance/inspection-row";
import { InspectionTemplates } from "@/components/maintenance/inspection-templates";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FACET_KEYS = ["view", "resourceId", "status", "fleetStatus", "grounded", "open"] as const;
const TRANSIENT_FACET_KEYS = ["open"];

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
    // Which squawk was open is not part of "where I left off": restoring it a week later
    // reopens a record somebody finished with, on a queue that has moved on since.
    transientKeys: TRANSIENT_FACET_KEYS,
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
  // Which record the inbox has open. In the URL rather than in state: a notification links
  // straight to one, and closing it has to be an ordinary Back.
  // A number, not a string: it goes into the URL bare (`open=2251`) rather than JSON
  // quoted, which is what anyone pasting a link to a squawk into Slack gets.
  const openId = Number.isFinite(Number(facets.open)) && facets.open !== undefined
    ? Number(facets.open)
    : null;
  const setOpenId = (id: number | null) => setFacets({ ...facets, open: id ?? undefined });

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

    // The by-aircraft board filters on the TAIL's state, which is a different question
    // from a single inspection's band below: a tail is overdue when any one of its
    // inspections is. Its own key so that switching boards cannot carry `notTracked` into
    // the inspection list, where the server has never heard of it.
    if (view === "aircraft") {
      defs.push({
        kind: "select",
        key: "fleetStatus",
        label: "Status",
        allLabel: "Any status",
        multiple: true,
        options: [
          { value: "overdue", label: "Overdue" },
          { value: "dueSoon", label: "Due soon" },
          { value: "current", label: "Current" },
          { value: "untracked", label: "Not tracked" },
        ],
      });
      // Separate control rather than a fifth status, because it is a separate axis: an
      // aircraft is off the line for reasons that have nothing to do with an inspection,
      // and folding it in would make "Grounded and Current" mean nothing coherent.
      defs.push({
        kind: "boolean",
        key: "grounded",
        label: "Line status",
        trueLabel: "Grounded",
        falseLabel: "On the line",
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

  const searchBar = (
    <ListSearchBar
      value={search}
      onChange={setSearch}
      placeholder={
        showsSquawks
          ? "Search squawks…"
          : view === "compliance"
            ? "Search records, AD numbers, mechanics…"
            : "Search aircraft or inspections…"
      }
      aria-label="Search maintenance"
      facets={facetDefs}
      filterValues={facets}
      onFilterChange={setFacets}
    />
  );

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Maintenance"
          subtitle="What each aircraft owes, and what's been squawked."
          actions={
            <>
              {/* Each board gets the verb that belongs to it. "Add inspections" on the
                  squawk queue was an action for a different screen sitting directly above
                  that screen's own buttons, which is most of why the two rows read as a
                  pile rather than a hierarchy. */}
              {canManage && !showsSquawks && (
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
          {searchBar}

          {view === "aircraft" && (
            <TableView.Body>
              <FleetStatus
                q={q}
                resourceId={resourceIds}
                fleetStatus={asFacetStrings(facets.fleetStatus)}
                grounded={typeof facets.grounded === "boolean" ? facets.grounded : undefined}
                canManage={canManage}
              />
            </TableView.Body>
          )}
          {view === "compliance" && (
            <ComplianceLog q={q} resourceId={resourceIds} openId={openId} onOpenId={setOpenId} />
          )}
          {view === "templates" && (
            <TableView.Body>
              <InspectionTemplates q={q} canManage={canManage} onAdd={() => setAddOpen(true)} />
            </TableView.Body>
          )}
          {showsSquawks && (
            <SquawkTable
              // Remounts between the two boards, which is what we want: Open and Resolved
              // are different queues, and carrying a page or a stale open record across
              // them would be a bug rather than a convenience.
              key={view}
              resolved={view === "resolved"}
              q={q}
              resourceId={resourceIds}
              openId={openId}
              onOpenId={setOpenId}
              onLog={view === "open" ? () => setSquawkOpen(true) : undefined}
            />
          )}
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
