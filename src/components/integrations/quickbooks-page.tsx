import { useEffect } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { BookOpenCheck, ExternalLink, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import {
  IntegrationPageShell,
  IntegrationSection,
  integrationStatusBadge,
} from "@/components/integrations/integration-shell";
import {
  useCancelQuickBooksRemovals,
  useDisconnectQuickBooks,
  useQuickBooksActivity,
  useQuickBooksAuthorize,
  useQuickBooksOverview,
  useQuickBooksSettings,
} from "@/features/queries";
import { QuickBooksSetup } from "@/components/integrations/quickbooks/setup";
import {
  QuickBooksActivity,
  QuickBooksNeedsAttention,
  QuickBooksRemoveReceipts,
  QuickBooksSyncStatus,
} from "@/components/integrations/quickbooks/status";

/**
 * Dedicated QuickBooks Online setup page.
 * Follows the shared IntegrationPageShell section pattern used by future providers.
 *
 * Connecting only READS the company. Nothing is written to QuickBooks until every setup
 * question is answered, because the costly failure is posting revenue a school already
 * records some other way. The server enforces the same rule (integrations/quickbooks/policy.ts).
 */
/** Why the server refused a connect (its CallbackRefusal codes), in words. */
const CONNECT_REFUSALS: Record<string, string> = {
  browser:
    "That QuickBooks approval was started in a different browser, so it was not accepted. Click Connect QuickBooks here and approve it in this browser.",
  removing:
    "Receipts are still being removed from the company that is connected now. Let that finish, or stop it, before connecting a different company.",
  demo: "Connecting a real QuickBooks company isn't available in the demo.",
  denied: "QuickBooks connection was cancelled at Intuit.",
};

export function QuickBooksIntegrationPage({
  oauthResult,
  oauthReason,
}: {
  oauthResult?: string | null;
  oauthReason?: string | null;
}) {
  const { roles } = useAuth();
  const isOwner = canManageBillingSettings(roles);

  useEffect(() => {
    if (oauthResult === "connected") {
      toast.success("QuickBooks connected. Nothing is sent until you finish the steps below.");
    } else if (oauthResult === "error") {
      toast.error((oauthReason && CONNECT_REFUSALS[oauthReason]) || "QuickBooks connection did not complete");
    }
  }, [oauthResult, oauthReason]);

  if (!isOwner) {
    return (
      <IntegrationPageShell
        icon={BookOpenCheck}
        iconClassName="bg-emerald-600"
        title="QuickBooks Online"
        subtitle="Paid AerScheduler invoices land in your books as Sales Receipts."
        status={integrationStatusBadge("disconnected")}
      >
        <IntegrationSection title="Owner required">
          <p className="text-sm text-muted-foreground">
            Only the organization owner can connect accounting integrations, same as Stripe Connect. Ask an owner if you
            need this wired up.
          </p>
        </IntegrationSection>
      </IntegrationPageShell>
    );
  }

  return <QuickBooksOwnerPage />;
}

function QuickBooksOwnerPage() {
  const { isDemo } = useAuth();
  const settings = useQuickBooksSettings();
  const row = settings.data ?? null;
  const connected = !!row && row.status !== "disconnected";
  const live = connected && row.status !== "needs_reconnect";

  const overview = useQuickBooksOverview({
    // Also while the connection has lapsed: queued removals must stay visible (and
    // stoppable) then, since they cannot run until it is reconnected.
    enabled: connected,
    // Poll while the background worker has something to do, so progress moves on its own.
    refetchInterval: 15_000,
  });
  const activity = useQuickBooksActivity({ enabled: connected });
  const authorize = useQuickBooksAuthorize();
  const disconnect = useDisconnectQuickBooks();
  const cancelRemovals = useCancelQuickBooksRemovals();

  async function onStopRemoving() {
    if (
      !confirm(
        "Stop removing? Receipts you asked to remove stay in QuickBooks, recorded as posted. Refunded ones, and any an unanswered try may have left, move to Needs attention to finish by hand.",
      )
    ) {
      return;
    }
    try {
      const r = await cancelRemovals.mutateAsync();
      toast.success(
        `Stopped ${r.cancelled} removal${r.cancelled === 1 ? "" : "s"}.${
          r.needsAttention ? ` ${r.needsAttention} moved to Needs attention.` : ""
        }`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not stop the removals");
    }
  }

  async function onConnect() {
    try {
      const url = await authorize.mutateAsync();
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start QuickBooks connect");
    }
  }

  async function onDisconnect() {
    if (
      !confirm(
        "Disconnect QuickBooks? Access is revoked at Intuit and new payments stop syncing. Receipts already in QuickBooks stay there.",
      )
    ) {
      return;
    }
    try {
      await disconnect.mutateAsync();
      toast.success("QuickBooks disconnected");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not disconnect");
    }
  }

  const setupDone = !!row && (row.missingSetup ?? []).length === 0;
  const removing = overview.data?.removing ?? 0;

  return (
    <IntegrationPageShell
      data-doc-shot="quickbooks-setup"
      icon={BookOpenCheck}
      iconClassName="bg-emerald-600"
      title="QuickBooks Online"
      subtitle="Paid AerScheduler invoices land in your books as Sales Receipts, matched to customers by email, with a clear trail here."
      status={
        settings.isLoading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          integrationStatusBadge(row?.status ?? "disconnected")
        )
      }
      accountLabel={row?.companyName ? `${row.companyName}${row.useSandbox ? " (sandbox)" : ""}` : null}
    >
      {!live ? (
        <IntegrationSection
          title="Connection"
          description={
            row?.status === "needs_reconnect"
              ? "Your QuickBooks connection expired. Reconnect to resume syncing."
              : "Link your Intuit company. Owner-only: same bar as Stripe Connect."
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {row?.status === "needs_reconnect"
                ? "Reconnect to the same company to pick up where you left off."
                : "Connecting only reads your company. Nothing is sent to QuickBooks until you finish setup."}
            </p>
            <Button
              onClick={() => void onConnect()}
              disabled={authorize.isPending || isDemo}
              className="gap-2"
              title={isDemo ? "Connecting a real account isn't available in the demo" : undefined}
            >
              {authorize.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4 opacity-80" />
              )}
              {row?.status === "needs_reconnect" ? "Reconnect QuickBooks" : "Connect QuickBooks"}
            </Button>
          </div>
        </IntegrationSection>
      ) : null}

      {live && row ? (
        <>
          <IntegrationSection
            title={setupDone ? "Settings" : "Finish setup"}
            description={
              setupDone
                ? "Change any answer at any time. Changes apply to receipts posted from now on."
                : "Seven questions only you can answer. Nothing is sent to QuickBooks until every one is done."
            }
          >
            {removing > 0 ? (
              <div className="flex flex-col gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-950/40 dark:text-amber-200">
                <p>
                  {removing.toLocaleString()} receipt
                  {removing === 1 ? " is" : "s are"} still being removed from {row.companyName ?? "QuickBooks"}.
                  Connecting a different company or disconnecting waits until that finishes, or until you stop it.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={cancelRemovals.isPending}
                  onClick={() => void onStopRemoving()}
                >
                  Stop removing
                </Button>
              </div>
            ) : null}
            <QuickBooksSetup
              row={row}
              onReconnect={() => void onConnect()}
              reconnectDisabled={authorize.isPending || isDemo || removing > 0}
            />
          </IntegrationSection>

          {overview.data ? (
            <>
              <IntegrationSection
                title="Sync status"
                description={
                  row.connectedAt
                    ? `Connected ${formatDistanceToNow(parseISO(row.connectedAt), { addSuffix: true })}.${
                        row.lastSyncAt
                          ? ` Last posted ${formatDistanceToNow(parseISO(row.lastSyncAt), { addSuffix: true })}.`
                          : ""
                      }`
                    : undefined
                }
              >
                <QuickBooksSyncStatus row={row} overview={overview.data} />
              </IntegrationSection>

              <IntegrationSection
                title="Needs attention"
                description="Invoices that can't be posted until something is fixed. Each one says what."
              >
                <QuickBooksNeedsAttention overview={overview.data} />
              </IntegrationSection>
            </>
          ) : null}

          <IntegrationSection title="Activity" description="Every post, removal, and problem, newest first.">
            <QuickBooksActivity events={activity.data ?? []} loading={activity.isLoading} />
          </IntegrationSection>

          {overview.data ? (
            <IntegrationSection title="Undo" description="Take receipts AerScheduler posted back out of QuickBooks.">
              <QuickBooksRemoveReceipts row={row} overview={overview.data} />
            </IntegrationSection>
          ) : null}

          <IntegrationSection
            title="Disconnect"
            description="Revokes access at Intuit. Receipts already posted stay in QuickBooks."
          >
            <Button
              variant="outline"
              className="gap-1.5 text-destructive"
              onClick={() => void onDisconnect()}
              disabled={disconnect.isPending || removing > 0}
            >
              <Unplug className="size-3.5" />
              Disconnect QuickBooks
            </Button>
          </IntegrationSection>
        </>
      ) : null}

      {connected && row?.status === "needs_reconnect" ? (
        <>
          {removing > 0 ? (
            <IntegrationSection title="Removals waiting" description="These can't run until QuickBooks is reconnected.">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {removing.toLocaleString()} receipt
                  {removing === 1 ? " is" : "s are"} queued for removal from {row.companyName ?? "QuickBooks"}.
                  Reconnect to finish, or stop them to disconnect instead.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={cancelRemovals.isPending}
                  onClick={() => void onStopRemoving()}
                >
                  Stop removing
                </Button>
              </div>
            </IntegrationSection>
          ) : null}
          {overview.data && overview.data.blocked.length > 0 ? (
            <IntegrationSection
              title="Needs attention"
              description="Invoices that can't be posted until something is fixed. Each one says what."
            >
              <QuickBooksNeedsAttention overview={overview.data} />
            </IntegrationSection>
          ) : null}
          <IntegrationSection title="Activity" description="Every post, removal, and problem, newest first.">
            <QuickBooksActivity events={activity.data ?? []} loading={activity.isLoading} />
          </IntegrationSection>
          <IntegrationSection title="Disconnect" description="Receipts already posted stay in QuickBooks.">
            <Button
              variant="outline"
              className="gap-1.5 text-destructive"
              onClick={() => void onDisconnect()}
              disabled={disconnect.isPending || removing > 0}
            >
              <Unplug className="size-3.5" />
              Disconnect QuickBooks
            </Button>
          </IntegrationSection>
        </>
      ) : null}
    </IntegrationPageShell>
  );
}
