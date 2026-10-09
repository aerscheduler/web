import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import type { WorkOrder, WorkOrderStatus } from "@/types/api";
import { pageRows, useWorkOrder, useWorkOrderSettings, useWorkOrders, useWorkOrdersPage } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { usePaging } from "@/lib/paging";
import { formatDate, formatMoney } from "@/lib/utils";
import { ListTable, ListTag, type ListTableColumn, type ListTableGroup, type ListTableSort } from "@/components/list-table";

/** An open job whose aircraft is grounded, or whose owner said so with the request. */
const groundedJob = (w: { status: string; aircraft: { grounded?: boolean | null }; ownerRequest?: { grounded: boolean | null } | null }) =>
  w.status !== "completed" && w.status !== "cancelled" && (w.aircraft.grounded === true || w.ownerRequest?.grounded === true);
import { WorkspaceUserAvatar, WorkspaceUserAvatars } from "@/components/workspace-user-avatar";
import { WorkStatusIcon, type WorkStatus } from "@/components/maintenance/work-status-icon";
import { dateKeyInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { workOrderAircraftName, workOrderStatusVariant } from "@/lib/work-orders";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WorkOrderDetailSheet } from "@/components/maintenance/work-order-detail-sheet";

/**
 * The job board: the shop's open work orders, oldest first, or the closed ones newest first.
 * Same shape as the squawk queue (a table, the row opens the docked panel, the panel links to
 * the job's own page), because a shop scans jobs down columns: which tail, who pays, where it
 * stands, when it is promised.
 */
/** The board's people and place filters, each any of several ids. */
export type JobFilters = {
  locationId?: number[];
  ownerOrgUserId?: number[];
  billToOrgUserId?: number[];
  technicianOrgUserId?: number[];
};

const filtersOn = (f: JobFilters | undefined) => !!f && Object.values(f).some((v) => v?.length);
/** Only the filters that name somebody, so an unfiltered board keeps one cache key. */
const filterQuery = (f: JobFilters | undefined) =>
  Object.fromEntries(Object.entries(f ?? {}).filter(([, v]) => v?.length)) as JobFilters;

export function WorkOrderTable(props: {
  closed: boolean;
  q?: string;
  resourceId?: number | number[];
  filters?: JobFilters;
  openId: number | null;
  onOpenId: (id: number | null) => void;
  onNew?: () => void;
}) {
  // The open board is a bounded set read as a whole, grouped by where each aircraft is; the
  // finished jobs only grow, so they stay on the paged table.
  return props.closed ? <FinishedJobsTable {...props} /> : <OpenJobsList {...props} />;
}

function FinishedJobsTable({
  closed,
  q: searchQ,
  resourceId,
  filters,
  openId,
  onOpenId,
  onNew,
}: {
  closed: boolean;
  q?: string;
  resourceId?: number | number[];
  filters?: JobFilters;
  /** The job showing in the panel, held in the URL like the squawk queue's. */
  openId: number | null;
  onOpenId: (id: number | null) => void;
  onNew?: () => void;
}) {
  const aircraft = Array.isArray(resourceId) ? (resourceId.length ? resourceId : undefined) : resourceId;
  const filter = { state: closed ? ("closed" as const) : ("open" as const), q: searchQ, resourceId: aircraft, ...filterQuery(filters) };
  const navigate = useNavigate();
  const paging = usePaging({ resetKey: filter });
  const listQ = useWorkOrdersPage(filter, paging);
  const { rows, total } = pageRows(listQ);

  const onPage = rows.find((w) => w.id === openId) ?? null;
  const recordQ = useWorkOrder(openId != null && !onPage ? openId : null);
  const viewing = onPage ?? (openId != null ? (recordQ.data ?? null) : null);

  const columns = React.useMemo(() => workOrderColumns(closed), [closed]);
  const step = (delta: -1 | 1) => {
    if (openId == null || rows.length === 0) return;
    const i = rows.findIndex((w) => w.id === openId);
    if (i === -1) return;
    const next = rows[Math.min(rows.length - 1, Math.max(0, i + delta))];
    if (next) onOpenId(next.id);
  };
  const filtering = !!searchQ || aircraft != null || filtersOn(filters);

  const body = () => {
    if (listQ.isLoading) {
      return (
        <Card className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </Card>
      );
    }
    if (listQ.isError) {
      return (
        <Card className="flex flex-col min-h-0 flex-1">
          <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />
        </Card>
      );
    }
    if (total === 0 && !filtering) {
      return (
        <Card className="flex flex-col min-h-0 flex-1">
          <EmptyState
            graphic="maintenance"
            title={closed ? "No finished jobs yet" : "No open work orders"}
            body={
              closed
                ? "Completed and cancelled jobs are kept here, newest first."
                : "Open one when an owner calls or taxis up. It follows the job from the request to the invoice."
            }
            docs="run-a-work-order"
            action={
              onNew && !closed ? (
                <Button onClick={onNew}>
                  <Plus className="size-4" /> Open a work order
                </Button>
              ) : undefined
            }
          />
        </Card>
      );
    }
    return (
      <DataTable
        fill
        columns={columns}
        data={rows}
        paging={paging}
        total={total}
        loading={listQ.isFetching}
        emptyMessage={filtering ? "No finished jobs match these filters." : "Nothing matches that search."}
        docShot={closed ? "maintenance-work-orders-closed" : "maintenance-work-orders"}
        mobileCard={(w) => <WorkOrderCard workOrder={w} onOpen={() => onOpenId(w.id)} />}
        onRowClick={(w) => onOpenId(w.id)}
        onRowDoubleClick={(w) => void navigate({ to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: String(w.id) } })}
        isRowSelected={(w) => w.id === openId}
      />
    );
  };

  return (
    <>
      {body()}
      <WorkOrderDetailSheet workOrder={viewing} open={openId != null} onOpenChange={(o) => !o && onOpenId(null)} onStep={step} />
    </>
  );
}

function WorkOrderCard({ workOrder: w, onOpen }: { workOrder: WorkOrder; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border border-border p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium">
          {w.label} · {workOrderAircraftName(w)}
        </span>
        <Badge variant={workOrderStatusVariant(w.status)}>{w.statusLabel}</Badge>
      </div>
      {w.complaint && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{w.complaint}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{w.billTo?.name ?? "Not billed"}</p>
    </button>
  );
}

const DAY = "MMM d, yyyy";

function workOrderColumns(closed: boolean): ColumnDef<WorkOrder, unknown>[] {
  return [
    {
      id: "number",
      meta: { sortKey: "number" },
      header: "Job",
      accessorFn: (w) => w.number,
      // The tail and the request ride with the number, like a squawk's description under its
      // title: a six-column board did not fit beside the rail at laptop width, and the last
      // column (when it is promised) is the one a desk most needs to see.
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[20rem]">
          <div className="whitespace-nowrap font-mono text-sm font-medium">
            {row.original.label} · {workOrderAircraftName(row.original)}
            {row.original.aircraft.use === "fleet" && <span className="ml-1.5 font-sans text-[11px] font-normal text-muted-foreground">Fleet</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">{row.original.complaint || "No request written"}</div>
        </div>
      ),
    },
    {
      id: "billTo",
      meta: { sortKey: "billTo.name", width: "10rem" },
      header: "Billed to",
      accessorFn: (w) => w.billTo?.name ?? "",
      cell: ({ getValue }) => <span className="truncate text-sm">{(getValue() as string) || "Nobody"}</span>,
    },
    {
      id: "status",
      // By where the stage sits in a job's life, not by its code or its label.
      meta: { sortKey: "stageRank", width: "10rem" },
      header: "Stage",
      accessorFn: (w) => w.status,
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={workOrderStatusVariant(row.original.status)}>{row.original.statusLabel}</Badge>
          {row.original.billing !== "none" && (
            <Badge variant={row.original.billing === "paid" ? "success" : "outline"}>
              {row.original.billing === "paid" ? "Paid" : "Invoiced"}
            </Badge>
          )}
          {/* Finished with charges and never billed: the money a shop forgets (Murray's WO-1003). */}
          {row.original.notInvoiced && <Badge variant="warning">Not invoiced</Badge>}
          {row.original.noInvoiceAt && row.original.billing === "none" && <Badge variant="outline">Not billed</Badge>}
        </span>
      ),
    },
    closed
      ? {
          id: "completedAt",
          // The day it left the board, completed or cancelled: shown and sorted by the same field.
          meta: { sortKey: "closedAt", width: "7.5rem" },
          header: "Finished",
          accessorFn: (w) => w.closedAt ?? "",
          cell: ({ getValue }) => (
            <span className="tnum whitespace-nowrap text-sm text-muted-foreground">{formatDate(getValue() as string, DAY, "")}</span>
          ),
        }
      : {
          id: "promisedOn",
          meta: { sortKey: "promisedOn", width: "7.5rem" },
          header: "Promised",
          accessorFn: (w) => w.promisedOn ?? "",
          cell: ({ getValue }) => (
            <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
              {getValue() ? formatDate(`${getValue() as string}T12:00:00`, DAY, "") : ""}
            </span>
          ),
        },
  ];
}

/**
 * Where each open job's aircraft is, in the order a desk works the board. Shared with the
 * aircraft page's Work orders tab, so a job reads the same in both places.
 */
export const STAGE_GROUPS: { id: string; label: string; statuses: WorkOrderStatus[]; icon: WorkStatus; dot: string }[] = [
  { id: "here", label: "In the hangar", statuses: ["received", "in_progress"], icon: "progress", dot: "var(--warning)" },
  { id: "waiting", label: "Waiting", statuses: ["waiting_owner", "waiting_parts"], icon: "waiting", dot: "var(--destructive)" },
  { id: "ready", label: "Ready for pickup", statuses: ["ready"], icon: "done", dot: "var(--success)" },
  { id: "scheduled", label: "Scheduled", statuses: ["scheduled"], icon: "approved", dot: "var(--primary)" },
  { id: "requested", label: "Requested", statuses: ["requested"], icon: "todo", dot: "var(--muted-foreground)" },
];

const OPEN_COLUMNS: ListTableColumn[] = [
  { id: "billTo", header: "Billed to", width: "9rem", sortable: true },
  { id: "techs", header: "Techs", width: "4.25rem", sortable: true },
  { id: "promised", header: "Promised", width: "5.5rem", align: "end", sortable: true },
  { id: "charges", header: "So far", width: "6.5rem", align: "end", narrow: "keep", sortable: true },
];

/** What each header sorts the open jobs by, within their group. Empty values go last either way. */
const OPEN_SORT: Record<string, (w: WorkOrder) => string | number | null> = {
  title: (w) => w.number,
  billTo: (w) => w.billTo?.name?.toLowerCase() ?? null,
  techs: (w) => w.technicians.map((t) => t.name ?? "").sort()[0]?.toLowerCase() || null,
  promised: (w) => w.promisedOn ?? null,
  charges: (w) => w.chargesCents ?? 0,
};

function sortJobs(jobs: WorkOrder[], sort: ListTableSort | null): WorkOrder[] {
  const key = sort ? OPEN_SORT[sort.id] : null;
  if (!sort || !key) return jobs;
  return [...jobs].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x == null || y == null) return x == null && y == null ? a.number - b.number : x == null ? 1 : -1;
    const c = x < y ? -1 : x > y ? 1 : a.number - b.number;
    return sort.desc ? -c : c;
  });
}

/**
 * The open jobs, grouped by where the aircraft is (Tony picked the layout, 2026-09-30): what is in
 * the hangar, what waits on the owner or a part, what is ready to go home, what is booked, what is
 * only asked for. Oldest first within each group, as the board always read. A row opens the job
 * in the docked panel, like the table it replaced.
 */
function OpenJobsList({
  q: searchQ,
  resourceId,
  filters,
  openId,
  onOpenId,
  onNew,
}: {
  q?: string;
  resourceId?: number | number[];
  filters?: JobFilters;
  openId: number | null;
  onOpenId: (id: number | null) => void;
  onNew?: () => void;
}) {
  const aircraft = Array.isArray(resourceId) ? (resourceId.length ? resourceId : undefined) : resourceId;
  const navigate = useNavigate();
  const listQ = useWorkOrders({ state: "open", q: searchQ, resourceId: aircraft, ...filterQuery(filters) });
  const rows = React.useMemo(() => listQ.data ?? [], [listQ.data]);
  const filtering = !!searchQ || aircraft != null || filtersOn(filters);
  const [sort, setSort] = React.useState<ListTableSort | null>(null);
  // A shop with no labor rate is not set up yet, and only an admin can fix that. A technician
  // who is not an admin gets the empty state saying so, instead of an empty filtered board
  // (they land on Assigned: To me). Admins get the Set up your shop line above the board.
  const { roles } = useAuth();
  const ratesQ = useWorkOrderSettings();
  const notSetUp = !isAdmin(roles) && ratesQ.isSuccess && ratesQ.data?.laborRateCents == null;

  // The board's own order, group by group, so the panel's up and down walk it as it reads.
  const ordered = React.useMemo(
    () => STAGE_GROUPS.flatMap((g) => sortJobs(rows.filter((w) => g.statuses.includes(w.status)), sort)),
    [rows, sort]
  );
  const onList = ordered.find((w) => w.id === openId) ?? null;
  const recordQ = useWorkOrder(openId != null && !onList ? openId : null);
  const viewing = onList ?? (openId != null ? (recordQ.data ?? null) : null);
  const step = (delta: -1 | 1) => {
    const i = ordered.findIndex((w) => w.id === openId);
    if (i === -1) return;
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + delta))];
    if (next) onOpenId(next.id);
  };
  // Late against the school's own day: the promised date is a day at the airport, not in UTC.
  const tz = useTimeZone();
  const today = dateKeyInZone(new Date(), tz.zone);

  if (listQ.isLoading) {
    return (
      <Card className="flex flex-col min-h-0 flex-1 overflow-hidden">
        <TableSkeleton rows={8} cols={5} />
      </Card>
    );
  }
  if (listQ.isError) {
    return (
      <Card className="flex flex-col min-h-0 flex-1">
        <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />
      </Card>
    );
  }
  if (rows.length === 0 && notSetUp) {
    return (
      <Card className="flex flex-col min-h-0 flex-1">
        <EmptyState
          graphic="maintenance"
          title="The shop isn't set up yet"
          body="An admin needs to set the shop's labor rate in Settings, Shop rates, before hours can be logged on a job. Jobs show up here once they're opened."
          docs="run-a-work-order"
        />
      </Card>
    );
  }
  if (rows.length === 0 && !filtering) {
    return (
      <Card className="flex flex-col min-h-0 flex-1">
        <EmptyState
          graphic="maintenance"
          title="No open work orders"
          body="Open one when an owner calls or taxis up. It follows the job from the request to the invoice."
          docs="run-a-work-order"
          action={
            onNew ? (
              <Button onClick={onNew}>
                <Plus className="size-4" /> Open a work order
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  const groups: ListTableGroup[] = STAGE_GROUPS.map((g) => {
    const jobs = sortJobs(rows.filter((w) => g.statuses.includes(w.status)), sort);
    return {
      id: g.id,
      label: g.label,
      marker: <span className="size-2 rounded-full" style={{ background: g.dot }} aria-hidden />,
      count: jobs.length,
      summary: formatMoney(jobs.reduce((sum, w) => sum + (w.chargesCents ?? 0), 0)),
      rows: jobs.map((w) => {
        const late = !!w.promisedOn && w.promisedOn < today;
        return {
          id: `job-${w.id}`,
          label: `${w.label} ${workOrderAircraftName(w)}`,
          testId: `job-row-${w.id}`,
          leading: <WorkStatusIcon status={g.icon} />,
          title: (
            <>
              {/* Real spaces between the parts: margins alone left no place to wrap, and a phone
                  broke the request mid-word. */}
              <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">{w.label}</span>{" "}
              <span className="font-mono font-medium whitespace-nowrap">{workOrderAircraftName(w)}</span>{" "}
              <span>{w.complaint || "No request written"}</span>
            </>
          ),
          tags:
            g.id === "waiting" || w.billing !== "none" || w.aircraft.use === "fleet" || groundedJob(w) || w.notInvoiced ? (
              <>
                {/* Grounded changes the job (a ferry, a pickup): the owner said so, or the aircraft is. */}
                {groundedJob(w) && <ListTag>Grounded</ListTag>}
                {g.id === "waiting" && <ListTag dot={g.dot}>{w.statusLabel}</ListTag>}
                {w.billing !== "none" && <ListTag>{w.billing === "paid" ? "Paid" : "Invoiced"}</ListTag>}
                {w.notInvoiced && <ListTag dot="var(--warning)">Not invoiced</ListTag>}
                {w.aircraft.use === "fleet" && <ListTag>Fleet</ListTag>}
              </>
            ) : undefined,
          selected: w.id === openId,
          onOpen: () => onOpenId(w.id),
          onOpenPage: () => void navigate({ to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: String(w.id) } }),
          cells: {
            billTo: w.billTo ? (
              <WorkspaceUserAvatar person={w.billTo} showName />
            ) : (
              <span className="text-muted-foreground">Nobody</span>
            ),
            techs: w.technicians.length ? <WorkspaceUserAvatars people={w.technicians} /> : null,
            promised: w.promisedOn ? (
              <span className={late ? "font-medium text-warning" : "text-muted-foreground"}>{formatDate(`${w.promisedOn}T12:00:00`, "MMM d", "")}</span>
            ) : null,
            charges: w.chargesCents ? <span className="font-medium">{formatMoney(w.chargesCents)}</span> : <span className="text-muted-foreground">$0.00</span>,
          },
        };
      }),
    };
  });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col pb-4">
        <ListTable
          fill
          label="Open jobs"
          docShot="maintenance-work-orders"
          columns={OPEN_COLUMNS}
          groups={groups}
          titleHeader="Job"
          titleSortable
          showHeader
          sort={sort}
          onSortChange={setSort}
          empty={<p className="px-4 py-6 text-[13px] text-muted-foreground">{filtering ? "No open jobs match these filters." : "Nothing matches that search."}</p>}
        />
      </div>
      <WorkOrderDetailSheet workOrder={viewing} open={openId != null} onOpenChange={(o) => !o && onOpenId(null)} onStep={step} />
    </>
  );
}
