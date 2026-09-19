import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  ExternalLink,
  History,
  LayoutDashboard,
  Link2,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { FlowBenefits } from "@/components/onboarding/flows/flow-shell";
import {
  IntegrationPageHeader,
  IntegrationPageShell,
  integrationStatusBadge,
} from "@/components/integrations/integration-shell";
import { TableView } from "@/components/table-view";
import {
  useCancelQuickBooksRemovals,
  useQuickBooksAuthorize,
  useQuickBooksOverview,
  useQuickBooksSettings,
  type QuickBooksSetupStep,
} from "@/features/queries";
import { QuickBooksSetupFlow } from "@/components/integrations/quickbooks/setup-flow";
import { QuickBooksOverviewPane } from "@/components/integrations/quickbooks/overview";
import { QuickBooksNeedsAttentionPane } from "@/components/integrations/quickbooks/attention";
import { QuickBooksActivityPane } from "@/components/integrations/quickbooks/activity";
import { QuickBooksAnswersPane } from "@/components/integrations/quickbooks/answers";
import { QuickBooksConnectionPane } from "@/components/integrations/quickbooks/connection";
import { QBO_TABS, type QuickBooksTab } from "@/components/integrations/quickbooks/labels";

/** Why the server refused a connect (its CallbackRefusal codes), in words. */
const CONNECT_REFUSALS: Record<string, string> = {
  browser:
    "That QuickBooks approval was started in a different browser, so it was not accepted. Click Connect QuickBooks here and approve it in this browser.",
  removing:
    "Receipts are still being removed from the company that is connected now. Let that finish, or stop it, before connecting a different company.",
  demo: "Connecting a real QuickBooks company isn't available in the demo.",
  denied: "QuickBooks connection was cancelled at Intuit.",
};

function sections(attention: number): RailSection[] {
  return [
    {
      items: [
        { value: "overview", label: "Overview", icon: LayoutDashboard },
        {
          value: "attention",
          label: attention > 0 ? `Needs attention (${attention.toLocaleString()})` : "Needs attention",
          icon: AlertCircle,
        },
        { value: "activity", label: "Activity", icon: History },
        { value: "settings", label: "Settings", icon: Settings2 },
        { value: "connection", label: "Connection", icon: Link2 },
      ],
    },
  ];
}

/**
 * QuickBooks Online, owner-only. Not connected: one card and a Connect button.
 * Connected: the Settings rail's layout, one section at a time, with setup as a
 * guided flow rather than a page of open forms.
 *
 * Connecting only READS the company. Nothing is written to QuickBooks until every
 * setup answer is given, because the costly failure is posting revenue a school already
 * records some other way. The server enforces the same rule (integrations/quickbooks/policy.ts).
 */
export function QuickBooksIntegrationPage({
  oauthResult,
  oauthReason,
  tab,
  onTab,
}: {
  oauthResult?: string | null;
  oauthReason?: string | null;
  tab?: string;
  onTab: (tab: QuickBooksTab) => void;
}) {
  const { roles } = useAuth();
  const isOwner = canManageBillingSettings(roles);

  useEffect(() => {
    if (oauthResult === "connected") {
      toast.success("QuickBooks connected. Answer a few questions to finish setting it up.");
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
        subtitle="Paid invoices post to your books as Sales Receipts."
        status={integrationStatusBadge("disconnected")}
      >
        <Card>
          <CardHeader>
            <CardTitle>Owner only</CardTitle>
            <CardDescription>Only an owner can connect QuickBooks. Ask an owner to set it up.</CardDescription>
          </CardHeader>
        </Card>
      </IntegrationPageShell>
    );
  }

  return <OwnerPage tab={tab} onTab={onTab} />;
}

function OwnerPage({ tab, onTab }: { tab?: string; onTab: (tab: QuickBooksTab) => void }) {
  const { isDemo } = useAuth();
  const settings = useQuickBooksSettings();
  const row = settings.data ?? null;
  const connected = !!row && row.status !== "disconnected";
  const overview = useQuickBooksOverview({ enabled: connected, refetchInterval: 15_000 });
  const authorize = useQuickBooksAuthorize();
  const cancelRemovals = useCancelQuickBooksRemovals();
  const [flow, setFlow] = useState<{ open: boolean; only: QuickBooksSetupStep | null }>({ open: false, only: null });

  const removing = overview.data?.removing ?? 0;
  const attention = overview.data?.blockedCount ?? 0;
  const active: QuickBooksTab = (QBO_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as QuickBooksTab)
    : "overview";

  async function onConnect() {
    try {
      const url = await authorize.mutateAsync();
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start QuickBooks connect");
    }
  }

  async function onStopRemoving() {
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

  const shellProps = {
    icon: BookOpenCheck,
    iconClassName: "bg-emerald-600",
    title: "QuickBooks Online",
    subtitle: "Paid invoices post to your books as Sales Receipts, matched to customers by email.",
    status: settings.isLoading ? (
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    ) : (
      integrationStatusBadge(row?.status ?? "disconnected")
    ),
    accountLabel: row?.companyName ? `${row.companyName}${row.useSandbox ? " (sandbox)" : ""}` : null,
  };

  if (!row || !connected) {
    return (
      <IntegrationPageShell {...shellProps} data-doc-shot="quickbooks-setup">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Connect QuickBooks</CardTitle>
            <CardDescription>
              Sign in with Intuit and pick your company. It takes a few minutes, start to finish.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FlowBenefits
              items={[
                "Connecting only reads your company. Nothing is sent to QuickBooks yet.",
                "A few questions set which invoices are posted and where the money lands, so nothing is counted twice.",
                "Once you turn it on, every paid invoice becomes a Sales Receipt on its own.",
              ]}
            />
            <Button
              onClick={() => void onConnect()}
              disabled={authorize.isPending || isDemo}
              title={isDemo ? "Connecting a real account isn't available in the demo" : undefined}
            >
              {authorize.isPending ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
              Connect QuickBooks
            </Button>
          </CardContent>
        </Card>
      </IntegrationPageShell>
    );
  }

  // Laid out like Maintenance: header pinned, the rail beside one pane, and the two
  // tables (Needs attention, Activity) filling the height and scrolling their own rows.
  // The other sections scroll inside a TableView.Body the same way.
  return (
    <TableView className="gap-5" data-doc-shot="quickbooks-setup">
      <TableView.Header>
        <IntegrationPageHeader {...shellProps} />
        {row.status === "needs_reconnect" ? (
          <Card>
            <CardHeader className="flex-row flex-wrap items-center gap-3">
              <div className="min-w-[14rem] flex-1">
                <CardTitle>Reconnect QuickBooks</CardTitle>
                <CardDescription>
                  Your QuickBooks connection expired, so nothing is posted until you reconnect. Reconnecting the same
                  company keeps your setup answers.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => void onConnect()} disabled={authorize.isPending || isDemo}>
                {authorize.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                Reconnect
              </Button>
            </CardHeader>
          </Card>
        ) : null}
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail
          label="QuickBooks"
          sections={sections(attention)}
          value={active}
          onChange={(v) => onTab(v as QuickBooksTab)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {active === "overview" && (
            <TableView.Body>
              <QuickBooksOverviewPane
                row={row}
                overview={overview.data ?? undefined}
                onContinueSetup={() => setFlow({ open: true, only: null })}
                onStopRemoving={() => void onStopRemoving()}
                stopping={cancelRemovals.isPending}
              />
            </TableView.Body>
          )}
          {active === "attention" && <QuickBooksNeedsAttentionPane />}
          {active === "activity" && <QuickBooksActivityPane />}
          {active === "settings" && (
            <TableView.Body>
              <QuickBooksAnswersPane row={row} onChange={(step) => setFlow({ open: true, only: step })} />
            </TableView.Body>
          )}
          {active === "connection" && (
            <TableView.Body>
              <QuickBooksConnectionPane
                row={row}
                overview={overview.data ?? undefined}
                onReconnect={() => void onConnect()}
                reconnecting={authorize.isPending || isDemo}
                onStopRemoving={() => void onStopRemoving()}
                stopping={cancelRemovals.isPending}
              />
            </TableView.Body>
          )}
        </div>
      </div>

      <QuickBooksSetupFlow
        row={row}
        open={flow.open}
        only={flow.only}
        onOpenChange={(open) => setFlow((f) => ({ ...f, open }))}
        onReconnect={() => void onConnect()}
        reconnectDisabled={authorize.isPending || isDemo || removing > 0}
      />
    </TableView>
  );
}
