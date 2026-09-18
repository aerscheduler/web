import { formatDistanceToNow, parseISO } from "date-fns";
import { CheckCircle2, Loader2, RefreshCw, AlertCircle, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Invoice } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { useTimeZone } from "@/lib/use-timezone";
import { dateKeyInZone } from "@/lib/timezone";
import { canManageBillingSettings } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuickBooksSettings, useSyncInvoiceToQuickBooks } from "@/features/queries";
import { blockReasonLabel } from "@/components/integrations/quickbooks/labels";

/** Deep-link into a Sales Receipt: must match sandbox vs production Intuit company. */
export function qboSalesReceiptUrl(receiptId: string, useSandbox: boolean): string {
  const host = useSandbox ? "https://app.sandbox.qbo.intuit.com" : "https://app.qbo.intuit.com";
  return `${host}/app/salesreceipt?txnId=${encodeURIComponent(receiptId)}`;
}

/**
 * Desk-facing QuickBooks sync state for a paid invoice. Reads the server's own sync
 * state rather than inferring from error text: a throttle or an unfinished setup is
 * not a failure of THIS invoice, and used to render as a red "Failed" badge.
 */
export function InvoiceQuickBooksSection({ invoice }: { invoice: Invoice }) {
  const { roles } = useAuth();
  const { orgZone, zone } = useTimeZone();
  const isOwner = canManageBillingSettings(roles);
  const sync = useSyncInvoiceToQuickBooks();
  // Owners get useSandbox and setup state from settings; default sandbox-safe while
  // loading so we never open production QBO for a sandbox receipt.
  const qboSettings = useQuickBooksSettings({ enabled: isOwner });
  const useSandbox = qboSettings.data?.useSandbox ?? true;
  const settings = qboSettings.data;

  if (!invoice.paidAt || invoice.voidedAt) return null;
  // Nothing to say on a school that never connected QuickBooks.
  if (isOwner && qboSettings.isSuccess && !settings && !invoice.qboSalesReceiptId) return null;

  const state = invoice.qboSyncState ?? (invoice.qboSalesReceiptId ? "synced" : "pending");
  // Non-owners cannot read the QuickBooks settings, so for them an untouched invoice
  // says nothing useful, and at a school without QuickBooks it would just be noise.
  if (!isOwner && state === "pending" && !invoice.qboSalesReceiptId) return null;
  const removing = state === "unposting";
  const blocked = state === "blocked";
  const handled = state === "handled";
  // A failed REMOVAL is blocked with its receipt still present: it is not "Synced".
  const synced = !!invoice.qboSalesReceiptId && !removing && !blocked && !handled;
  const waiting = state === "deferred" || state === "in_flight";
  // Roughly "paid before the start date": the paid day in the viewer's calendar, which
  // is the school's for everyone at the school. Only used to choose the wording.
  // The paid day in the school's own zone, which is how the server dates a receipt
  // (to within a booking whose airport sits in another zone). Only chooses the wording.
  const paidKey = invoice.paidAt ? dateKeyInZone(invoice.paidAt, orgZone ?? zone) : null;
  const beforeStart = !!settings?.effectiveStartDateKey && !!paidKey && paidKey < settings.effectiveStartDateKey;

  async function onRetry() {
    try {
      const r = await sync.mutateAsync(invoice.id);
      toast.success(r.qboSalesReceiptId ? "Posted to QuickBooks" : (r.message ?? "Queued"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "QuickBooks sync failed");
    }
  }

  // Most specific reason first. Every branch must be TRUE for this invoice: "posts
  // within minutes" on one that never will is how owners lose trust in the sync.
  const setupLeft = (settings?.missingSetup ?? []).filter((s) => s !== "enable");
  // Cash or check: marked paid at the desk here, or in the school's Stripe dashboard.
  const deskPaid = !!invoice.markedAsPaidBy || invoice.paymentMethod === "manual";
  const blockerCode = settings?.blocker?.code;
  const pendingText = !settings
    ? "Posts to QuickBooks once it's connected and set up."
    : settings.status === "needs_reconnect"
      ? "QuickBooks needs reconnecting before anything posts."
      : blockerCode === "books_owned_elsewhere"
        ? "Your QuickBooks setup says these sales reach your books another way, so AerScheduler doesn't post them."
        : setupLeft.length > 0
          ? "Posts once QuickBooks setup is finished."
          : beforeStart
            ? "Paid before your QuickBooks start date, so it isn't posted."
            : invoice.refundedAt
              ? "Partly refunded, so it isn't posted: a receipt for the original amount would overstate income. Record it and the refund in QuickBooks by hand."
              : (invoice.tax ?? 0) > 0
                ? "Carries sales tax, which AerScheduler doesn't post. Record it in QuickBooks by hand."
                : deskPaid && settings.syncDeskPayments !== true
                  ? "Paid at the front desk, and front-desk payments are set not to go to QuickBooks."
                  : !settings.enabled
                    ? "QuickBooks sync is paused. It posts when sync is turned back on."
                    : blockerCode && settings.blocker
                      ? settings.blocker.message
                      : "Queued. It posts within a few minutes.";

  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">QuickBooks</p>
            {removing ? (
              <Badge variant="secondary">Being removed</Badge>
            ) : handled ? (
              <Badge variant="secondary">Handled by hand</Badge>
            ) : synced ? (
              <Badge className="gap-1">
                <CheckCircle2 className="size-3" />
                Synced
              </Badge>
            ) : blocked ? (
              <Badge variant="danger" className="gap-1">
                <AlertCircle className="size-3" />
                {blockReasonLabel(invoice.qboBlockedReason)}
              </Badge>
            ) : waiting ? (
              <Badge variant="secondary" className="gap-1">
                <Clock className="size-3" />
                Retrying
              </Badge>
            ) : (
              <Badge variant="secondary">Not synced</Badge>
            )}
          </div>
          {synced && invoice.qboSyncedAt && (
            <p className="text-sm text-muted-foreground">
              Sales Receipt <span className="font-mono text-foreground">{invoice.qboSalesReceiptId}</span>
              {" · "}
              {formatDistanceToNow(parseISO(invoice.qboSyncedAt), {
                addSuffix: true,
              })}
              {useSandbox ? " · sandbox" : null}
            </p>
          )}
          {blocked && invoice.qboSyncError && <p className="text-sm text-destructive">{invoice.qboSyncError}</p>}
          {waiting && (
            <p className="text-sm text-muted-foreground">The last try didn't go through. It retries on its own.</p>
          )}
          {handled && (
            <p className="text-sm text-muted-foreground">
              Marked as handled in QuickBooks by hand. AerScheduler leaves it alone.
            </p>
          )}
          {!synced && !blocked && !waiting && !removing && !handled && (
            <p className="text-sm text-muted-foreground">{pendingText}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {synced && invoice.qboSalesReceiptId && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={qboSalesReceiptUrl(invoice.qboSalesReceiptId, useSandbox)} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                {useSandbox ? "Open in sandbox" : "Open in QBO"}
              </a>
            </Button>
          )}
          {isOwner && blocked && invoice.qboBlockedReason !== "repaid_after_partial_refund" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={sync.isPending}
              onClick={() => void onRetry()}
            >
              {sync.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Retry
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
