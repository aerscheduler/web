import type { ColumnDef } from "@tanstack/react-table";
import { FileCheck2, Paperclip } from "lucide-react";
import type { MaintenanceComplianceRecord } from "@/types/api";
import { resourceLabel } from "@/types/api";
import {
  pageRows,
  useComplianceRecord,
  useComplianceRecordsPage,
  type ComplianceListFilter,
} from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { formatDate } from "@/lib/utils";
import { fromDeciHours, SOURCE_TYPE_LABELS, sourceBadge } from "@/lib/maintenance";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ComplianceRecordSheet } from "@/components/maintenance/compliance-record-sheet";

/**
 * Every inspection this school has signed off, kept for the life of the aircraft.
 *
 * This is the screen an inspector asks for, and the reason the compliance table exists at
 * all: resolving a recurring reminder rolls the row forward, so before this the fourth
 * sign-off left no trace of the first three.
 *
 * A table, not the inbox layout. Records are short, uniform and read in aggregate, scanned
 * down columns for a date and a tail, which is the same shape the squawk queue tried the
 * inbox for and went back to a table over.
 *
 * NOTHING HERE EDITS. There is no row action, no menu and no mutation hook, because the log
 * is append-only. A correction is a new sign-off, not an edit.
 */
export function ComplianceLog({
  q,
  resourceId,
  openId,
  onOpenId,
}: {
  q?: string;
  resourceId?: number[];
  /** The open record, held in the URL so a report row can link straight to one. */
  openId: number | null;
  onOpenId: (id: number | null) => void;
}) {
  const filter: ComplianceListFilter = { q, resourceId };
  const paging = usePaging({ resetKey: filter, defaultSort: { key: "complianceDate", dir: "desc" } });
  const listQ = useComplianceRecordsPage(filter, paging);
  const { rows, total } = pageRows(listQ);

  //The row if it is on this page, otherwise fetched.
  //
  //A report row and a notification both link straight to a record id, and the log opens on
  //page one filtered by nothing. Anything older than fifty sign-offs, or hidden by the
  //search box the reader happens to have typed, is simply not in `rows`, and the panel
  //opened empty with no error and no hint that the record exists. The single-record
  //endpoint was already built for this; it just was not called.
  const onPage = rows.find((r) => r.id === openId) ?? null;
  const fetched = useComplianceRecord(openId != null && !onPage ? openId : null);
  const openRecord = onPage ?? fetched.data ?? null;
  const filtering = !!q || !!resourceId?.length;

  if (listQ.isLoading) {
    return (
      <Card className="min-h-0 flex-1 overflow-hidden">
        <TableSkeleton rows={8} cols={6} />
      </Card>
    );
  }

  if (listQ.isError) {
    return (
      <Card className="min-h-0 flex-1">
        <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />
      </Card>
    );
  }

  if (total === 0 && !filtering) {
    return (
      <Card className="min-h-0 flex-1">
        <EmptyState
          icon={FileCheck2}
          title="Nothing signed off yet"
          body="When you sign an inspection off and record what was done, it is kept here permanently. This is the history an inspector asks for at an annual."
        />
      </Card>
    );
  }

  return (
    <>
      {/* SAID HERE, not in a footnote. The industry phrase "AD tracking" means a catalogue
          that answers "which ADs apply to this serial number", and we do not have one. A
          school that believes this log IS their AD status is the one failure in this feature
          that could actually hurt somebody. */}
      <p className="px-0.5 pb-2 text-xs text-muted-foreground">
        Every inspection signed off here, newest first. This records the ADs you enter; it does
        not tell you which ADs apply to your aircraft.
      </p>
      <DataTable
        fill
        columns={COLUMNS}
        data={rows}
        paging={paging}
        total={total}
        loading={listQ.isFetching}
        emptyMessage="No records match that search."
        docShot="maintenance-compliance-log"
        onRowClick={(r) => onOpenId(r.id)}
        isRowSelected={(r) => r.id === openId}
        mobileCard={(r) => (
          <button
            type="button"
            onClick={() => onOpenId(r.id)}
            className="w-full rounded-lg border border-border bg-card p-3 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{r.templateName}</span>
              {sourceBadge(r) && <Badge variant="outline">{sourceBadge(r)}</Badge>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {r.resource ? resourceLabel(r.resource).name : ""} ·{" "}
              {formatDate(r.complianceDate, "MMM d, yyyy", "")}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{r.mechanicName}</div>
          </button>
        )}
      />

      <ComplianceRecordSheet
        record={openRecord}
        loading={openId != null && !openRecord && fetched.isLoading}
        open={openId != null}
        onOpenChange={(o) => !o && onOpenId(null)}
      />
    </>
  );
}

const COLUMNS: ColumnDef<MaintenanceComplianceRecord, unknown>[] = [
  {
    id: "complianceDate",
    meta: { sortKey: "complianceDate" },
    header: "Complied",
    accessorFn: (r) => r.complianceDate,
    cell: ({ getValue }) => (
      <span className="tnum whitespace-nowrap text-sm">
        {formatDate(getValue() as string, "MMM d, yyyy", "")}
      </span>
    ),
  },
  {
    id: "aircraft",
    header: "Aircraft",
    accessorFn: (r) => (r.resource ? resourceLabel(r.resource).name : ""),
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap font-mono text-sm">{(getValue() as string) || ""}</span>
    ),
  },
  {
    id: "rule",
    header: "Inspection",
    accessorFn: (r) => r.templateName,
    cell: ({ row }) => {
      const r = row.original;
      return (
        //Bounded, so one long rule name cannot stretch this column until the meters are
        //pushed off the side of the table.
        <div className="min-w-0 max-w-[24rem]">
          <div className="flex items-center gap-1.5">
            {sourceBadge(r) && (
              <Badge variant="outline" title={SOURCE_TYPE_LABELS[r.sourceType ?? ""]}>
                {sourceBadge(r)}
              </Badge>
            )}
            <span className="truncate text-sm font-medium">{r.templateName}</span>
            {r.fileUrls.length > 0 && (
              <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />
            )}
          </div>
          {/* The number and revision AS SIGNED, not as the template reads now. */}
          {r.sourceRef && (
            <div className="truncate text-xs text-muted-foreground">
              {r.sourceRef}
              {r.revision ? ` Rev ${r.revision}` : ""}
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "tach",
    meta: { numeric: true },
    header: "Tach",
    accessorFn: (r) => r.tachAtCompliance,
    cell: ({ getValue }) => {
      const v = getValue() as number | null;
      return <span className="tnum text-sm text-muted-foreground">{v == null ? "" : fromDeciHours(v)}</span>;
    },
  },
  {
    id: "hobbs",
    meta: { numeric: true },
    header: "Hobbs",
    accessorFn: (r) => r.hobbsAtCompliance,
    cell: ({ getValue }) => {
      const v = getValue() as number | null;
      return <span className="tnum text-sm text-muted-foreground">{v == null ? "" : fromDeciHours(v)}</span>;
    },
  },
  {
    id: "mechanic",
    header: "Certified by",
    accessorFn: (r) => r.mechanicName,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate text-sm">{row.original.mechanicName}</div>
        {row.original.mechanicCertificateNumber && (
          <div className="truncate font-mono text-xs text-muted-foreground">
            {row.original.mechanicCertificateType
              ? `${row.original.mechanicCertificateType} `
              : ""}
            {row.original.mechanicCertificateNumber}
          </div>
        )}
      </div>
    ),
  },
];
