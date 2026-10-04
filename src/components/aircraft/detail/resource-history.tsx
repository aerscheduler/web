import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ClipboardCheck, History, Wrench, type LucideIcon } from "lucide-react";
import type { AircraftHistoryEntry, AircraftHistoryKind } from "@/types/api";
import { pageRows, useAircraftHistoryPage } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { formatDate } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { ListTag } from "@/components/list-table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { asFacetStrings } from "@/lib/list-query-state";
import { DocsHint } from "@/components/docs-hint";

/**
 * Everything done to one aircraft, newest first (Murray spec section 3, "Maintenance history"):
 * inspection sign-offs (one-time inspections included, after they leave the active list),
 * resolved squawks and completed jobs, each opening its own record. Paged on the server; the
 * jobs only reach the people who open work orders, which the server decides.
 */

export const HISTORY_KIND_META: Record<AircraftHistoryKind, { label: string; icon: LucideIcon }> = {
  inspection: { label: "Inspection", icon: ClipboardCheck },
  squawk: { label: "Squawk", icon: AlertTriangle },
  work_order: { label: "Work order", icon: Wrench },
};

/** Tenths to "1234.5", or a dash. */
export const tenths = (n: number | null | undefined) => (n == null ? "–" : (n / 10).toFixed(1));

/** What the row says it is: the name, a reference when it adds one, and the note under it. */
export function HistoryWhat({ row }: { row: AircraftHistoryEntry }) {
  const Icon = HISTORY_KIND_META[row.kind].icon;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={HISTORY_KIND_META[row.kind].label} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{row.title}</span>
          {row.reference && <ListTag>{row.reference}</ListTag>}
        </div>
        {row.detail && <p className="line-clamp-2 text-[12px] text-muted-foreground">{row.detail}</p>}
      </div>
    </div>
  );
}

function columns(): ColumnDef<AircraftHistoryEntry, unknown>[] {
  return [
    {
      id: "date",
      meta: { sortKey: "date" },
      header: "Date",
      accessorFn: (r) => r.date,
      cell: ({ row }) => <span className="tnum whitespace-nowrap text-[13px] text-muted-foreground">{formatDate(row.original.date)}</span>,
    },
    {
      id: "what",
      header: "What",
      cell: ({ row }) => <HistoryWhat row={row.original} />,
    },
    {
      id: "by",
      header: "Signed or done by",
      cell: ({ row }) => <span className="text-[13px]">{row.original.by ?? <span className="text-muted-foreground">Not recorded</span>}</span>,
    },
    {
      id: "hobbs",
      header: "Hobbs",
      meta: { numeric: true },
      cell: ({ row }) => <div className="tnum text-right text-[13px]">{tenths(row.original.hobbs)}</div>,
    },
    {
      id: "tach",
      header: "Tach",
      meta: { numeric: true },
      cell: ({ row }) => <div className="tnum text-right text-[13px]">{tenths(row.original.tach)}</div>,
    },
  ];
}

export function ResourceHistory({ resourceId, mayOpenWorkOrders }: { resourceId: number; mayOpenWorkOrders: boolean }) {
  const navigate = useNavigate();
  const [facets, setFacets] = useState<ListFilterValues>({});
  const kinds = asFacetStrings(facets.kind) as AircraftHistoryKind[];
  const filter = { kind: kinds };
  const paging = usePaging({ resetKey: filter, defaultSort: { key: "date", dir: "desc" } });
  const q = useAircraftHistoryPage(resourceId, filter, paging);
  const { rows, total } = pageRows(q);
  const cols = useMemo(columns, []);

  const facetDefs: FacetDef[] = [
    {
      kind: "select",
      key: "kind",
      label: "Kind",
      multiple: true,
      options: [
        { value: "inspection", label: "Inspection sign-offs" },
        { value: "squawk", label: "Resolved squawks" },
        ...(mayOpenWorkOrders ? [{ value: "work_order", label: "Completed work orders" }] : []),
      ],
    },
  ];

  const open = (r: AircraftHistoryEntry) => {
    if (r.link.workOrderId) void navigate({ to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: String(r.link.workOrderId) } });
    else if (r.link.squawkId) void navigate({ to: "/maintenance/squawks/$squawkId", params: { squawkId: String(r.link.squawkId) } });
    else if (r.link.inspectionId) void navigate({ to: "/maintenance/inspections/$inspectionId", params: { inspectionId: String(r.link.inspectionId) } });
  };

  const filtered = kinds.length > 0;
  const body = q.isPending ? (
    <Card className="min-h-0 flex-1 overflow-hidden">
      <TableSkeleton rows={8} cols={5} />
    </Card>
  ) : q.isError ? (
    <Card className="min-h-0 flex-1">
      <ErrorState error={q.error} onRetry={() => q.refetch()} />
    </Card>
  ) : total === 0 && !filtered ? (
    <Card className="min-h-0 flex-1">
      <EmptyState
        icon={History}
        title="No maintenance history yet"
        body={
          mayOpenWorkOrders
            ? "Inspections signed off, squawks resolved and work orders completed on this aircraft appear here, newest first."
            : "Inspections signed off and squawks resolved on this aircraft appear here, newest first."
        }
        docs="aircraft-history"
      />
    </Card>
  ) : (
    <DataTable
      fill
      columns={cols}
      data={rows}
      paging={paging}
      total={total}
      loading={q.isFetching}
      onRowClick={open}
      emptyMessage="Nothing of that kind yet."
      docShot="aircraft-history"
      mobileCard={(r) => (
        <Card className="cursor-pointer p-3" onClick={() => open(r)}>
          <div className="mb-1 text-[12px] text-muted-foreground">{formatDate(r.date)}</div>
          <HistoryWhat row={r} />
          {r.by && <div className="mt-1 text-[12px] text-muted-foreground">{r.by}</div>}
        </Card>
      )}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden" data-testid="aircraft-history">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          Everything done to this aircraft, newest first. Open a row for the full record.
          <DocsHint topic="aircraft-history" />
        </p>
        <ListSearchBar showSearch={false} facets={facetDefs} filterValues={facets} onFilterChange={setFacets} />
      </div>
      {body}
    </div>
  );
}
