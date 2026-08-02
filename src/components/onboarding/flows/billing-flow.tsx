/**
 * Connect billing — why → Stripe → QuickBooks.
 *
 * Replaces a link to Settings → Billing, which for a new school was both the wrong
 * page (it errors until Connect exists, since the billing row is created lazily) and
 * the wrong shape (rates and service fees are not what "connect billing" means).
 *
 * Stripe onboarding leaves our origin entirely, so this flow cannot watch the user
 * finish it. It hands off, and the checklist tells the truth when they come back:
 * `stripeEnabled` is set by Stripe's `account.updated` webhook, so the item ticks on
 * its own. Step 3 is therefore only reachable when they return already connected.
 */

import * as React from "react";
import { CreditCard, ExternalLink, Loader2, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { useBilling, useConnectStripe, useQuickBooksAuthorize, useQuickBooksSettings } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  FlowBenefits,
  FlowClose,
  FlowDone,
  FlowModal,
  FlowNav,
  type FlowProps,
} from "./flow-shell";

export function BillingFlow({ onClose }: FlowProps) {
  const billing = useBilling();
  const quickBooks = useQuickBooksSettings();
  const connect = useConnectStripe();
  const authorizeQb = useQuickBooksAuthorize();

  const stripeConnected = Boolean(billing.data?.stripeEnabled);
  const qbConnected = quickBooks.data?.status === "connected";

  // Someone who already has Stripe opens straight on the QuickBooks step — the "why"
  // pitch is for people who haven't decided yet.
  const [step, setStep] = React.useState(stripeConnected ? 2 : 0);

  async function startStripe() {
    try {
      const { url } = await connect.mutateAsync();
      if (!url) throw new Error("No onboarding URL returned");
      window.location.assign(url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start Stripe onboarding");
    }
  }

  async function startQuickBooks() {
    try {
      const url = await authorizeQb.mutateAsync();
      if (!url) throw new Error("No authorize URL returned");
      window.location.assign(url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start QuickBooks");
    }
  }

  const footer =
    step === 0 ? (
      <FlowNav onNext={() => setStep(1)} onSkip={onClose} skipLabel="Not now" />
    ) : step === 1 ? (
      <FlowNav onBack={() => setStep(0)} onSkip={onClose} skipLabel="I'll do this later" />
    ) : qbConnected ? (
      <FlowClose onClose={onClose} />
    ) : (
      <FlowNav onSkip={onClose} skipLabel="Skip for now" />
    );

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Connect billing"
      description="Three screens, and the last one is optional."
      step={step}
      stepCount={3}
      footer={footer}
    >
      {step === 0 && (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Connecting Stripe is what turns a finished flight into money in your account.
          </p>
          <FlowBenefits
            items={[
              "Invoice students and renters automatically at close-out",
              "Collect card and ACH payments, with autopay if they want it",
              "Sync every invoice to QuickBooks",
              "Payouts go straight to your own bank — we never hold your money",
            ]}
          />
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="size-4.5" />
              </span>
              <div className="min-w-0 text-sm">
                <div className="font-medium">Connect your Stripe account</div>
                <p className="mt-0.5 text-muted-foreground">
                  Stripe will ask for your business details and bank account. It takes a few
                  minutes, and you can come back and finish later — we&rsquo;ll pick up where you
                  left off.
                </p>
              </div>
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={startStripe} disabled={connect.isPending}>
            {connect.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ExternalLink className="size-4" />
            )}
            Connect Stripe
          </Button>
        </div>
      )}

      {step === 2 &&
        (qbConnected ? (
          <FlowDone
            headline="Billing is connected."
            body="Stripe and QuickBooks are both live. Close-outs will invoice, collect, and land in your books."
          />
        ) : (
          <div>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Puzzle className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="font-medium">
                  {stripeConnected ? "Stripe is connected." : "One more thing"}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Want to connect QuickBooks too? Every invoice you send lands in your books
                  automatically, so month-end doesn&rsquo;t mean re-keying anything.
                </p>
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={startQuickBooks}
              disabled={authorizeQb.isPending}
            >
              {authorizeQb.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Connect QuickBooks
            </Button>
          </div>
        ))}
    </FlowModal>
  );
}
