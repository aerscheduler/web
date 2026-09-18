import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Check, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import {
  useMarkQuickBooksHandled,
  useQuickBooksStartDatePreview,
  useRemoveQuickBooksReceipts,
  useRetryBlockedQuickBooks,
  useSyncInvoiceToQuickBooks,
  type QuickBooksOverview,
  type QuickBooksSettings,
  type QuickBooksSyncEvent,
} from "@/features/queries";
import { blockReasonLabel, formatDateKey } from "./labels";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Where things stand: what is in QuickBooks, what is on its way, what is waiting on a person. */
export function QuickBooksSyncStatus({ row, overview }: { row: QuickBooksSettings; overview: QuickBooksOverview }) {
  const inFlight = (overview.counts["in_flight"] ?? 0) + (overview.counts["deferred"] ?? 0);
  const toPost = overview.toPost?.count ?? 0;
  const done = overview.syncedHere.count;
  const posting = row.enabled && row.status === "connected" && toPost > 0;
  const pct = posting ? Math.round((done / Math.max(1, done + toPost)) * 100) : 0;

  return (
    <div className="space-y-4">
      {row.blocker && row.blocker.code !== "setup_incomplete" ? (
        <p className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {row.blocker.message}
        </p>
      ) : null}
      {row.lastError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {row.lastError}
          {row.lastErrorAt ? (
            <span className="text-destructive/80">
              {" "}
              ·{" "}
              {formatDistanceToNow(parseISO(row.lastErrorAt), {
                addSuffix: true,
              })}
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="In QuickBooks" value={done.toLocaleString()} sub={formatMoney(overview.syncedHere.totalCents)} />
        <Stat
          label={
            row.effectiveStartDateKey
              ? `Still to post (since ${formatDateKey(row.effectiveStartDateKey)})`
              : "Still to post"
          }
          value={overview.toPost ? toPost.toLocaleString() : "–"}
          sub={overview.toPost ? formatMoney(overview.toPost.totalCents) : "Pick a start date"}
        />
        <Stat
          label="Before the start date"
          value={overview.beforeStartDate.count.toLocaleString()}
          sub={`${formatMoney(overview.beforeStartDate.totalCents)} · not posted`}
        />
        <Stat
          label="Needs attention"
          value={(overview.blockedCount ?? overview.blocked.length).toLocaleString()}
          sub={overview.removing > 0 ? `${overview.removing.toLocaleString()} being removed` : null}
        />
      </div>

      {overview.deskExcluded && overview.deskExcluded.count > 0 ? (
        <p className="text-sm text-muted-foreground">
          {overview.deskExcluded.count.toLocaleString()} front-desk payments (
          {formatMoney(overview.deskExcluded.totalCents)}) are left out because front-desk payments are set not to sync.
        </p>
      ) : null}

      {posting ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              Posting to QuickBooks, oldest first
              {overview.toPost?.oldestPaidAt
                ? `, now at ${new Date(overview.toPost.oldestPaidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : ""}
            </span>
            <span className="tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
          <p className="text-xs text-muted-foreground">
            Runs in the background, about 25 a minute. You can close this page. Pausing sync stops it without losing
            anything.
            {inFlight > 0 ? ` ${inFlight.toLocaleString()} waiting on a retry.` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Invoices that cannot post (or be removed) until a person fixes something. */
export function QuickBooksNeedsAttention({ overview }: { overview: QuickBooksOverview }) {
  const retryAll = useRetryBlockedQuickBooks();
  const retryOne = useSyncInvoiceToQuickBooks();
  const handled = useMarkQuickBooksHandled();
  const [pendingId, setPendingId] = useState<number | null>(null);

  if (overview.blocked.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>;
  }

  async function onRetry(invoiceId: number) {
    setPendingId(invoiceId);
    try {
      const r = await retryOne.mutateAsync(invoiceId);
      toast.success(r.qboSalesReceiptId ? "Posted to QuickBooks" : (r.message ?? "Queued"));
    } catch (err) {
      toast.error(errMessage(err, "Still can't post it"));
    } finally {
      setPendingId(null);
    }
  }

  async function onHandled(invoiceId: number, lostPost: boolean, searches: boolean, elsewhere: boolean) {
    const question = !lostPost
      ? "Mark this as handled? Use it once you've recorded (or removed) this one in QuickBooks yourself. AerScheduler will leave it alone from now on."
      : searches
        ? "Mark this as handled? An earlier try to post it never got an answer, so AerScheduler first checks QuickBooks for the receipt that try may have made. If it's there for the right amount (and the money wasn't refunded) it is kept and the invoice counts as posted; any other copy is removed. After that, AerScheduler leaves it alone."
        : elsewhere
          ? `Mark this as handled? An earlier try to post it went to the QuickBooks company you were connected to before, and never got an answer. Search THAT company for "AerScheduler #${invoiceId}" and remove the receipt if it shouldn't be there. AerScheduler leaves this invoice alone from now on.`
          : `Mark this as handled? An earlier try to post it never got an answer, and AerScheduler can't check QuickBooks for it right now. Search QuickBooks for "AerScheduler #${invoiceId}" and remove that receipt yourself if it shouldn't be there. AerScheduler leaves this invoice alone from now on.`;
    if (!confirm(question)) {
      return;
    }
    setPendingId(invoiceId);
    try {
      const r = await handled.mutateAsync(invoiceId);
      toast.success(
        r.searching
          ? "Marked as handled. AerScheduler is checking QuickBooks for the receipt an earlier unanswered try may have made."
          : "Marked as handled",
      );
    } catch (err) {
      toast.error(errMessage(err, "Could not update it"));
    } finally {
      setPendingId(null);
    }
  }

  async function onRetryAll() {
    try {
      const r = await retryAll.mutateAsync(undefined);
      toast.success(`${r.requeued} put back in the queue`);
    } catch (err) {
      toast.error(errMessage(err, "Could not retry"));
    }
  }

  const total = overview.blockedCount ?? overview.blocked.length;
  return (
    <div className="space-y-3">
      {total > overview.blocked.length ? (
        <p className="text-sm text-muted-foreground">
          Showing the {overview.blocked.length} most recent of {total.toLocaleString()}. Retry all covers every one.
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {overview.blocked.map((b) => (
          <li key={b.invoiceId} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={b.isRemoval ? "secondary" : "danger"}>{blockReasonLabel(b.reason)}</Badge>
                <Link to="/billing" search={{ invoice: b.invoiceId } as never} className="font-medium hover:underline">
                  Invoice {b.invoiceNumber}
                </Link>
                <span className="text-muted-foreground">
                  {formatMoney(b.totalCents)}
                  {b.payerName ? ` · ${b.payerName}` : ""}
                  {b.paidAt ? ` · paid ${new Date(b.paidAt).toLocaleDateString()}` : ""}
                </span>
              </div>
              {b.message ? <p className="text-muted-foreground">{b.message}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row">
              {/* A person's to record: Retry cannot do anything for it. */}
              {b.reason !== "repaid_after_partial_refund" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={pendingId === b.invoiceId}
                  onClick={() => void onRetry(b.invoiceId)}
                >
                  {pendingId === b.invoiceId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Retry
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={pendingId === b.invoiceId}
                title="I've dealt with this one in QuickBooks myself"
                onClick={() => void onHandled(b.invoiceId, !!b.lostPost, !!b.handledSearches, !!b.lostPostElsewhere)}
              >
                <Check className="size-3.5" />
                Handled
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={() => void onRetryAll()} disabled={retryAll.isPending}>
        Retry all after fixing
      </Button>
    </div>
  );
}

export function QuickBooksActivity({ events, loading }: { events: QuickBooksSyncEvent[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading activity…</p>;
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No sync activity yet.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {events.map((ev) => {
        const tone =
          ev.status === "success"
            ? "text-emerald-700 dark:text-emerald-400"
            : ev.status === "error"
              ? "text-destructive"
              : "text-muted-foreground";
        return (
          <li key={ev.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className={`font-medium capitalize ${tone}`}>{ev.status === "skipped" ? "note" : ev.status}</p>
              <p className="text-muted-foreground">
                {ev.message || "–"}
                {ev.invoiceId != null && <span className="text-foreground/80"> · Invoice #{ev.invoiceId}</span>}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <div>
                {formatDistanceToNow(parseISO(ev.createdAt), {
                  addSuffix: true,
                })}
              </div>
              <div className="capitalize">{ev.triggeredBy}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The undo. Removal runs through the same background worker as posting. */
export function QuickBooksRemoveReceipts({ row, overview }: { row: QuickBooksSettings; overview: QuickBooksOverview }) {
  const remove = useRemoveQuickBooksReceipts();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const count = overview.syncedHere.count;
  const word = "REMOVE";
  // Receipts already posted before the CURRENT start date (for example, the start date
  // was moved, or reset by a changed answer, without removing them at the time).
  const earlier = useQuickBooksStartDatePreview(row.syncStartDateKey);
  const before = earlier.data?.alreadyPostedBefore ?? {
    count: 0,
    totalCents: 0,
  };

  async function onRemoveBefore() {
    if (!row.syncStartDateKey) return;
    if (
      !confirm(
        `Remove the ${before.count.toLocaleString()} receipt${before.count === 1 ? "" : "s"} AerScheduler posted before your start date (${formatMoney(before.totalCents)}) from QuickBooks?`,
      )
    ) {
      return;
    }
    try {
      const r = await remove.mutateAsync({
        beforeDateKey: row.syncStartDateKey,
      });
      toast.success(`Removing ${r.queued} receipt${r.queued === 1 ? "" : "s"} from QuickBooks.`);
    } catch (err) {
      toast.error(errMessage(err, "Could not start the removal"));
    }
  }

  async function onRemoveAll() {
    try {
      const r = await remove.mutateAsync({ all: true });
      toast.success(`Sync turned off. Removing ${r.queued} receipts from QuickBooks.`);
      setOpen(false);
      setTyped("");
    } catch (err) {
      toast.error(errMessage(err, "Could not start the removal"));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        To take back receipts posted before a date, move the start date later above and tick the box to remove them. To
        undo everything (for example, the wrong company was connected), remove all {count.toLocaleString()} receipts
        AerScheduler posted to {row.companyName ?? "this company"}. Receipts your bookkeeper already included in a bank
        deposit can't be removed automatically; they will show up under Needs attention.
      </p>
      <div className="flex flex-wrap gap-2">
        {before.count > 0 ? (
          <Button variant="outline" disabled={remove.isPending} onClick={() => void onRemoveBefore()}>
            Remove the {before.count.toLocaleString()} posted before the start date
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="text-destructive"
          disabled={count === 0 || remove.isPending}
          onClick={() => setOpen(true)}
        >
          Remove all receipts AerScheduler posted
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {count.toLocaleString()} receipts from QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription>
              Sync turns off, and every Sales Receipt AerScheduler posted to {row.companyName ?? "this company"} (
              {formatMoney(overview.syncedHere.totalCents)}) is deleted there. Customers AerScheduler created stay,
              because QuickBooks does not allow deleting a customer that has ever had a transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="qbo-remove-word" className="text-sm">
              Type {word} to confirm
            </Label>
            <Input id="qbo-remove-word" className="w-40" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={typed !== word || remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void onRemoveAll();
              }}
            >
              Remove all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
