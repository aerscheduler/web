import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarClock, MoreHorizontal, PlaneTakeoff, Trash2, User, Wrench } from "lucide-react";
import { useDeleteWorkOrder, useResource, useUpdateWorkOrder, useWorkOrder, useWorkOrderItems } from "@/features/queries";
import { hasActiveOrg, rolesFromSession, useAuth } from "@/lib/auth";
import { canAccess, canManageBilling, canOpenWorkOrders, guardRoute, isAdmin } from "@/lib/permissions";
import { useConfirm } from "@/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatMoney } from "@/lib/utils";
import type { WorkOrder, WorkOrderInput, WorkOrderStatus } from "@/types/api";
import {
  IN_SHOP_STATUSES,
  isOpenWorkOrder,
  WORK_ORDER_STATUS_OPTIONS,
  workOrderAircraftName,
  workOrderStatusVariant,
} from "@/lib/work-orders";
import { EditableTextCard, WorkOrderDetailsCard } from "@/components/maintenance/work-order-properties";
import { WorkOrderAnswersCard } from "@/components/maintenance/work-order-work";
import { WorkOrderFilesCard } from "@/components/maintenance/work-order-files";
import { WorkOrderWorkTable } from "@/components/maintenance/work-order-work-table";
import { OwnerNoticesHold } from "@/components/maintenance/owner-notices-hold";
import {
  CardEmpty,
  DetailBack,
  DetailCard,
  DetailHeader,
  KeyValue,
  KeyValueList,
  MetaItem,
  RecordNotFound,
  isMissingRecord,
  useDetailTitle,
} from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { TableView } from "@/components/table-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * One job, in full: the shop's workspace for it.
 *
 * A sibling of the Maintenance board (the `maintenance_` filename) rather than a child, for the
 * same reason as a squawk's page: Maintenance owns its own full-height scroll, and nesting would
 * render the whole board under the job. Guarded like the board itself, the shop roles, which is
 * exactly who the server serves a work order to.
 */
export const Route = createFileRoute("/_authed/maintenance_/work-orders/$workOrderId")({
  beforeLoad: () => {
    guardRoute("/maintenance")();
    // Maintenance is open to a dispatcher; the jobs are not. Back to the aircraft list.
    if (hasActiveOrg() && !canOpenWorkOrders(rolesFromSession())) throw redirect({ to: "/maintenance" });
  },
  //`?tour=true`: the first-job walkthrough, which a shop lands on at the end of setup.
  validateSearch: (search: Record<string, unknown>): { tour?: true } =>
    search.tour === true || search.tour === "true" || search.tour === 1 || search.tour === "1" ? { tour: true } : {},
  component: WorkOrderPage,
});

/** The board a job belongs on: open jobs, or finished ones. Back goes where the job is listed. */
const boardFor = (w: Pick<WorkOrder, "status">) => ({ view: isOpenWorkOrder(w) ? "work-orders" : "work-orders-closed" });

function WorkOrderPage() {
  const { workOrderId: param } = Route.useParams();
  const id = Number.parseInt(param, 10);
  const q = useWorkOrder(Number.isFinite(id) ? id : null);
  const workOrder = q.data ?? null;

  const missing = !Number.isFinite(id) || isMissingRecord(q.error) || (!q.isLoading && !q.isError && workOrder == null);
  if (missing) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={Wrench}
          title="Work order not found"
          body="That link doesn't point at a job in this organization."
          backTo="/maintenance"
          backLabel="Back to Maintenance"
        />
      </PageFrame>
    );
  }
  if (q.isLoading) {
    return (
      <PageFrame>
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </PageFrame>
    );
  }
  if (q.isError || !workOrder) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </PageFrame>
    );
  }
  return <WorkOrderBody workOrder={workOrder} />;
}

function WorkOrderBody({ workOrder: w }: { workOrder: WorkOrder }) {
  const { tour } = Route.useSearch();
  const update = useUpdateWorkOrder();
  const remove = useDeleteWorkOrder();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { roles } = useAuth();
  // Admins, matching the server; and only a job that was never invoiced.
  // A voided bill still happened, so the server keeps any job that was ever billed.
  const canDelete = canManageBilling(roles) && w.billing === "none" && !w.invoice && w.hasInvoices === false;

  async function deleteJob() {
    const ok = await confirm({
      title: `Delete ${w.label}?`,
      description: "For a job opened by mistake. It is removed for everybody; the audit log keeps a line saying it existed. To stop a real job, set its stage to Cancelled instead.",
      confirmLabel: "Delete work order",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(w.id);
      toast.success(`${w.label} deleted`);
      void navigate({ to: "/maintenance", search: boardFor(w) as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the work order");
    }
  }
  const aircraft = workOrderAircraftName(w);
  useDetailTitle(`${w.label} · ${aircraft}`);

  // The job's work, read from the same cache the list below fills.
  const itemsQ = useWorkOrderItems(w.id);

  async function moveTo(status: WorkOrderStatus) {
    if (status === w.status) return;
    // Finishing a job with an inspection on it still open (not declined or put off) asks first:
    // while the job is open the owner hears nothing about that inspection, and once it is
    // finished they start getting its reminders (C9).
    if (status === "completed" || status === "ready") {
      const open = (itemsQ.data ?? []).filter((i) => i.inspection && !i.inspection.signedOff && i.decision !== "declined" && i.decision !== "deferred");
      if (open.length) {
        const names = open.map((i) => i.inspection?.name ?? i.description);
        const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
        const one = names.length === 1;
        const ok = await confirm({
          title: `${list} ${one ? "is" : "are"} not signed off`,
          description:
            w.aircraft.use === "shop"
              ? `Sign ${one ? "it" : "them"} off first, or the owner will start getting reminders about ${one ? "it" : "them"}.`
              : `Sign ${one ? "it" : "them"} off first, or ${one ? "it stays" : "they stay"} due on the aircraft.`,
          confirmLabel: status === "completed" ? "Complete anyway" : "Mark ready anyway",
          cancelLabel: "Go back",
        });
        if (!ok) return;
      }
    }
    try {
      const next = await update.mutateAsync({ id: w.id, status });
      // Arrived with no meters in recorded: ask for them now, filled in from the aircraft, the
      // way the open form does. Only the arrival, never a later in-shop move.
      const arrived = IN_SHOP_STATUSES.includes(status) && !IN_SHOP_STATUSES.includes(w.status);
      const missing = (hasHobbs && next.hobbsIn == null) || (hasTach && next.tachIn == null);
      if (arrived && missing) {
        const plane = planeQ.data?.type?.plane;
        // The meters editor in Details opens, filled in from the aircraft.
        setAskMeters({ hobbs: plane?.hobbsTime ?? null, tach: plane?.tachTime ?? null });
        // The form says the aircraft is here; a toast would only sit on its Save button.
        return;
      }
      toast.success(`${w.label}: ${next.statusLabel}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the stage");
    }
  }

  const planeQ = useResource(w.aircraft.id);
  const [askMeters, setAskMeters] = useState<{ hobbs: number | null; tach: number | null } | null>(null);
  // One field at a time, from the cards: the job has no Edit dialog (Tony, 2026-09-30).
  const saveField = async (patch: WorkOrderInput) => {
    try {
      await update.mutateAsync({ id: w.id, ...patch });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the change");
      return false;
    }
  };
  const meters = w.aircraft.meterMode ?? "hobbs_and_tach";
  const hasHobbs = meters === "hobbs_and_tach" || meters === "hobbs_only";
  const hasTach = meters === "hobbs_and_tach" || meters === "tach_only";
  const day = (iso: string | null | undefined) => (iso ? formatDate(iso, "MMM d, yyyy", "") : "");

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <DetailBack to="/maintenance" search={boardFor(w)} label={isOpenWorkOrder(w) ? "Open jobs" : "Finished jobs"} />
        <DetailHeader
          media={
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Wrench className="size-5" />
            </span>
          }
          title={`${w.label} · ${aircraft}`}
          badges={
            <>
              <Badge variant={workOrderStatusVariant(w.status)}>{w.statusLabel}</Badge>
              {w.billing !== "none" && <Badge variant={w.billing === "paid" ? "success" : "outline"}>{w.billing === "paid" ? "Paid" : "Invoiced"}</Badge>}
            </>
          }
          subtitle={
            w.billTo?.name
              ? `Billed to ${w.billTo.name}`
              : w.aircraft.use === "shop"
                ? isAdmin(roles)
                  ? "Nobody is billed yet. Edit the job to choose who pays."
                  : "Nobody is billed yet. An admin chooses who pays."
                : "Not billed: the organization's own aircraft"
          }
          meta={
            <>
              <MetaItem icon={PlaneTakeoff}>
                <Link to="/aircraft/$resourceId" params={{ resourceId: String(w.aircraft.id) }} className="font-mono underline-offset-2 hover:underline">
                  {aircraft}
                </Link>
              </MetaItem>
              {w.billTo && (
                <MetaItem icon={User}>
                  <Link to="/people/$orgUserId" params={{ orgUserId: String(w.billTo.id) }} className="underline-offset-2 hover:underline">
                    {w.billTo.name ?? "Owner"}
                  </Link>
                </MetaItem>
              )}
              {w.promisedOn && isOpenWorkOrder(w) && (
                <MetaItem icon={CalendarClock}>Promised {day(`${w.promisedOn}T12:00:00`)}</MetaItem>
              )}
            </>
          }
          actions={
            <>
              <Select value={w.status} onValueChange={(v) => void moveTo(v as WorkOrderStatus)} disabled={update.isPending}>
                <SelectTrigger className="w-48" aria-label="Stage" data-doc-shot="work-order-stage">
                  <SelectValue />
                </SelectTrigger>
                {/* Wider than the trigger: each stage says what it means under its name. */}
                {/* Focus is not handed back to the menu as it closes: the move can open the
                    meters form, and the menu took focus back from its first field a moment after
                    it opened, so the reading typed there went to the Stage menu. */}
                <SelectContent position="popper" align="end" className="w-72" onCloseAutoFocus={(e) => e.preventDefault()}>
                  {WORK_ORDER_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} description={o.hint}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => void deleteJob()}>
                      <Trash2 className="size-4" /> Delete work order
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
        />
      </TableView.Header>

      {/* The page does not scroll on a wide screen (Tony, 2026-09-30): the list takes the height
          it is given and scrolls its rows, and the right-hand column scrolls on its own. Narrower,
          the two stack and the page scrolls as usual. */}
      <TableView.Body className="lg:flex lg:flex-col lg:overflow-hidden">
        <OwnerNoticesHold workOrder={w} />
        <div className="grid gap-4 pb-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-0">
          <div className="flex min-w-0 flex-col lg:min-h-0">
            <WorkOrderWorkTable
              workOrder={w}
              guide={tour ? { onClose: () => void navigate({ to: ".", search: {}, replace: true }) } : undefined}
            />
          </div>

          <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            <WorkOrderDetailsCard workOrder={w} metersPrompt={askMeters} onMetersPromptClose={() => setAskMeters(null)} />

            {/* The organization's own aircraft has no owner asking for the work (L15). */}
            <EditableTextCard
              title={w.aircraft.use === "shop" ? "What the owner asked for" : "The request"}
              description={w.aircraft.use === "shop" ? "In their words." : "What the aircraft is in for."}
              docShot="work-order-request"
              docs="run-a-work-order"
              value={w.complaint}
              emptyText="No request written yet."
              placeholder="Annual inspection. Left brake feels soft."
              maxLength={2000}
              onSave={(v) => saveField({ complaint: v })}
            />

            {/* The owner's answers are a customer's aircraft's: the organization decides its own. */}
            {w.aircraft.use === "shop" && <WorkOrderAnswersCard workOrder={w} />}

            <WorkOrderFilesCard workOrder={w} />

            <EditableTextCard
              title={w.aircraft.use === "shop" ? "Notes for the owner" : "Notes for the invoice"}
              description="Printed on the invoice under the work completed."
              value={w.customerNotes}
              emptyText="None yet."
              placeholder={w.aircraft.use === "shop" ? "What the owner should know: parts on order, what to watch for." : "Parts on order, what to watch for."}
              maxLength={4000}
              onSave={(v) => saveField({ customerNotes: v })}
            />

            <EditableTextCard
              title="Shop notes"
              description="For the shop only."
              value={w.internalNotes}
              emptyText="None yet."
              placeholder={w.aircraft.use === "shop" ? "Purchase orders, reminders, anything the owner should not see." : "Purchase orders, reminders."}
              maxLength={4000}
              onSave={(v) => saveField({ internalNotes: v })}
            />

            <DetailCard title="Billing" description="Read from the job's invoice.">
              {w.invoice ? (
                <KeyValueList>
                  <KeyValue label="Invoice">
                    {/* Billing is not every shop role's page: a link it would bounce is plain text. */}
                    {canAccess("/billing", roles) ? (
                      <Link to="/billing" search={{ invoice: w.invoice.id } as never} className="underline-offset-2 hover:underline">
                        {w.invoice.number ?? "Open the invoice"}
                      </Link>
                    ) : (
                      (w.invoice.number ?? "Invoiced")
                    )}
                  </KeyValue>
                  <KeyValue label="Invoice total" mono>
                    {formatMoney(w.invoice.total)}
                  </KeyValue>
                  {w.invoice.tax != null && w.invoice.tax > 0 && (
                    <KeyValue label="Of which tax" mono>
                      {formatMoney(w.invoice.tax)}
                    </KeyValue>
                  )}
                  <KeyValue label="Paid">{w.invoice.paidAt ? day(w.invoice.paidAt) : "Not yet"}</KeyValue>
                </KeyValueList>
              ) : (
                <CardEmpty>
                  {w.billTo ? "Not invoiced yet." : w.aircraft.use === "shop" ? "Nobody is billed yet." : "Nobody is billed for this job."}
                </CardEmpty>
              )}
            </DetailCard>
          </div>
        </div>
      </TableView.Body>

    </TableView>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 pb-8">
      <DetailBack to="/maintenance" label="Maintenance" />
      {children}
    </div>
  );
}
