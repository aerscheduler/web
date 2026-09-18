import { formatDistanceToNow, parseISO } from "date-fns";
import { AlertCircle, CalendarClock, CheckCircle2, Clock, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PreferenceToggle, ReadOnlyRow } from "@/components/settings/parts";
import { StatCard, StatGrid } from "@/components/stat-card";
import { useUpdateQuickBooksSettings, type QuickBooksOverview, type QuickBooksSettings } from "@/features/queries";
import { formatDateKey, SETUP_ORDER, STEP_LABELS } from "./labels";
import { Note } from "./setup-flow";

/**
 * The first section: is it set up, is it on, and where do things stand. Everything
 * here is a summary with a way through to where it is handled; nothing is edited here
 * except the one switch an owner reaches for most, pausing sync.
 */
export function QuickBooksOverviewPane({
  row,
  overview,
  onContinueSetup,
  onStopRemoving,
  stopping,
}: {
  row: QuickBooksSettings;
  overview: QuickBooksOverview | undefined;
  onContinueSetup: () => void;
  onStopRemoving: () => void;
  stopping: boolean;
}) {
  const missing = new Set(row.missingSetup ?? []);
  const setupDone = [...missing].every((s) => s === "enable");
  const removing = overview?.removing ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {!setupDone ? <SetupCard row={row} onContinue={onContinueSetup} /> : null}

      {removing > 0 ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center gap-3">
            <div className="min-w-[14rem] flex-1">
              <CardTitle>Removing receipts</CardTitle>
              <CardDescription>
                {removing.toLocaleString()} receipt{removing === 1 ? " is" : "s are"} still being removed from{" "}
                {row.companyName ?? "QuickBooks"}. Connecting a different company or disconnecting waits until this
                finishes.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onStopRemoving} disabled={stopping}>
              {stopping ? <Loader2 className="size-4 animate-spin" /> : null}
              Stop removing
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      {setupDone ? <SyncCard row={row} overview={overview} /> : null}

      {overview ? <Stats row={row} overview={overview} /> : null}
    </div>
  );
}

function SetupCard({ row, onContinue }: { row: QuickBooksSettings; onContinue: () => void }) {
  const missing = new Set(row.missingSetup ?? []);
  const questions = SETUP_ORDER.filter((s) => s !== "enable");
  const answered = questions.filter((s) => !missing.has(s)).length;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <CardTitle>Finish setting up</CardTitle>
          <CardDescription>
            {answered} of {questions.length} questions answered. Nothing is sent to QuickBooks until you finish and turn
            it on.
          </CardDescription>
        </div>
        <Button size="sm" onClick={onContinue}>
          {answered === 0 ? "Start setup" : "Continue setup"}
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-x-6 gap-y-2 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-3">
          {questions.map((s, i) => {
            const done = !missing.has(s);
            return (
              <li key={s} className="flex items-center gap-2.5 text-sm">
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                ) : (
                  <span className="grid size-4 shrink-0 place-items-center rounded-full border border-muted-foreground/40 text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                )}
                <span className={done ? "text-muted-foreground" : undefined}>{STEP_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function SyncCard({ row, overview }: { row: QuickBooksSettings; overview: QuickBooksOverview | undefined }) {
  const update = useUpdateQuickBooksSettings();
  const refused = row.blocker?.code === "books_owned_elsewhere";
  const toPost = overview?.toPost?.count ?? 0;
  const done = overview?.syncedHere.count ?? 0;
  const posting = row.enabled && row.status === "connected" && toPost > 0;
  const pct = posting ? Math.round((done / Math.max(1, done + toPost)) * 100) : 0;

  function toggle(v: boolean) {
    update.mutate(
      { enabled: v },
      {
        onSuccess: () => toast.success(v ? "QuickBooks sync is on" : "Sync paused"),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update sync"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync</CardTitle>
        <CardDescription>Paid invoices post to {row.companyName ?? "QuickBooks"} as Sales Receipts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PreferenceToggle
          label="Sync paid invoices"
          description={
            refused
              ? "Off, because another tool already records this revenue. Change that answer in Settings."
              : "Pausing is safe: anything paid while it's off posts when you turn it back on."
          }
          checked={row.enabled}
          disabled={update.isPending || refused}
          saving={update.isPending}
          onCheckedChange={toggle}
        />
        {row.blocker && row.blocker.code !== "setup_incomplete" && row.blocker.code !== "books_owned_elsewhere" ? (
          <Note tone="warning">{row.blocker.message}</Note>
        ) : null}
        {row.lastError ? (
          <p className="flex gap-2 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {row.lastError}
              {row.lastErrorAt ? ` (${formatDistanceToNow(parseISO(row.lastErrorAt), { addSuffix: true })})` : ""}
            </span>
          </p>
        ) : null}
        <div className="divide-y divide-border">
          <ReadOnlyRow label="Posting from">
            {row.effectiveStartDateKey ? formatDateKey(row.effectiveStartDateKey) : "Not set"}
          </ReadOnlyRow>
          <ReadOnlyRow label="Last posted">
            {row.lastSyncAt ? formatDistanceToNow(parseISO(row.lastSyncAt), { addSuffix: true }) : "Nothing yet"}
          </ReadOnlyRow>
        </div>
        {posting ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Posting history, oldest first
                {overview?.toPost?.oldestPaidAt
                  ? `, now at ${new Date(overview.toPost.oldestPaidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : ""}
              </span>
              <span className="tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground">
              About 25 a minute, in the background. You can close this page.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stats({ row, overview }: { row: QuickBooksSettings; overview: QuickBooksOverview }) {
  const attention = overview.blockedCount ?? overview.blocked.length;
  return (
    <StatGrid>
      <StatCard
        label="In QuickBooks"
        value={overview.syncedHere.count.toLocaleString()}
        hint={formatMoney(overview.syncedHere.totalCents)}
        icon={Receipt}
      />
      <StatCard
        label="Still to post"
        value={overview.toPost ? overview.toPost.count.toLocaleString() : "–"}
        hint={overview.toPost ? formatMoney(overview.toPost.totalCents) : "Pick a start date"}
        icon={Clock}
      />
      <StatCard
        label="Before the start date"
        value={overview.beforeStartDate.count.toLocaleString()}
        hint={row.effectiveStartDateKey ? `Before ${formatDateKey(row.effectiveStartDateKey)}` : "Not posted"}
        icon={CalendarClock}
      />
      <StatCard
        label="Needs attention"
        value={attention.toLocaleString()}
        hint={attention > 0 ? "Waiting on you" : "Nothing waiting"}
        icon={AlertCircle}
        accent={attention > 0 ? "warning" : "primary"}
        to="/settings/integrations/quickbooks"
        search={{ tab: "attention" }}
      />
    </StatGrid>
  );
}
