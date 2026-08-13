/**
 * Connect billing: why → how members pay → Stripe → QuickBooks.
 *
 * Replaces a link to Settings → Billing, which for a new school was both the wrong
 * page (it errors until Connect exists, since the billing row is created lazily) and
 * the wrong shape (rates and service fees are not what "connect billing" means).
 *
 * Stripe onboarding leaves our origin entirely, so this flow cannot watch the user
 * finish it. It hands off, and the checklist tells the truth when they come back:
 * `stripeEnabled` is set by Stripe's `account.updated` webhook, so the item ticks on
 * its own. The QuickBooks step is therefore only reachable when they return already
 * connected (or they skipped ahead somehow).
 *
 * "How members pay" is a real choice (invoice default vs ledger), saved before Stripe
 * so the school isn't surprised later in Settings.
 */

import * as React from "react";
import { CreditCard, ExternalLink, Loader2, Puzzle } from "lucide-react";
import { toast } from "sonner";
import {
  useBilling,
  useConnectStripe,
  useOrgLedgerSettings,
  useQuickBooksAuthorize,
  useQuickBooksSettings,
  useUpdateOrgLedgerSettings,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  BillingModeCards,
  type BillingMode,
} from "@/components/billing/billing-mode-choice";
import { DocsHint } from "@/components/docs-hint";
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
  const { isDemo } = useAuth();
  const billing = useBilling();
  const ledger = useOrgLedgerSettings();
  const quickBooks = useQuickBooksSettings();
  const connect = useConnectStripe();
  const authorizeQb = useQuickBooksAuthorize();
  const updateLedger = useUpdateOrgLedgerSettings();

  const stripeConnected = Boolean(billing.data?.stripeEnabled);
  const qbConnected = quickBooks.data?.status === "connected";
  const savedMode: BillingMode = ledger.data?.enabled === true ? "ledger" : "invoice";

  // Someone who already has Stripe opens on QuickBooks; the pitch + mode pick are for
  // people who haven't finished Connect yet.
  const [step, setStep] = React.useState(stripeConnected ? 3 : 0);
  const [mode, setMode] = React.useState<BillingMode>(savedMode);
  const [savingMode, setSavingMode] = React.useState(false);

  React.useEffect(() => {
    setMode(savedMode);
  }, [savedMode]);

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

  async function saveModeAndContinue() {
    if (mode === savedMode) {
      setStep(2);
      return;
    }
    setSavingMode(true);
    updateLedger.mutate(
      { enabled: mode === "ledger" },
      {
        onSuccess: () => {
          toast.success(
            mode === "ledger"
              ? "Account ledger selected. You can change this later in Settings"
              : "Invoice billing selected. You can change this later in Settings"
          );
          setStep(2);
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Couldn't save billing mode");
        },
        onSettled: () => setSavingMode(false),
      }
    );
  }

  const footer =
    step === 0 ? (
      <FlowNav onNext={() => setStep(1)} onSkip={onClose} skipLabel="Not now" />
    ) : step === 1 ? (
      <FlowNav
        onBack={() => setStep(0)}
        onNext={() => void saveModeAndContinue()}
        nextLabel={savingMode ? "Saving…" : "Continue"}
        nextDisabled={savingMode || ledger.isLoading}
        onSkip={onClose}
        skipLabel="I'll do this later"
      />
    ) : step === 2 ? (
      <FlowNav onBack={() => setStep(1)} onSkip={onClose} skipLabel="I'll do this later" />
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
      description="Four screens. QuickBooks is optional."
      step={step}
      stepCount={4}
      size={step === 1 ? "lg" : "md"}
      footer={footer}
    >
      {step === 0 && (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Connecting Stripe is what turns a finished flight into money in your account.
          </p>
          <FlowBenefits
            items={[
              "Bill members with invoices per booking, or with an account ledger",
              "Collect card and ACH payments, with autopay if they want it",
              "Sync money to QuickBooks when you're ready",
              "Payouts go straight to your own bank. We never hold your money",
            ]}
          />
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            How members pay
            <DocsHint topic="how-members-pay" />
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Most schools invoice each booking (flights, sims, ground, and fees). Ledger is
            for prepaid / house-account style billing. Guests always get a pay-this-visit
            invoice. You can change this later in Settings → Billing.
          </p>
          <BillingModeCards
            value={mode}
            onChange={setMode}
            disabled={savingMode || isDemo}
          />
        </div>
      )}

      {step === 2 && (
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
                  minutes, and you can come back and finish later, we&rsquo;ll pick up where you
                  left off.
                </p>
              </div>
            </div>
          </div>
          <Button
            className="mt-4 w-full"
            onClick={startStripe}
            disabled={connect.isPending || isDemo}
          >
            {connect.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ExternalLink className="size-4" />
            )}
            Connect Stripe
          </Button>
          {isDemo && <DemoConnectNote />}
        </div>
      )}

      {step === 3 &&
        (qbConnected ? (
          <FlowDone
            headline="Billing is connected."
            body="Stripe and QuickBooks are both live. Close-outs will bill, collect, and land in your books."
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
                  Want to connect QuickBooks too? Paid activity lands in your books
                  automatically, so month-end doesn&rsquo;t mean re-keying anything.
                </p>
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              variant="outline"
              onClick={startQuickBooks}
              disabled={authorizeQb.isPending || isDemo}
            >
              {authorizeQb.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Connect QuickBooks
            </Button>
            {isDemo && <DemoConnectNote />}
          </div>
        ))}
    </FlowModal>
  );
}

/** Why a connect button is inert in the demo, the demo never links a real
 *  third-party account (Stripe/QuickBooks) to a sandbox that resets. */
function DemoConnectNote() {
  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      Connecting a real account isn&rsquo;t available in the demo.
    </p>
  );
}
