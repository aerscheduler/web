import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, ClipboardList, Plus } from "lucide-react";
import type { Squawk } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { pageRows, useSquawk, useSquawksPage } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { useAuth } from "@/lib/auth";
import { canResolveSquawk } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { VerifySquawkModal } from "@/components/maintenance/verify-squawk-modal";
import { SquawkCard } from "@/components/maintenance/squawk-card";
import { SquawkDetailSheet } from "@/components/maintenance/squawk-detail-sheet";
import { SquawkStatusBadge } from "@/components/maintenance/squawk-status-badge";

/**
 * The squawk queue: a table, and the row you click opens the docked panel.
 *
 * Open and Resolved are the same screen with a different `resolved` filter, so they are one
 * component: they differ only in how they sort, what an empty one says, and whether the
 * viewer is offered a Resolve button.
 *
 * A table rather than the cards this used to be, because a squawk queue is scanned down
 * columns, which tail, how old, where it stands, and cards make you read each one as a
 * paragraph to compare it with the next. On a phone `mobileCard` puts the cards back, since
 * a five-column table on 375px is not a table.
 */
export function SquawkTable({
  resolved,
  q: searchQ,
  resourceId,
  openId,
  onOpenId,
  onLog,
}: {
  resolved: boolean;
  q?: string;
  resourceId?: number | number[];
  /**
   * The squawk showing in the panel, held in the URL.
   *
   * The old board kept this in component state, which meant a squawk you were reading
   * could not be linked to, survived neither a refresh nor the Back button, and gave a
   * notification nowhere to point. It costs nothing to keep it in the address bar.
   */
  openId: number | null;
  onOpenId: (id: number | null) => void;
  /** Offered from the empty Open board. Absent on Resolved, where it would make no sense. */
  onLog?: () => void;
}) {
  const { roles } = useAuth();
  const canResolve = canResolveSquawk(roles);
  const filter = { resolved, q: searchQ, resourceId };
  const paging = usePaging({
    resetKey: filter,
    defaultSort: { key: resolved ? "resolvedAt" : "createdAt", dir: "desc" },
  });
  const listQ = useSquawksPage(filter, paging);
  const { rows: squawks, total } = pageRows(listQ);

  const [resolving, setResolving] = React.useState<Squawk | null>(null);
  const [verifying, setVerifying] = React.useState<Squawk | null>(null);

  // The open squawk may not be on this page of the table: a notification links straight to
  // one, and a filter can hide the very row somebody came from. Fetched by id only when the
  // page does not already have it, so an ordinary click costs nothing extra.
  const onPage = squawks.find((s) => s.id === openId) ?? null;
  const recordQ = useSquawk(openId != null && !onPage ? openId : null);
  const viewing = onPage ?? (openId != null ? (recordQ.data ?? null) : null);

  const columns = React.useMemo(() => squawkColumns(resolved), [resolved]);

  /** Up and down the page from inside the panel, the way the old board allowed. */
  const step = (delta: -1 | 1) => {
    if (openId == null || squawks.length === 0) return;
    const i = squawks.findIndex((s) => s.id === openId);
    if (i === -1) return;
    const next = squawks[Math.min(squawks.length - 1, Math.max(0, i + delta))];
    if (next) onOpenId(next.id);
  };

  const filtering = !!searchQ || hasResourceFilter(resourceId);

  const body = () => {
    if (listQ.isLoading) {
      return (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
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
            icon={resolved ? ClipboardList : CheckCircle2}
            title={resolved ? "Nothing resolved yet" : "No open squawks, the fleet's clean."}
            body={
              resolved
                ? "Squawks you sign off will be archived here for the record."
                : "Anything a pilot reports shows up here until a technician signs it off."
            }
            action={
              onLog ? (
                <Button onClick={onLog}>
                  <Plus className="size-4" /> Log a squawk
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
        data={squawks}
        paging={paging}
        total={total}
        loading={listQ.isFetching}
        emptyMessage="Nothing matches that search."
        docShot={resolved ? "maintenance-squawks-resolved" : "maintenance-squawks-open"}
        // Cards on a phone, where five columns would be a horizontal scroll nobody wants.
        mobileCard={(s) => <SquawkCard squawk={s} onOpen={() => onOpenId(s.id)} />}
        onRowClick={(s) => onOpenId(s.id)}
        isRowSelected={(s) => s.id === openId}
      />
    );
  };

  return (
    <>
      {body()}

      <SquawkDetailSheet
        squawk={viewing}
        open={openId != null}
        onOpenChange={(o) => !o && onOpenId(null)}
        onResolve={
          canResolve && !resolved
            ? (s) => {
                onOpenId(null);
                setResolving(s);
              }
            : undefined
        }
        // Verifying is a judgement about a fault you have just read, so it is offered from
        // the write-up rather than as a second button on every row. Same placement the
        // phone uses, and the same viewers as resolve.
        onVerify={
          canResolve
            ? (s) => {
                onOpenId(null);
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
    </>
  );
}

const STAMP = "MMM d, yyyy";

function squawkColumns(resolved: boolean): ColumnDef<Squawk, unknown>[] {
  return [
    {
      id: "title",
      meta: { sortKey: "title" },
      header: "Squawk",
      accessorFn: (r) => r.title ?? "",
      cell: ({ row }) => (
        // A hard max, not just `truncate`. The table lays out `auto`, so a column is sized
        // by its widest cell whatever the colgroup says, and one long write-up stretched
        // this one until the other four were pushed off the side of the table.
        <div className="min-w-0 max-w-[34rem]">
          <div className="truncate text-sm font-medium">
            {row.original.title || "Untitled squawk"}
          </div>
          {row.original.description && (
            <div className="truncate text-xs text-muted-foreground">
              {row.original.description}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "aircraft",
      meta: { width: "10rem" },
      header: "Aircraft",
      accessorFn: (r) => (r.resource ? resourceLabel(r.resource).name : ""),
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap font-mono text-sm">
          {(getValue() as string) || ""}
        </span>
      ),
    },
    {
      id: "status",
      meta: { width: "8rem" },
      header: "Status",
      accessorFn: (r) => (r.resolvedAt ? "resolved" : r.grounding ? "grounding" : "open"),
      cell: ({ row }) => <SquawkStatusBadge squawk={row.original} />,
    },
    {
      id: "reportedBy",
      meta: { width: "12rem" },
      header: "Reported by",
      accessorFn: (r) => r.reportedBy?.user?.name ?? "",
      cell: ({ getValue }) => (
        <span className="truncate text-sm text-muted-foreground">
          {(getValue() as string) || "Unknown"}
        </span>
      ),
    },
    // The date that matters differs by board: on Open it is how long this has been waiting,
    // on Resolved it is when it was signed off. Showing "Reported" on the resolved list
    // made every row look stale.
    resolved
      ? {
          id: "resolvedAt",
          meta: { sortKey: "resolvedAt", width: "10rem" },
          header: "Resolved",
          accessorFn: (r) => r.resolvedAt ?? "",
          cell: ({ getValue }) => (
            <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
              {formatDate(getValue() as string, STAMP, "")}
            </span>
          ),
        }
      : {
          id: "createdAt",
          meta: { sortKey: "createdAt", width: "10rem" },
          header: "Reported",
          accessorFn: (r) => r.reportedAt ?? r.createdAt ?? "",
          cell: ({ getValue }) => (
            <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
              {formatDate(getValue() as string, STAMP, "")}
            </span>
          ),
        },
  ];
}

function hasResourceFilter(resourceId?: number | number[]) {
  return Array.isArray(resourceId) ? resourceId.length > 0 : resourceId != null;
}
