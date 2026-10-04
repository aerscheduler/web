import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Hammer, Plus } from "lucide-react";
import type { Resource, WorkOrder } from "@/types/api";
import { useWorkOrders } from "@/features/queries";
import { formatDate, formatMoney } from "@/lib/utils";
import { useTimeZone } from "@/lib/use-timezone";
import { dateKeyInZone } from "@/lib/timezone";
import { isOpenWorkOrder } from "@/lib/work-orders";
import { WorkOrderFormModal } from "@/components/maintenance/work-order-form-modal";
import { STAGE_GROUPS } from "@/components/maintenance/work-order-table";
import { WorkStatusIcon } from "@/components/maintenance/work-status-icon";
import { DocsHint } from "@/components/docs-hint";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";

/**
 * An aircraft's jobs, open and past (P3.6: the history lives on the aeroplane, not only on a
 * board reached from the other side of the app). The shop roles only, like the jobs themselves.
 *
 * A ListTable since 2026-09-30. The open jobs group by stage exactly as the Open jobs board
 * does (`STAGE_GROUPS`), so a job reads the same on both, then Finished: completed and
 * cancelled, newest first.
 */

const COLUMNS: ListTableColumn[] = [
  { id: "billTo", header: "Billed to", width: "10rem" },
  // Says which date it is: when it is promised back, or when it finished or was called off.
  { id: "date", header: "Date", width: "10rem" },
  { id: "charges", header: "Charges", width: "6.5rem", align: "end", narrow: "keep" },
];
/** Below this the job's request was cut to "E2E-Annu…" beside the tab rail on a 1280 screen: Billed to and Date go under it. */
const NARROW_AT = 760;

/**
 * When a finished job finished. For a completed one that is `completedAt`, the day the WORK
 * finished, which the shop can backdate; `closedAt` is only when somebody pressed Completed.
 * A cancelled job has no `completedAt` (the server clears it), so its day is `closedAt`.
 */
const finishedOn = (w: WorkOrder): string | null =>
  w.status === "completed" ? (w.completedAt ?? w.closedAt) : w.closedAt;

/** "Oct 3", or "Oct 3, 2025" when it is not this year. */
const day = (iso: string) => {
  const d = new Date(iso);
  return formatDate(iso, d.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy", "");
};

export function ResourceWorkOrders({ resource }: { resource: Resource }) {
  const [opening, setOpening] = useState(false);
  const navigate = useNavigate();
  // Late against the school's own day, as the board judges it: a promise is a day at the airport.
  const tz = useTimeZone();
  const today = dateKeyInZone(new Date(), tz.zone);
  const q = useWorkOrders({ state: "all", resourceId: resource.id });

  const groups = useMemo<ListTableGroup[]>(() => {
    const rows = q.data ?? [];
    const row = (w: WorkOrder, icon: Parameters<typeof WorkStatusIcon>[0]["status"], done: boolean): ListTableRow => ({
      id: `job-${w.id}`,
      testId: `aircraft-job-${w.id}`,
      label: `${w.label}, ${w.complaint || "No request written"}`,
      leading: <WorkStatusIcon status={icon} />,
      title: (
        <>
          <Link
            to="/maintenance/work-orders/$workOrderId"
            params={{ workOrderId: String(w.id) }}
            className="font-mono text-[12px] whitespace-nowrap text-muted-foreground underline-offset-2 hover:underline"
          >
            {w.label}
          </Link>{" "}
          <span>{w.complaint || "No request written"}</span>
        </>
      ),
      // Waiting has two causes, so the group alone does not say which; a finished job says
      // whether it was done or called off.
      tags:
        w.status === "waiting_owner" || w.status === "waiting_parts" || done || w.billing !== "none" ? (
          <>
            {(w.status === "waiting_owner" || w.status === "waiting_parts" || done) && (
              <ListTag dot={done ? undefined : STAGE_GROUPS.find((g) => g.statuses.includes(w.status))?.dot}>{w.statusLabel}</ListTag>
            )}
            {w.billing !== "none" && <ListTag>{w.billing === "paid" ? "Paid" : "Invoiced"}</ListTag>}
          </>
        ) : undefined,
      dim: w.status === "cancelled",
      onOpen: () => void navigate({ to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: String(w.id) } }),
      cells: {
        billTo: w.billTo ? <WorkspaceUserAvatar person={w.billTo} showName /> : <span className="text-muted-foreground">Nobody</span>,
        date: done ? (
          <span className="text-muted-foreground">
            {/* Old rows can lack the stamp; then the status alone, never a borrowed date. */}
            {w.status === "cancelled" ? "Cancelled" : "Finished"}
            {finishedOn(w) ? ` ${formatDate(finishedOn(w)!, "MMM d, yyyy", "")}` : ""}
          </span>
        ) : w.promisedOn ? (
          <span className={w.promisedOn < today ? "font-medium text-warning" : "text-muted-foreground"}>
            {w.promisedOn < today ? "Was due back" : "Due back"} {day(`${w.promisedOn}T12:00:00`)}
          </span>
        ) : (
          <span className="text-muted-foreground">Opened {day(w.openedAt)}</span>
        ),
        // A cancelled job never billed shows no money: its lines were never charged.
        charges:
          w.status === "cancelled" && w.billing === "none" ? (
            <span className="text-muted-foreground">None</span>
          ) : w.chargesCents ? (
            <span className="font-medium">{formatMoney(w.chargesCents)}</span>
          ) : (
            <span className="text-muted-foreground">$0.00</span>
          ),
      },
    });
    const open = STAGE_GROUPS.map((g) => {
      const jobs = rows.filter((w) => g.statuses.includes(w.status)).sort((a, b) => a.number - b.number);
      return {
        id: g.id,
        label: g.label,
        marker: <span className="size-2 rounded-full" style={{ background: g.dot }} aria-hidden />,
        count: jobs.length,
        rows: jobs.map((w) => row(w, g.icon, false)),
      };
    });
    // Newest finish first, by the date the row shows, not by job number: a long annual opened in
    // August and finished today belongs above an oil change finished last week.
    const past = rows
      .filter((w) => !isOpenWorkOrder(w))
      .sort((a, b) => (finishedOn(b) ?? "").localeCompare(finishedOn(a) ?? "") || b.number - a.number);
    return [
      ...open,
      {
        id: "finished",
        label: "Finished",
        marker: <span className="size-2 rounded-full bg-border" aria-hidden />,
        count: past.length,
        rows: past.map((w) => row(w, w.status === "cancelled" ? "declined" : "done", true)),
      },
    ];
  }, [q.data, navigate, today]);

  const toolbar = (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
        What the shop is doing on this aircraft, and what it has done.
        <DocsHint topic="run-a-work-order" />
      </p>
      <Button size="sm" onClick={() => setOpening(true)}>
        <Plus className="size-4" /> Open a work order
      </Button>
    </div>
  );

  return (
    <div data-doc-shot="aircraft-work-orders">
      {q.isLoading || q.isError ? (
        // The button stays reachable while the list loads or fails: opening a job needs no list.
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card px-4 py-2.5">{toolbar}</div>
          {q.isLoading ? <ListTableSkeleton columns={COLUMNS} groups={2} rows={2} toolbar={false} narrowAt={NARROW_AT} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
        </div>
      ) : (
        <ListTable
          label="Work orders on this aircraft"
          columns={COLUMNS}
          narrowAt={NARROW_AT}
          groups={groups}
          titleHeader="Job"
          showHeader
          toolbar={toolbar}
          empty={<p className="px-4 py-6 text-[13px] text-muted-foreground">No work orders on this aircraft yet.</p>}
        />
      )}
      <WorkOrderFormModal open={opening} onOpenChange={setOpening} fixedResource={resource} />
    </div>
  );
}

export const WorkOrdersIcon = Hammer;
