import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useDisconnectStripe, useStripeDisconnectCheck, type OpenStripeInvoice } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/utils";
import { ExplainedButton } from "@/components/explained-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** How many open invoices the hover card names before pointing at the full list. */
const LISTED = 5;

/**
 * Disconnect the organization's Stripe account, so it can connect a different one. Owner
 * only, beside Connect payouts. Asked for by an organization whose account Stripe rejected
 * and that had no way out short of emailing support.
 *
 * The server refuses while any Stripe invoice is still open (it could never be voided or
 * marked paid once the account is gone), so the button is disabled with the list instead
 * of pressed into that refusal. What survives and what is cleared is
 * server/src/services/stripeConnectDisconnect.ts.
 */
export function StripeDisconnect() {
  const { organization } = useAuth();
  const check = useStripeDisconnectCheck();
  const disconnect = useDisconnectStripe();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const name = organization?.name?.trim() || "this organization";
  const matches = typed.trim().toLowerCase() === name.toLowerCase();
  const data = check.data?.connected ? check.data : null;
  if (!data) return null;

  const blocked = data.openInvoiceCount > 0;

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function confirm() {
    setError(null);
    try {
      await disconnect.mutateAsync();
      toast.success("Stripe disconnected. Connect payouts to set up the new account.");
      close(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't disconnect Stripe. Try again.");
    }
  }

  return (
    <>
      <ExplainedButton
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={blocked || disconnect.isPending}
        onClick={() => setOpen(true)}
        summary={blocked ? openInvoicesSentence(data.openInvoiceCount) : undefined}
        explain={blocked ? <OpenInvoicesNote count={data.openInvoiceCount} invoices={data.openInvoices} /> : undefined}
        data-testid="billing-stripe-disconnect"
      >
        <Unplug className="size-4" />
        Disconnect Stripe
      </ExplainedButton>

      <AlertDialog open={open} onOpenChange={close}>
        <AlertDialogContent data-doc-shot="billing-stripe-disconnect-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Stripe?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody can pay by card or bank until you connect another Stripe account. Then
              choose Connect payouts to set it up.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Your rates, fees, billing settings and member balances stay as they are.</li>
            {data.invoicesEachBooking && (
              <li>
                Flights closed out before the new account is ready aren&apos;t invoiced. They wait
                under Unbilled reservations in Billing.
              </li>
            )}
            {data.membersWithCustomer > 0 && (
              <li>
                Saved cards {data.membersOnAutopay > 0 ? "and autopay " : ""}are cleared for{" "}
                {data.membersWithCustomer} member{data.membersWithCustomer === 1 ? "" : "s"}. They add a
                card again once the new account is connected.
              </li>
            )}
            <li>
              Refunds, disputes and bank payments already on this account still reach
              AerScheduler.
            </li>
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="stripe-disconnect-confirm">
              Type <span className="font-medium text-foreground">{name}</span> to confirm
            </Label>
            <Input
              id="stripe-disconnect-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={name}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!matches || disconnect.isPending}
              onClick={(e) => {
                //Kept open until the request settles, so a refusal (an invoice opened since
                //the button was enabled) shows here instead of vanishing with the dialog.
                e.preventDefault();
                void confirm();
              }}
            >
              {disconnect.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Disconnecting…
                </>
              ) : (
                "Disconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function openInvoicesSentence(count: number) {
  return `${count} unpaid invoice${count === 1 ? " is" : "s are"} still open on this Stripe account. Collect, mark paid or void ${count === 1 ? "it" : "them"} first.`;
}

function OpenInvoicesNote({ count, invoices }: { count: number; invoices: OpenStripeInvoice[] }) {
  return (
    <div className="space-y-2" data-testid="billing-stripe-disconnect-blocked">
      <p className="font-medium text-foreground">{openInvoicesSentence(count)}</p>
      <p className="text-muted-foreground">
        Once the account is disconnected, an invoice left open on it can&apos;t be voided or marked
        paid from AerScheduler.
      </p>
      <ul className="space-y-1">
        {invoices.slice(0, LISTED).map((inv) => (
          <li key={inv.id} className="flex items-baseline justify-between gap-3">
            <Link
              to="/billing"
              search={{ pane: "invoices", invoice: inv.id }}
              className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
            >
              {inv.payerName}
              {inv.processing ? ", payment processing" : ""}
            </Link>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(inv.totalCents)}</span>
          </li>
        ))}
      </ul>
      {count > LISTED && (
        <Link
          to="/billing"
          search={{ pane: "invoices" }}
          className="text-primary underline-offset-4 hover:underline"
        >
          See all {count} in Billing
        </Link>
      )}
    </div>
  );
}
