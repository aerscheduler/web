import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Invoice } from "@/types/api";
import { atRiskOfLeavingUnbilled } from "@/features/void-invoice-flow";
import { formatMoney } from "@/lib/utils";

/**
 * Confirms a void. Plain two-button confirm for most invoices; a three-way choice
 * when this is the last invoice on a past, uncancelled reservation, since voiding it
 * with nothing else billed for the flight is easy to do by accident.
 */
export function VoidInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onVoid,
  onLeaveUnbilled,
  onOpenCloseOut,
  busy,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plain void, no reservation at risk. */
  onVoid: () => void;
  /** Void and leave the flight unbilled, on purpose. */
  onLeaveUnbilled: () => void;
  /** Void, then jump to the reservation to bill it another way. */
  onOpenCloseOut: () => void;
  busy?: boolean;
}) {
  if (!invoice) return null;
  const atRisk = atRiskOfLeavingUnbilled(invoice);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void invoice #{invoice.id}?</AlertDialogTitle>
          <AlertDialogDescription>
            This marks the {formatMoney(invoice.total)} invoice as void. This can&apos;t be
            undone.
            {atRisk &&
              " This is the only invoice covering that flight, so voiding it leaves the flight unbilled unless you bill it another way."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {atRisk ? (
            <>
              <AlertDialogAction variant="outline" disabled={busy} onClick={onLeaveUnbilled}>
                Void and leave unbilled
              </AlertDialogAction>
              <AlertDialogAction disabled={busy} onClick={onOpenCloseOut}>
                Void and open close-out
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction
              disabled={busy}
              onClick={onVoid}
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
            >
              Void invoice
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
