import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import {
  IntegrationPageShell,
  IntegrationSection,
  integrationStatusBadge,
} from "@/components/integrations/integration-shell";
import {
  useDisconnectQuickBooks,
  useQuickBooksActivity,
  useQuickBooksAuthorize,
  useQuickBooksBackfill,
  useQuickBooksItems,
  useQuickBooksSettings,
  useUpdateQuickBooksSettings,
  type QuickBooksSettings,
  type QuickBooksSyncEvent,
} from "@/features/queries";

/**
 * Dedicated QuickBooks Online setup page.
 * Follows the shared IntegrationPageShell section pattern used by future providers.
 */
export function QuickBooksIntegrationPage({
  oauthResult,
}: {
  oauthResult?: string | null;
}) {
  const { roles } = useAuth();
  const isOwner = canManageBillingSettings(roles);

  useEffect(() => {
    if (oauthResult === "connected") {
      toast.success("QuickBooks connected, choose an income item to finish setup");
    } else if (oauthResult === "error") {
      toast.error("QuickBooks connection did not complete");
    }
  }, [oauthResult]);

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
            Only the organization owner can connect accounting integrations, same as Stripe
            Connect. Ask an owner if you need this wired up.
          </p>
        </IntegrationSection>
      </IntegrationPageShell>
    );
  }

  return <QuickBooksOwnerPage />;
}

function SetupSteps({ row }: { row: QuickBooksSettings | null }) {
  const connected =
    !!row && row.status !== "disconnected" && row.status !== "needs_reconnect";
  const mapped = !!row?.incomeItemId;
  const syncing = !!row?.enabled;

  const steps = [
    { key: "connect", label: "Connect", done: connected },
    { key: "map", label: "Map income", done: mapped },
    { key: "sync", label: "Sync on", done: syncing },
  ] as const;

  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground/50">→</span>}
          <span
            className={
              step.done
                ? "inline-flex items-center gap-1 font-medium text-foreground"
                : "inline-flex items-center gap-1 text-muted-foreground"
            }
          >
            {step.done ? (
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <span className="grid size-3.5 place-items-center rounded-full border border-muted-foreground/40 text-[9px] leading-none">
                {i + 1}
              </span>
            )}
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function QuickBooksOwnerPage() {
  const { isDemo } = useAuth();
  const settings = useQuickBooksSettings();
  const items = useQuickBooksItems({
    enabled:
      !!settings.data &&
      settings.data.status !== "needs_reconnect" &&
      settings.data.status !== "disconnected",
  });
  const activity = useQuickBooksActivity({ enabled: !!settings.data });
  const authorize = useQuickBooksAuthorize();
  const disconnect = useDisconnectQuickBooks();
  const update = useUpdateQuickBooksSettings();
  const backfill = useQuickBooksBackfill();
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const row = settings.data;
  const connected = !!row && row.status !== "disconnected";
  const itemOptions = useMemo(() => items.data ?? [], [items.data]);
  const events = activity.data ?? [];

  async function onConnect() {
    try {
      const url = await authorize.mutateAsync();
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start QuickBooks connect");
    }
  }

  async function onSaveItem(itemId: string) {
    const item = itemOptions.find((i) => i.id === itemId);
    setPendingItemId(itemId);
    try {
      await update.mutateAsync({
        incomeItemId: itemId,
        incomeItemName: item?.name ?? null,
      });
      toast.success("Income item saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save mapping");
    } finally {
      setPendingItemId(null);
    }
  }

  async function onToggleSync(enabled: boolean) {
    try {
      await update.mutateAsync({ enabled });
      toast.success(enabled ? "Paid invoices will sync to QuickBooks" : "Sync paused");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update sync");
    }
  }

  async function onDisconnect() {
    if (
      !confirm(
        "Disconnect QuickBooks? Tokens are revoked at Intuit and local credentials are deleted. Paid invoices stop syncing until you reconnect."
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

  async function onBackfill() {
    try {
      const result = await backfill.mutateAsync(25);
      toast.success(
        `Backfill finished: ${result.synced} synced, ${result.failed} failed, ${result.skipped} skipped (${result.attempted} attempted)`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Backfill failed");
    }
  }

  return (
    <IntegrationPageShell
      data-doc-shot="quickbooks-setup"
      icon={BookOpenCheck}
      iconClassName="bg-emerald-600"
      title="QuickBooks Online"
      subtitle="Paid AerScheduler invoices land in your books as Sales Receipts, matched to customers by email, once, with a clear trail here."
      status={
        settings.isLoading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          integrationStatusBadge(row?.status ?? "disconnected")
        )
      }
      accountLabel={
        row?.companyName
          ? `${row.companyName}${row.useSandbox ? " (sandbox)" : ""}`
          : null
      }
      actions={
        connected && row?.status !== "needs_reconnect" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onConnect()}
            disabled={authorize.isPending || isDemo}
          >
            Reauthorize
          </Button>
        ) : null
      }
    >
      <IntegrationSection
        title="Setup"
        description="Connect, map an income item, then turn sync on."
      >
        <SetupSteps row={row ?? null} />
      </IntegrationSection>

      <IntegrationSection
        title="Connection"
        description={
          row?.status === "needs_reconnect"
            ? "Your QuickBooks connection expired. Reconnect to resume syncing."
            : "Link your Intuit company. Owner-only: same bar as Stripe Connect."
        }
      >
        {!connected || row?.status === "needs_reconnect" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {row?.status === "needs_reconnect"
                ? "Reconnect to finish setup and resume Sales Receipt sync."
                : "Connect your Intuit company to start syncing paid flights."}
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
        ) : (
          <p className="text-sm text-muted-foreground">
            Connected{row?.connectedAt ? ` · since ${formatDistanceToNow(parseISO(row.connectedAt), { addSuffix: true })}` : ""}.
            Paid invoices sync when the toggle below is on.
          </p>
        )}
      </IntegrationSection>

      {connected && row?.status !== "needs_reconnect" ? (
        <>
          <IntegrationSection
            title="Configuration"
            description="Income items are your QuickBooks Products & Services. We load them live from the connected company. Every Sales Receipt line posts to the one you pick."
          >
            <div className="space-y-2">
              <Label className="text-sm">Income item (from QuickBooks)</Label>
              <Select
                value={row?.incomeItemId ?? undefined}
                onValueChange={(v) => void onSaveItem(v)}
                disabled={items.isLoading || update.isPending || pendingItemId !== null}
              >
                <SelectTrigger className="max-w-lg">
                  <SelectValue
                    placeholder={
                      items.isLoading
                        ? "Loading Products & Services from QuickBooks…"
                        : itemOptions.length === 0
                          ? "No active items in QuickBooks: create one there first"
                          : "Select a Product/Service"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {itemOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.type ? ` · ${item.type}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex max-w-lg items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Sync paid invoices</p>
                <p className="text-xs text-muted-foreground">
                  Soft-fails if QuickBooks is down. Stripe payments still succeed.
                </p>
              </div>
              <Switch
                checked={!!row?.enabled}
                disabled={!row?.incomeItemId || update.isPending}
                onCheckedChange={(v) => void onToggleSync(v)}
              />
            </div>

            {row?.lastError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Last error: {row.lastError}
                {row.lastErrorAt && (
                  <span className="text-destructive/80">
                    {" "}
                    · {formatDistanceToNow(parseISO(row.lastErrorAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            )}
          </IntegrationSection>

          <IntegrationSection
            title="Activity"
            description="Every sync attempt lands here, success, skip, or failure."
            footer={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void onBackfill()}
                  disabled={!row?.enabled || backfill.isPending}
                >
                  {backfill.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Sync past paid invoices
                </Button>
                {row?.lastSyncAt && (
                  <span className="self-center text-xs text-muted-foreground">
                    Last success{" "}
                    {formatDistanceToNow(parseISO(row.lastSyncAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            }
          >
            {activity.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading activity…</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sync activity yet. Pay an invoice or run a backfill to see events here.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {events.map((ev) => (
                  <ActivityRow key={ev.id} event={ev} />
                ))}
              </ul>
            )}
          </IntegrationSection>

          <IntegrationSection
            title="Disconnect"
            description="Revokes tokens at Intuit and clears local credentials."
          >
            <Button
              variant="outline"
              className="gap-1.5 text-destructive"
              onClick={() => void onDisconnect()}
              disabled={disconnect.isPending}
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

function ActivityRow({ event }: { event: QuickBooksSyncEvent }) {
  const tone =
    event.status === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : event.status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className={`font-medium capitalize ${tone}`}>{event.status}</p>
        <p className="truncate text-muted-foreground">
          {event.message || "–"}
          {event.invoiceId != null && (
            <span className="text-foreground/80"> · Invoice #{event.invoiceId}</span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <div>{formatDistanceToNow(parseISO(event.createdAt), { addSuffix: true })}</div>
        <div className="capitalize">{event.triggeredBy}</div>
      </div>
    </li>
  );
}
