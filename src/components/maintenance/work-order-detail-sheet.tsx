import { Link } from "@tanstack/react-router";
import { CalendarClock, FileText, PlaneTakeoff, Receipt, User, Users } from "lucide-react";
import type { WorkOrder } from "@/types/api";
import { formatDate, formatMoney } from "@/lib/utils";
import { workOrderAircraftName, workOrderStatusVariant } from "@/lib/work-orders";
import { DetailPanel } from "@/components/detail-panel";
import { SheetDetailField, SheetDetailFields } from "@/components/sheet-detail-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isPastDue } from "@/lib/payment-methods";

/**
 * A peek at one job from the board: where it stands, who pays, what was asked. The job's own
 * page is the workspace (items, lines, the invoice), so the one action here is opening it.
 */
export function WorkOrderDetailSheet({
  workOrder: w,
  open,
  onOpenChange,
  onStep,
}: {
  workOrder: WorkOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStep?: (delta: -1 | 1) => void;
}) {
  const aircraft = w ? workOrderAircraftName(w) : null;
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={w ? `${w.label} · ${aircraft}` : "Work order"}
      description={w?.billTo?.name ? `Billed to ${w.billTo.name}` : w ? "Not billed" : undefined}
      badge={w ? <Badge variant={workOrderStatusVariant(w.status)}>{w.statusLabel}</Badge> : undefined}
      footer={
        w ? (
          <Button asChild className="w-full">
            <Link to="/maintenance/work-orders/$workOrderId" params={{ workOrderId: String(w.id) }}>
              Open the work order
            </Link>
          </Button>
        ) : undefined
      }
    >
      {w && (
        <div data-doc-shot="work-order-panel" className="space-y-5 pt-4">
          <SheetDetailFields>
            <SheetDetailField icon={FileText} label="Request" stacked>
              {w.complaint ? <p className="whitespace-pre-wrap">{w.complaint}</p> : <span className="text-muted-foreground">No request written</span>}
            </SheetDetailField>
            <SheetDetailField icon={PlaneTakeoff} label="Aircraft">
              <Link to="/aircraft/$resourceId" params={{ resourceId: String(w.aircraft.id) }} className="font-mono font-medium underline-offset-2 hover:underline">
                {aircraft}
              </Link>
            </SheetDetailField>
            <SheetDetailField icon={User} label="Billed to">
              {w.billTo ? (
                <Link to="/people/$orgUserId" params={{ orgUserId: String(w.billTo.id) }} className="underline-offset-2 hover:underline">
                  {w.billTo.name ?? "Owner"}
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  {w.aircraft.use === "shop" ? "Nobody yet" : "Nobody (the organization's own aircraft)"}
                </span>
              )}
            </SheetDetailField>
            {w.technicians.length > 0 && (
              <SheetDetailField icon={Users} label="Technicians">
                {w.technicians.map((t) => t.name ?? "Technician").join(", ")}
              </SheetDetailField>
            )}
            <SheetDetailField icon={CalendarClock} label="Opened">
              <span className="tabular-nums">{formatDate(w.openedAt, "MMM d, yyyy", "")}</span>
            </SheetDetailField>
            {w.receivedAt && (
              <SheetDetailField icon={CalendarClock} label="Received">
                <span className="tabular-nums">{formatDate(w.receivedAt, "MMM d, yyyy", "")}</span>
              </SheetDetailField>
            )}
            {w.promisedOn && (
              <SheetDetailField icon={CalendarClock} label="Promised back">
                <span className="tabular-nums">{formatDate(`${w.promisedOn}T12:00:00`, "MMM d, yyyy", "")}</span>
              </SheetDetailField>
            )}
            {w.invoice && (
              <SheetDetailField icon={Receipt} label="Invoice">
                <span className="tabular-nums">
                  {formatMoney(w.invoice.total)} · {w.invoice.paidAt ? "Paid" : isPastDue({ ...w.invoice, voidedAt: null }) ? "Past due" : "Not paid yet"}
                </span>
              </SheetDetailField>
            )}
          </SheetDetailFields>
        </div>
      )}
    </DetailPanel>
  );
}
