import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Wrench } from "lucide-react";
import {
  useLocations,
  useMaintenanceReminder,
  useMaintenanceReminders,
  useMembers,
  usePlanes,
} from "@/features/queries";
import { cn } from "@/lib/utils";
import { resourceLabel, type MaintenanceReminder } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, canSeeShop, isAdmin } from "@/lib/permissions";
import { canResolveSquawk, guardRoute } from "@/lib/permissions";
import { MAINTENANCE_VIEWS, WORK_ORDER_VIEWS, maintenanceRailFor } from "@/lib/maintenance-sections";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import {
  useListQueryState,
  asFacetInts,
  asFacetStrings,
  validateListSearch,
} from "@/lib/list-query-state";
import { EmptyState, ErrorState } from "@/components/states";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { FleetStatus } from "@/components/maintenance/fleet-status";
import { SquawkTable } from "@/components/maintenance/squawk-table";
import { WorkOrderTable } from "@/components/maintenance/work-order-table";
import { WorkOrderFormModal } from "@/components/maintenance/work-order-form-modal";
import { ComplianceLog } from "@/components/maintenance/compliance-log";
import { ReminderFilesSheet } from "@/components/maintenance/reminder-files-sheet";
import {
  BandDot,
  DUE_BANDS,
  DueFigure,
  DueRail,
  FilesIconButton,
  InspectionTags,
  SignOffButton,
  dueBand,
  dueSentence,
  inspectionName,
} from "@/components/maintenance/inspection-list";
import { ruleDueLabel, sourceBadge, sourceLabel } from "@/lib/maintenance";
import {
  GroupByMenu,
  ListTag,
  ListTable,
  ListTableSkeleton,
  type ListTableColumn,
  type ListTableGroup,
  type ListTableRow,
  type ListTableSort,
} from "@/components/list-table";
import { InspectionTemplates } from "@/components/maintenance/inspection-templates";
import { InspectionDetailSheet } from "@/components/maintenance/inspection-detail";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Every facet a view offers has to be named here, or the URL drops it and the filter does
// nothing: the job boards' people and place filters shipped missing from this list.
export const FACET_KEYS = [
  "view",
  // How the Inspections view groups: aircraft (the default, left out of the URL), status, inspection.
  "group",
  "resourceId",
  "status",
  "fleetStatus",
  "grounded",
  "open",
  "locationId",
  "ownerOrgUserId",
  "billToOrgUserId",
  "technicianOrgUserId",
  "assigned",
] as const;
const TRANSIENT_FACET_KEYS = ["open"];

/**
 * Set when a technician clears "Assigned: To me", so the board stops putting it back. Per
 * person: a shop's shared computer is several technicians, and one clearing it is not all.
 */
const assignedClearedKey = (orgUserId: number | string | null | undefined) => `maintenance:assigned-cleared:${orgUserId ?? "anon"}`;
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Private windows and blocked storage: the default simply comes back next visit.
  }
}

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
 * `view=open|resolved`. `view=reminders` was the All inspections view; it still works (an
 * aircraft's panel and notifications link to it) and opens Inspections grouped by Status.
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
  const { roles, orgUserId } = useAuth();
  const canManage = canResolveSquawk(roles);
  const [squawkOpen, setSquawkOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [workOrderOpen, setWorkOrderOpen] = React.useState(false);
  // EVERY aeroplane this shop is responsible for, its own and its customers'. This page is
  // the one place the two genuinely belong in the same list: an annual is an annual, and a
  // mechanic working through what is due does not care whose name is on the registration.
  // Only staff and technicians are served the shop at all.
  const planesQ = usePlanes(canSeeShop(roles) ? { scope: "all" } : undefined);

  const workOrders = canOpenWorkOrders(roles);
  // The people and places the job boards filter by, read only when a job board shows.
  const jobBoard = workOrders && (facets.view === "work-orders" || facets.view === "work-orders-closed");
  const membersQ = useMembers(undefined, { enabled: jobBoard });
  // A technician opens the job boards on their own jobs. Clearing the filter sticks, across
  // visits too: remembered in this browser, and a search link (?q=WO-12) is never narrowed.
  const techDefaulted = React.useRef(false);
  React.useEffect(() => {
    if (!jobBoard || techDefaulted.current || isAdmin(roles) || !roles.includes("technician")) return;
    techDefaulted.current = true;
    if (facets.assigned !== undefined || debouncedQ || asFacetInts(facets.technicianOrgUserId)?.length || readFlag(assignedClearedKey(orgUserId))) return;
    setFacets({ ...facets, assigned: "me" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobBoard]);
  /**
   * "Assigned: To me" and Technician are one question asked two ways, and the server reads the
   * ids as ANY of them: together they showed Bob's jobs PLUS the viewer's. Picking one clears
   * the other.
   */
  const changeFilters = (next: typeof facets) => {
    const techNext = asFacetInts(next.technicianOrgUserId)?.length ?? 0;
    if (next.assigned === "me" && techNext) {
      next = facets.assigned === "me" ? { ...next, assigned: undefined } : { ...next, technicianOrgUserId: undefined };
    }
    if (facets.assigned === "me" && next.assigned === undefined) writeFlag(assignedClearedKey(orgUserId), true);
    if (next.assigned === "me") writeFlag(assignedClearedKey(orgUserId), false);
    setFacets(next);
  };
  const locationsQ = useLocations({ enabled: jobBoard });
  // A dispatcher typing ?view=work-orders lands on the aircraft list, not on a board of 403s.
  // The old All inspections link: Inspections, grouped by Status.
  const legacyStatus = facets.view === "reminders";
  const view: ViewKey = legacyStatus
    ? "aircraft"
    : isView(facets.view) && (workOrders || !WORK_ORDER_VIEWS.includes(facets.view))
      ? facets.view
      : "aircraft";
  const inspectionGroup: InspectionGroup = legacyStatus && facets.group == null ? "status" : asInspectionGroup(facets.group);
  // Rewrite the old link once, so the grouping it asked for survives moving round the rail.
  React.useEffect(() => {
    if (legacyStatus) setFacets({ ...facets, view: "aircraft", group: facets.group ?? "status" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the old link arrives
  }, [legacyStatus]);
  // A filter that belongs to one grouping is dropped on the way to another, so nothing filters
  // the list that the filter bar no longer shows.
  const setInspectionGroup = (g: InspectionGroup) =>
    setFacets({
      ...facets,
      view: "aircraft",
      group: g === "aircraft" ? undefined : g,
      fleetStatus: g === "aircraft" ? facets.fleetStatus : undefined,
      grounded: g === "aircraft" ? facets.grounded : undefined,
      status: g === "aircraft" ? undefined : facets.status,
    });
  const resourceIds = asFacetInts(facets.resourceId);
  const q = debouncedQ;
  const statuses = asFacetStrings(facets.status);

  const showsSquawks = view === "open" || view === "resolved";
  const showsWorkOrders = view === "work-orders" || view === "work-orders-closed";
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

    // The tail filter is meaningless on Inspection rules, which lists rules rather than
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
    if (view === "aircraft" && inspectionGroup === "aircraft") {
      defs.push({
        kind: "select",
        key: "fleetStatus",
        label: "Status",
        allLabel: "Any status",
        multiple: true,
        options: [
          { value: "overdue", label: "Overdue" },
          { value: "dueSoon", label: "Due soon" },
          { value: "unstarted", label: "Needs a reading or date" },
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
    if (view === "aircraft" && inspectionGroup !== "aircraft") {
      defs.push({
        kind: "select",
        key: "status",
        label: "Status",
        allLabel: "Any status",
        multiple: true,
        // The list's own bands, filtered in the browser (see `Reminders`).
        options: [
          { value: "overdue", label: "Overdue" },
          { value: "dueSoon", label: "Due soon" },
          { value: "unstarted", label: "Needs a reading or date" },
          { value: "ok", label: "Not yet due" },
        ],
      });
    }

    // The job boards: where the aircraft is based, who owns it, who pays, who is on it
    // (Tony, 2026-09-30). People are offered by name, an owner the shop wrote down marked so.
    if (showsWorkOrders) {
      const people = (membersQ.data ?? [])
        .map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}`, hint: m.external && !m.claimedAt ? "Owner, not a member" : undefined }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if ((locationsQ.data ?? []).length > 1) {
        defs.push({
          kind: "select",
          key: "locationId",
          label: "Location",
          allLabel: "Every location",
          multiple: true,
          options: (locationsQ.data ?? []).map((l) => ({ value: String(l.id), label: l.name })),
        });
      }
      defs.push(
        // A technician's own jobs in one click (Murray spec section 17: "view assigned jobs").
        { kind: "select", key: "assigned", label: "Assigned", allLabel: "Anyone", options: [{ value: "me", label: "To me" }] },
        { kind: "select", key: "ownerOrgUserId", label: "Owner", allLabel: "Any owner", multiple: true, options: people },
        { kind: "select", key: "billToOrgUserId", label: "Billed to", allLabel: "Anybody", multiple: true, options: people },
        {
          kind: "select",
          key: "technicianOrgUserId",
          label: "Technician",
          allLabel: "Any technician",
          multiple: true,
          options: (membersQ.data ?? [])
            .filter((m) => m.technicianRole)
            .map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}` }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        }
      );
    }

    return defs;
  }, [planesQ.data, view, inspectionGroup, showsWorkOrders, membersQ.data, locationsQ.data]);

  const searchBar = (
    <ListSearchBar
      value={search}
      onChange={setSearch}
      placeholder={
        showsSquawks
          ? "Search squawks…"
          : showsWorkOrders
            ? "Search jobs, tails, owners…"
            : view === "compliance"
            ? "Search records, AD numbers, mechanics…"
            : "Search aircraft or inspections…"
      }
      aria-label="Search maintenance"
      facets={facetDefs}
      filterValues={facets}
      onFilterChange={changeFilters}
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
              {canManage && !showsSquawks && !showsWorkOrders && (
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Wrench className="size-4" /> Add inspections
                </Button>
              )}
              {showsWorkOrders ? (
                <Button onClick={() => setWorkOrderOpen(true)}>
                  <Plus className="size-4" /> Open a work order
                </Button>
              ) : (
                <Button onClick={() => setSquawkOpen(true)}>
                  <Plus className="size-4" /> Log a squawk
                </Button>
              )}
            </>
          }
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail
          label="Maintenance"
          sections={maintenanceRailFor(workOrders)}
          value={view}
          //`open` is dropped on the way out. It names a record in the view that set it,
          //and the same number is a different record, or no record, in the next one:
          //switching from a squawk to the compliance log carried the squawk's id across
          //and the log reported a compliance record that had never existed.
          onChange={(v) => setFacets({ ...facets, view: v, open: undefined })}
        />

        {/* The search and filters belong to the section, not to the page: what
            they search changes with it, and Inspection rules has nothing to filter by tail. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {searchBar}

          {view === "aircraft" &&
            (inspectionGroup === "aircraft" ? (
              <TableView.Body className="flex flex-col">
                <FleetStatus
                  q={q}
                  resourceId={resourceIds}
                  fleetStatus={asFacetStrings(facets.fleetStatus)}
                  grounded={typeof facets.grounded === "boolean" ? facets.grounded : undefined}
                  canManage={canManage}
                  toolbar={<GroupByMenu value={inspectionGroup} options={INSPECTION_GROUPS} onChange={setInspectionGroup} />}
                  openId={openId}
                  onOpenId={setOpenId}
                />
              </TableView.Body>
            ) : (
              <Reminders
                q={q}
                resourceId={resourceIds}
                status={statuses}
                canManage={canManage}
                onAdd={() => setAddOpen(true)}
                group={inspectionGroup}
                toolbar={<GroupByMenu value={inspectionGroup} options={INSPECTION_GROUPS} onChange={setInspectionGroup} />}
                openId={openId}
                onOpenId={setOpenId}
              />
            ))}
          {view === "compliance" && (
            <ComplianceLog q={q} resourceId={resourceIds} openId={openId} onOpenId={setOpenId} />
          )}
          {view === "templates" && (
            <TableView.Body className="flex flex-col">
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
          {showsWorkOrders && (
            <WorkOrderTable
              // Open and finished are different queues, like the squawk boards.
              key={view}
              closed={view === "work-orders-closed"}
              q={q}
              resourceId={resourceIds}
              filters={{
                locationId: asFacetInts(facets.locationId),
                ownerOrgUserId: asFacetInts(facets.ownerOrgUserId),
                billToOrgUserId: asFacetInts(facets.billToOrgUserId),
                // One or the other (see changeFilters); a pasted link holding both keeps Technician.
                technicianOrgUserId: asFacetInts(facets.technicianOrgUserId)?.length
                  ? asFacetInts(facets.technicianOrgUserId)
                  : facets.assigned === "me" && orgUserId
                    ? [Number(orgUserId)]
                    : [],
              }}
              openId={openId}
              onOpenId={setOpenId}
              onNew={() => setWorkOrderOpen(true)}
            />
          )}
        </div>
      </div>

      <LogSquawkModal open={squawkOpen} onOpenChange={setSquawkOpen} />
      <WorkOrderFormModal open={workOrderOpen} onOpenChange={setWorkOrderOpen} />
      {canManage && <AddInspectionsModal open={addOpen} onOpenChange={setAddOpen} />}
    </TableView>
  );
}

function hasResourceFilter(resourceId?: number | number[]) {
  return Array.isArray(resourceId) ? resourceId.length > 0 : resourceId != null;
}

/**
 * How the Inspections view groups. One view since 2026-10-01 (it was two, By aircraft and All
 * inspections, which showed the same open inspections two ways):
 *   - aircraft: every tail, worst first, its inspections nested beneath (`FleetStatus`). The
 *     only grouping that can show a tail with nothing tracked, so it stays the default.
 *   - status: a flat queue of every open inspection by how close it is (`Reminders`).
 *   - inspection: one group per rule, every tail's countdown on it beneath ("where does the
 *     fleet stand on its annual?"). Rules themselves are edited on Inspection rules.
 */
export type InspectionGroup = "aircraft" | "status" | "inspection";

const INSPECTION_GROUPS: { value: InspectionGroup; label: string }[] = [
  { value: "aircraft", label: "Aircraft" },
  { value: "status", label: "Status" },
  { value: "inspection", label: "Inspection" },
];

const asInspectionGroup = (v: unknown): InspectionGroup =>
  v === "status" || v === "inspection" ? v : "aircraft";

const INSPECTION_COLUMNS = (group: "status" | "inspection"): ListTableColumn[] => [
  // Grouped by status the row is an inspection and needs its tail; grouped by inspection the
  // heading names the inspection and the row IS the tail.
  ...(group === "status" ? [{ id: "aircraft", header: "Aircraft", width: "6rem", sortable: true }] : []),
  { id: "detail", header: "Detail", width: "10rem" },
  { id: "rail", header: "", width: "3rem", narrow: "hide" as const },
  // "When", not "Left": the figure is "9 days", but also "7.0 hrs over", "Due today", "No reading".
  { id: "due", header: "When", width: "6.5rem", align: "end" as const, sortable: true, narrow: "keep" as const },
  { id: "action", header: "", width: "7.5rem", align: "end" as const },
];

const tailName = (r: MaintenanceReminder) => (r.resource ? resourceLabel(r.resource).name : "No aircraft");

/**
 * The open inspections as a flat list, grouped by status or by inspection.
 *
 * Unpaged since it moved onto ListTable (2026-09-30): it is bounded, the fleet's tails times
 * the handful of inspections each carries, unresolved only, and the Aircraft grouping already
 * loads the same set whole. A group split across pages would also show the wrong count.
 */
function Reminders({
  q: searchQ,
  resourceId,
  status,
  canManage,
  onAdd,
  group,
  toolbar,
  openId,
  onOpenId,
}: {
  q?: string;
  resourceId?: number | number[];
  status?: string[];
  canManage: boolean;
  onAdd: () => void;
  group: "status" | "inspection";
  toolbar: React.ReactNode;
  /** The inspection in the side panel, held in the URL (`open`) like the squawk board's. */
  openId: number | null;
  onOpenId: (id: number | null) => void;
}) {
  // The Status filter is on the BAND, in the browser, not on the server's `due.status`: the
  // server calls everything it cannot count down "ok", so filtering there to "Not yet due"
  // would also return the "Needs a reading or date" group the list draws separately.
  const q = useMaintenanceReminders({ q: searchQ, resourceId, resolved: false });
  const reminders = React.useMemo(
    () => (q.data ?? []).filter((r) => !status?.length || status.includes(dueBand(r.due))),
    [q.data, status]
  );
  const [resolving, setResolving] = React.useState<MaintenanceReminder | null>(null);
  const [filesFor, setFilesFor] = React.useState<MaintenanceReminder | null>(null);
  const [sort, setSort] = React.useState<ListTableSort | null>(null);
  // A sort on a column the new grouping hides would order rows by nothing on screen.
  React.useEffect(() => setSort(null), [group]);
  const navigate = useNavigate();
  const filtered = !!searchQ || hasResourceFilter(resourceId) || !!status?.length;
  const columns = INSPECTION_COLUMNS(group);

  const groups = React.useMemo<ListTableGroup[]>(() => {
    // The title column is the inspection grouped by status, the tail grouped by inspection.
    const sortKeys: Record<string, (r: MaintenanceReminder) => string | number> = {
      title: (r) => (group === "status" ? inspectionName(r) : tailName(r)).toLowerCase(),
      aircraft: (r) => tailName(r).toLowerCase(),
      due: (r) => r.due?.urgency ?? 99,
    };
    const key = sort ? sortKeys[sort.id] : null;
    const order = (list: MaintenanceReminder[]) =>
      [...list].sort((a, b) => {
        const byUrgency = (a.due?.urgency ?? 99) - (b.due?.urgency ?? 99);
        if (!sort || !key) return byUrgency || sortKeys.title!(a).toString().localeCompare(sortKeys.title!(b).toString(), undefined, { numeric: true });
        const x = key(a);
        const y = key(b);
        const c = x < y ? -1 : x > y ? 1 : byUrgency;
        return sort.desc ? -c : c;
      });

    const row = (r: MaintenanceReminder): ListTableRow => {
      const tail = r.resource ? resourceLabel(r.resource).name : null;
      return {
        id: `reminder-${r.id}`,
        testId: `inspection-row-${r.id}`,
        label: `${inspectionName(r)}${tail ? `, ${tail}` : ""}`,
        title: group === "status" ? inspectionName(r) : <span className="font-mono">{tail ?? "No aircraft"}</span>,
        tags: <InspectionTags reminder={r} filesShown={canManage} sourceShown={group === "inspection"} />,
        // A click peeks in the side panel; a double click opens the inspection's own page.
        selected: r.id === openId,
        onOpen: () => onOpenId(r.id),
        onOpenPage: () => void navigate({ to: "/maintenance/inspections/$inspectionId", params: { inspectionId: String(r.id) } }),
        cells: {
          aircraft: tail ? <span className="font-mono">{tail}</span> : <span className="text-muted-foreground">None</span>,
          detail: (
            <span className="text-muted-foreground" title={dueSentence(r.due)}>
              {dueSentence(r.due)}
            </span>
          ),
          rail: <DueRail due={r.due} />,
          due: <DueFigure due={r.due} />,
          // Both visible, not in the hover-only slot: the front desk runs this on an iPad.
          action: canManage ? (
            <span className="inline-flex items-center gap-0.5">
              <FilesIconButton reminder={r} onFiles={setFilesFor} />
              <SignOffButton reminder={r} onSignOff={setResolving} />
            </span>
          ) : null,
        },
      };
    };

    if (group === "inspection") {
      // One group per rule. Keyed on the template, not the name: two rules can share a name
      // ("100-hour inspection" on tach and on Hobbs) and must not merge.
      const byRule = new Map<
        string,
        { label: string; interval: string; worst: number; ad: string | null; adTitle: string | null; items: MaintenanceReminder[] }
      >();
      for (const r of reminders) {
        const id = r.template?.id != null ? `rule-${r.template.id}` : `name-${inspectionName(r)}`;
        const g = byRule.get(id) ?? {
          label: inspectionName(r),
          // Beside the name, so two rules called "100-hour inspection" (one on tach, one on
          // Hobbs) are two headings a reader can tell apart.
          interval: r.template ? ruleDueLabel(r.template) : "",
          worst: 99,
          ad: sourceBadge(r.template ?? {}),
          adTitle: sourceLabel(r.template ?? {}),
          items: [],
        };
        g.items.push(r);
        g.worst = Math.min(g.worst, r.due?.urgency ?? 99);
        byRule.set(id, g);
      }
      // The rule with the most urgent tail first: the same triage order as the other groupings.
      return [...byRule.entries()]
        .sort(([, a], [, b]) => a.worst - b.worst || a.label.localeCompare(b.label))
        .map(([id, g]) => ({
          id,
          label: (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="truncate">{g.label}</span>
              {g.ad ? (
                <span title={g.adTitle ?? undefined}>
                  <ListTag>{g.ad}</ListTag>
                </span>
              ) : null}
              {g.interval ? <span className="truncate font-normal text-muted-foreground">{g.interval}</span> : null}
            </span>
          ),
          count: `${g.items.length} aircraft`,
          rows: order(g.items).map(row),
        }));
    }

    return DUE_BANDS.map((b) => {
      const items = reminders.filter((r) => dueBand(r.due) === b.id);
      return { id: b.id, label: b.label, marker: <BandDot color={b.dot} />, count: items.length, rows: order(items).map(row) };
    });
  }, [reminders, group, sort, canManage, navigate, openId, onOpenId]);

  // The panel's up and down walk the rows in the order they are drawn, group by group.
  const ordered = React.useMemo(
    () => groups.flatMap((g) => g.rows.map((row) => Number(row.id.replace("reminder-", "")))),
    [groups]
  );
  const onList = reminders.find((r) => r.id === openId) ?? null;
  const recordQ = useMaintenanceReminder(openId != null && !onList ? openId : null);
  const viewing = onList ?? (openId != null ? (recordQ.data ?? null) : null);
  const step = (delta: -1 | 1) => {
    const i = ordered.indexOf(openId ?? -1);
    if (i === -1) return;
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + delta))];
    if (next != null) onOpenId(next);
  };

  // Shown above the loading, error and empty states too: without it a remembered grouping on a
  // fleet with nothing open would leave no way back to grouping by aircraft.
  const bareToolbar = <div className="flex shrink-0 items-center">{toolbar}</div>;
  return (
    <>
      {q.isLoading || q.error || reminders.length === 0 ? bareToolbar : null}
      {q.isLoading ? (
        <ListTableSkeleton fill columns={columns} narrowAt={INSPECTIONS_NARROW_AT} className="mb-4 min-h-0 flex-1" toolbar={false} />
      ) : q.error ? (
        <Card className="flex flex-col min-h-0 flex-1 p-0">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : reminders.length === 0 && !filtered ? (
        <Card className="flex flex-col min-h-0 flex-1 p-0">
          <EmptyState
            graphic="maintenance"
            title="Nothing being tracked yet"
            body="Add the AVIATES set and every aircraft you pick starts counting down its annual, 100-hour, transponder and the rest."
            docs="track-inspections"
            action={
              canManage ? (
                <Button onClick={onAdd}>
                  <Wrench className="size-4" /> Add inspections
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : reminders.length === 0 ? (
        <Card className="flex flex-col min-h-0 flex-1 p-0">
          <EmptyState icon={Wrench} title="No matches" body="Nothing matches those filters." />
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col pb-4">
          <ListTable
            fill
            label="Inspections"
            docShot="maintenance-all-inspections"
            className={cn("min-h-0", q.isFetching && "opacity-80")}
            columns={columns}
            groups={groups}
            titleHeader={group === "status" ? "Inspection" : "Aircraft"}
            titleSortable
            showHeader
            sort={sort}
            onSortChange={setSort}
            narrowAt={INSPECTIONS_NARROW_AT}
            toolbar={toolbar}
          />
        </div>
      )}

      <InspectionDetailSheet
        reminder={viewing}
        open={openId != null}
        onOpenChange={(o) => !o && onOpenId(null)}
        // Signing off closes the inspection and takes it off this list, so the panel closes
        // first rather than going on showing a row that has gone.
        onSignOff={
          canManage
            ? (r) => {
                onOpenId(null);
                setResolving(r);
              }
            : undefined
        }
        onFiles={canManage ? setFilesFor : undefined}
        onStep={step}
      />
      <ResolveReminderModal
        reminder={resolving}
        open={resolving != null}
        onOpenChange={(o) => !o && setResolving(null)}
      />
      <ReminderFilesSheet
        reminder={filesFor}
        open={filesFor != null}
        onOpenChange={(o) => !o && setFilesFor(null)}
      />
    </>
  );
}

const INSPECTIONS_NARROW_AT = 860;
