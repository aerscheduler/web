import { Link } from "@tanstack/react-router";
import type { WorkOrder } from "@/types/api";
import { useBilling, useWorkOrderInvoicePreview } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { ExplainedButton } from "@/components/explained-button";
import { explainRaise } from "@/components/maintenance/work-order-work-table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * A job somebody pays for is about to be completed with charges on it and no invoice. Murray's
 * WO-1003 went that way: $850 of work completed from the phone, flipped back to Ready twice, then
 * completed again, and nothing anywhere said it was never billed (2026-10-07).
 *
 * The admin chooses: raise the invoice now (the job completes once it is raised), or complete it
 * without one on purpose (their own staff's aircraft, a warranty job), which is recorded so the
 * Finished list stops asking. Anybody else may still complete it; it then reads Not invoiced for
 * the admins until somebody does one or the other.
 */
export function needsBillingBeforeCompleting(w: WorkOrder): boolean {
  const paidFor = w.aircraft.use === "shop" || w.billTo != null;
  return paidFor && w.billing === "none" && !w.invoice && (w.chargesCents ?? 0) > 0 && !w.noInvoiceAt;
}

export function FinishUnbilledDialog({
  workOrder: w,
  open,
  admin,
  onCancel,
  onRaise,
  onComplete,
}: {
  workOrder: WorkOrder;
  open: boolean;
  admin: boolean;
  onCancel: () => void;
  /** Open the Raise invoice form; the job completes once the invoice is raised. */
  onRaise: () => void;
  /** Complete it now: `noInvoice` when the admin chose not to bill it. */
  onComplete: (noInvoice: boolean) => void;
}) {
  const billingQ = useBilling({ enabled: open && admin });
  const previewQ = useWorkOrderInvoicePreview(open && admin && w.billTo ? w.id : null);
  const stripeOn = Boolean(billingQ.data?.stripeEnabled);
  const block = previewQ.error instanceof ApiError && previewQ.error.status >= 400 && previewQ.error.status < 500 ? previewQ.error : null;
  const charges = formatMoney(w.chargesCents ?? 0);
  const who = w.billTo?.name ?? null;

  // Why Raise the invoice cannot be pressed, said where the button is, with the way to fix it.
  const raiseExplain = !w.billTo
    ? {
        text: "Nobody is billed for this job. Choose who pays under Details, Billed to.",
        node: (
          <>
            <p className="font-medium">Nobody is billed for this job</p>
            <p className="text-muted-foreground">Choose who pays under Details, Billed to, then raise the invoice.</p>
          </>
        ),
      }
    : !billingQ.isLoading && !stripeOn
      ? {
          text: "Billing is not connected. Connect it in Settings, Billing.",
          node: (
            <>
              <p className="font-medium">Billing is not connected</p>
              <p>
                <Link to="/settings" search={{ tab: "billing" } as never} className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
                  Connect billing
                </Link>{" "}
                to send invoices.
              </p>
            </>
          ),
        }
      : block
        ? explainRaise(block, true)
        : null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent data-doc-shot="work-order-finish-unbilled">
        <AlertDialogHeader>
          <AlertDialogTitle>{w.label} isn&apos;t invoiced yet</AlertDialogTitle>
          <AlertDialogDescription>
            {who ? `${charges} of work for ${who} has not been billed.` : `${charges} of work on it has not been billed, and nobody is chosen to pay.`}{" "}
            {admin
              ? "Raise the invoice now and the job completes when it is sent, or complete it without one if it is not being billed."
              : "An admin raises the invoice. Complete it anyway and it shows as Not invoiced on the Finished list until they do."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          {/* Closing it is not a third answer (Tony, 2026-10-09): it sits apart, on the left. */}
          <AlertDialogCancel onClick={onCancel} className="sm:mr-auto">
            Go back
          </AlertDialogCancel>
          {admin ? (
            <>
              <Button variant="outline" onClick={() => onComplete(true)}>
                Complete without an invoice
              </Button>
              <ExplainedButton
                onClick={onRaise}
                disabled={!!raiseExplain || billingQ.isLoading || previewQ.isLoading}
                explain={raiseExplain?.node}
                summary={raiseExplain?.text}
              >
                Raise the invoice
              </ExplainedButton>
            </>
          ) : (
            <Button onClick={() => onComplete(false)}>Complete anyway</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
