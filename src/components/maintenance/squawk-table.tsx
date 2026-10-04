import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Plus } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import type { Squawk } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { pageRows, useSquawk, useSquawks, useSquawksPage } from "@/features/queries";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  GroupByMenu,
  ListTable,
  ListTableSkeleton,
  ListTag,
  type ListTableColumn,
  type ListTableGroup,
  type ListTableRow,
  type ListTableSort,
} from "@/components/list-table";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
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
import { SquawkPaperclip } from "@/components/maintenance/squawk-attachments";

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
  if (!resolved) {
    return <OpenSquawksList q={searchQ} resourceId={resourceId} openId={openId} onOpenId={onOpenId} onLog={onLog} />;
  }
  return <ResolvedSquawksTable q={searchQ} resourceId={resourceId} openId={openId} onOpenId={onOpenId} />;
}

/** The Resolved archive: long and growing, so it stays a server-paged table. */
function ResolvedSquawksTable({
  q: searchQ,
  resourceId,
  openId,
  onOpenId,
}: {
  q?: string;
  resourceId?: number | number[];
  openId: number | null;
  onOpenId: (id: number | null) => void;
}) {
  const filter = { resolved: true, q: searchQ, resourceId };
  const navigate = useNavigate();
  const paging = usePaging({ resetKey: filter, defaultSort: { key: "resolvedAt", dir: "desc" } });
  const listQ = useSquawksPage(filter, paging);
  const { rows: squawks, total } = pageRows(listQ);

  // The open squawk may not be on this page of the table: a notification links straight to
  // one, and a filter can hide the very row somebody came from. Fetched by id only when the
  // page does not already have it, so an ordinary click costs nothing extra.
  const onPage = squawks.find((s) => s.id === openId) ?? null;
  const recordQ = useSquawk(openId != null && !onPage ? openId : null);
  const viewing = onPage ?? (openId != null ? (recordQ.data ?? null) : null);

  const columns = React.useMemo(() => squawkColumns(true), []);

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
            graphic="squawks-resolved"
            title="Nothing resolved yet"
            body="Squawks you sign off will be archived here for the record."
            docs="squawk-grounding"
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
        docShot="maintenance-squawks-resolved"
        // Cards on a phone, where five columns would be a horizontal scroll nobody wants.
        mobileCard={(s) => <SquawkCard squawk={s} onOpen={() => onOpenId(s.id)} />}
        onRowClick={(s) => onOpenId(s.id)}
        onRowDoubleClick={(s) => void navigate({ to: "/maintenance/squawks/$squawkId", params: { squawkId: String(s.id) } })}
        isRowSelected={(s) => s.id === openId}
      />
    );
  };

  return (
    <>
      {body()}
      <SquawkPanels viewing={viewing} openId={openId} onOpenId={onOpenId} resolved onStep={step} />
    </>
  );
}

/** The panel beside a squawk board and the two stamps it can lead to. */
function SquawkPanels({
  viewing,
  openId,
  onOpenId,
  resolved,
  onStep,
}: {
  viewing: Squawk | null;
  openId: number | null;
  onOpenId: (id: number | null) => void;
  resolved: boolean;
  onStep: (delta: -1 | 1) => void;
}) {
  const { roles } = useAuth();
  const canResolve = canResolveSquawk(roles);
  const [resolving, setResolving] = React.useState<Squawk | null>(null);
  const [verifying, setVerifying] = React.useState<Squawk | null>(null);
  return (
    <>
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
        onStep={onStep}
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

type SquawkGroupBy = "grounding" | "aircraft";

const OPEN_SQUAWK_COLUMNS = (groupBy: SquawkGroupBy): ListTableColumn[] => [
  // Grouped by aircraft the heading names the tail; grouped by grounding the row has to.
  ...(groupBy === "grounding" ? [{ id: "aircraft", header: "Aircraft", width: "7rem", sortable: true }] : []),
  { id: "reportedBy", header: "Reported by", width: "10rem" },
  { id: "reported", header: "Reported", width: "8.5rem", align: "end" as const, sortable: true, narrow: "keep" as const },
];

const reportedAt = (s: Squawk) => s.reportedAt ?? s.createdAt;

const SQUAWK_SORT: Record<string, (s: Squawk) => string> = {
  title: (s) => (s.title ?? "").toLowerCase(),
  aircraft: (s) => (s.resource ? resourceLabel(s.resource).name.toLowerCase() : "~"),
  reported: reportedAt,
};

/**
 * The open squawks, grouped by whether each one grounds its aircraft (or by tail).
 *
 * A ListTable since 2026-09-30, unpaged: open squawks are few at any one time (the aircraft
 * page already fetches them whole), and the board reads as a triage list, what is keeping an
 * aircraft on the ground first. Resolved stays a paged table above. Newest first inside a
 * group, the order the table kept.
 */
function OpenSquawksList({
  q: searchQ,
  resourceId,
  openId,
  onOpenId,
  onLog,
}: {
  q?: string;
  resourceId?: number | number[];
  openId: number | null;
  onOpenId: (id: number | null) => void;
  onLog?: () => void;
}) {
  const navigate = useNavigate();
  const listQ = useSquawks({ resolved: false, q: searchQ, resourceId });
  const squawks = React.useMemo(() => listQ.data ?? [], [listQ.data]);
  const [groupByRaw, setGroupBy] = usePersistedState<SquawkGroupBy>("view:squawks-group", "grounding");
  const groupBy: SquawkGroupBy = groupByRaw === "aircraft" ? "aircraft" : "grounding";
  const [sort, setSort] = React.useState<ListTableSort | null>(null);
  const filtering = !!searchQ || hasResourceFilter(resourceId);
  const columns = OPEN_SQUAWK_COLUMNS(groupBy);

  const sections = React.useMemo(() => {
    const key = sort ? SQUAWK_SORT[sort.id] : null;
    const newestFirst = (a: Squawk, b: Squawk) => reportedAt(b).localeCompare(reportedAt(a));
    const order = (list: Squawk[]) =>
      [...list].sort((a, b) => {
        if (!sort || !key) return newestFirst(a, b);
        const x = key(a);
        const y = key(b);
        const c = x < y ? -1 : x > y ? 1 : newestFirst(a, b);
        return sort.desc ? -c : c;
      });
    if (groupBy === "aircraft") {
      const byTail = new Map<string, { label: string; grounding: boolean; items: Squawk[] }>();
      for (const sq of squawks) {
        const id = sq.resource ? `tail-${sq.resource.id}` : "none";
        const g = byTail.get(id) ?? { label: sq.resource ? resourceLabel(sq.resource).name : "No aircraft", grounding: false, items: [] };
        g.items.push(sq);
        g.grounding ||= !!sq.grounding;
        byTail.set(id, g);
      }
      // Tails held down by a grounding squawk first, then by name.
      return [...byTail.entries()]
        .sort(([, a], [, b]) => Number(b.grounding) - Number(a.grounding) || a.label.localeCompare(b.label, undefined, { numeric: true }))
        .map(([id, g]) => ({ id, label: <span className="font-mono">{g.label}</span>, items: order(g.items) }));
    }
    return [
      // About the SQUAWK, how it was filed, not the aircraft: filing one grounds the plane, but
      // a tail can be returned to service by hand while it is open, or be down for something
      // else while this one is minor. Rows say so with their own tag when the two disagree.
      { id: "grounding", label: "Grounding squawks", marker: <AlertTriangle className="size-3.5 text-warning" aria-hidden />, items: order(squawks.filter((sq) => sq.grounding)) },
      { id: "flying", label: "Other squawks", marker: <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />, items: order(squawks.filter((sq) => !sq.grounding)) },
    ];
  }, [squawks, groupBy, sort]);

  // Up and down the list as it reads, group by group.
  const ordered = React.useMemo(() => sections.flatMap((g) => g.items), [sections]);
  const onList = ordered.find((sq) => sq.id === openId) ?? null;
  const recordQ = useSquawk(openId != null && !onList ? openId : null);
  const viewing = onList ?? (openId != null ? (recordQ.data ?? null) : null);
  const step = (delta: -1 | 1) => {
    const i = ordered.findIndex((sq) => sq.id === openId);
    if (i === -1) return;
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + delta))];
    if (next) onOpenId(next.id);
  };

  const groups: ListTableGroup[] = sections.map((g) => ({
    id: g.id,
    label: g.label,
    marker: "marker" in g ? g.marker : undefined,
    count: g.items.length,
    rows: g.items.map((sq): ListTableRow => {
      const tail = sq.resource ? resourceLabel(sq.resource).name : null;
      return {
        id: `squawk-${sq.id}`,
        testId: `squawk-row-${sq.id}`,
        label: `${sq.title || "Untitled squawk"}${tail ? `, ${tail}` : ""}`,
        title: sq.title || "Untitled squawk",
        subtitle: sq.description || undefined,
        tags:
          sq.verifiedAt || sq.hasAttachments || planeDisagrees(sq) ? (
            <>
              {planeDisagrees(sq) && !sq.grounding && (
                <span title="The aircraft is grounded, for something other than this squawk.">
                  <ListTag className="text-warning">Aircraft grounded</ListTag>
                </span>
              )}
              {planeDisagrees(sq) && sq.grounding && (
                <span title="Filed as grounding, but the aircraft has been returned to service while it is still open.">
                  <ListTag className="text-warning">Aircraft not grounded</ListTag>
                </span>
              )}
              {sq.verifiedAt && (
                <span title="A qualified person reproduced the fault. Not fixed yet.">
                  <ListTag>Verified</ListTag>
                </span>
              )}
              <SquawkPaperclip has={sq.hasAttachments} />
            </>
          ) : undefined,
        selected: sq.id === openId,
        onOpen: () => onOpenId(sq.id),
        onOpenPage: () => void navigate({ to: "/maintenance/squawks/$squawkId", params: { squawkId: String(sq.id) } }),
        cells: {
          aircraft: tail ? <span className="font-mono">{tail}</span> : <span className="text-muted-foreground">None</span>,
          reportedBy: sq.reportedBy ? (
            <WorkspaceUserAvatar
              person={{ id: sq.reportedBy.id, name: sq.reportedBy.user?.name, profileImage: sq.reportedBy.profileImage ?? null }}
              showName
            />
          ) : (
            <span className="text-muted-foreground">Unknown</span>
          ),
          reported: <span className="text-muted-foreground">{reportedText(reportedAt(sq))}</span>,
        },
      };
    }),
  }));

  let body: React.ReactNode;
  if (listQ.isLoading) {
    body = <ListTableSkeleton fill columns={columns} className="mb-4 min-h-0 flex-1" />;
  } else if (listQ.isError) {
    body = (
      <Card className="flex flex-col min-h-0 flex-1">
        <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />
      </Card>
    );
  } else if (squawks.length === 0 && !filtering) {
    body = (
      <Card className="flex flex-col min-h-0 flex-1">
        <EmptyState
          graphic="squawks-open"
          title="No open squawks, the fleet's clean."
          body="Anything a pilot reports shows up here until a technician signs it off."
          docs="squawk-grounding"
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
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col pb-4">
        <ListTable
          fill
          label="Open squawks"
          docShot="maintenance-squawks-open"
          className="min-h-0"
          columns={columns}
          groups={groups}
          titleHeader="Squawk"
          titleSortable
          showHeader
          sort={sort}
          onSortChange={setSort}
          toolbar={
            <GroupByMenu
              value={groupBy}
              options={[
                { value: "grounding", label: "Grounding" },
                { value: "aircraft", label: "Aircraft" },
              ]}
              onChange={(v) => {
                // A sort on a column the new grouping hides would order rows by nothing on screen.
                setSort(null);
                setGroupBy(v);
              }}
            />
          }
          empty={<p className="px-4 py-6 text-[13px] text-muted-foreground">Nothing matches that search.</p>}
        />
      </div>
    );
  }

  return (
    <>
      {body}
      <SquawkPanels viewing={viewing} openId={openId} onOpenId={onOpenId} resolved={false} onStep={step} />
    </>
  );
}

/**
 * Whether the aircraft's own state disagrees with how the squawk was filed. Only for an
 * aeroplane: a sim or a room has no line to be on, so `grounded` is absent and nothing shows.
 */
function planeDisagrees(sq: Squawk): boolean {
  const grounded = sq.resource?.type?.plane?.grounded;
  if (grounded == null) return false;
  return !!sq.grounding !== grounded;
}

/** "Sep 3, 27 days ago": the date, and how long it has waited, which is what a queue is read for. */
function reportedText(iso: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(iso));
  const date = formatDate(iso, "MMM d", "");
  if (!date || Number.isNaN(days)) return "";
  // A stamp from a clock ahead of this one: the date alone, no "today" it isn't.
  if (days < 0) return date;
  if (days === 0) return `${date}, today`;
  if (days === 1) return `${date}, yesterday`;
  return `${date}, ${days} days ago`;
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
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-medium">
              {row.original.title || "Untitled squawk"}
            </div>
            <SquawkPaperclip has={row.original.hasAttachments} />
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
