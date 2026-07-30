import { formatDistanceToNow, parseISO } from "date-fns";
import { CheckCircle2, Loader2, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Invoice } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuickBooksSettings, useSyncInvoiceToQuickBooks } from "@/features/queries";

/** Deep-link into a Sales Receipt — must match sandbox vs production Intuit company. */
export function qboSalesReceiptUrl(receiptId: string, useSandbox: boolean): string {
  const host = useSandbox
    ? "https://app.sandbox.qbo.intuit.com"
    : "https://app.qbo.intuit.com";
  return `${host}/app/salesreceipt?txnId=${encodeURIComponent(receiptId)}`;
}

/** Desk-facing QuickBooks sync state for a paid invoice. */
export function InvoiceQuickBooksSection({ invoice }: { invoice: Invoice }) {
  const { roles } = useAuth();
  const isOwner = canManageBillingSettings(roles);
  const sync = useSyncInvoiceToQuickBooks();
  // Owners get useSandbox from settings; default sandbox-safe while loading so we
  // never open production QBO for a sandbox receipt.
  const qboSettings = useQuickBooksSettings({
    enabled: isOwner && !!invoice.qboSalesReceiptId,
  });
  const useSandbox = qboSettings.data?.useSandbox ?? true;

  if (!invoice.paidAt || invoice.voidedAt) return null;

  const synced = !!invoice.qboSalesReceiptId;
  const failed = !!invoice.qboSyncError && !synced;

  async function onRetry() {
    try {
      await sync.mutateAsync(invoice.id);
      toast.success("Synced to QuickBooks");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "QuickBooks sync failed");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              QuickBooks
            </p>
            {synced ? (
              <Badge className="gap-1">
                <CheckCircle2 className="size-3" />
                Synced
              </Badge>
            ) : failed ? (
              <Badge variant="danger" className="gap-1">
                <AlertCircle className="size-3" />
                Failed
              </Badge>
            ) : (
              <Badge variant="secondary">Not synced</Badge>
            )}
          </div>
          {synced && invoice.qboSyncedAt && (
            <p className="text-sm text-muted-foreground">
              Sales Receipt{" "}
              <span className="font-mono text-foreground">{invoice.qboSalesReceiptId}</span>
              {" · "}
              {formatDistanceToNow(parseISO(invoice.qboSyncedAt), { addSuffix: true })}
              {useSandbox ? " · sandbox" : null}
            </p>
          )}
          {failed && (
            <p className="text-sm text-destructive">{invoice.qboSyncError}</p>
          )}
          {!synced && !failed && (
            <p className="text-sm text-muted-foreground">
              Will sync when QuickBooks is connected and sync is enabled — or retry now.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {synced && invoice.qboSalesReceiptId && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a
                href={qboSalesReceiptUrl(invoice.qboSalesReceiptId, useSandbox)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3.5" />
                {useSandbox ? "Open in sandbox" : "Open in QBO"}
              </a>
            </Button>
          )}
          {isOwner && (!synced || failed) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={sync.isPending}
              onClick={() => void onRetry()}
            >
              {sync.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Retry
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
