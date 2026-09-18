import { useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { ReadOnlyRow } from "@/components/settings/parts";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDisconnectQuickBooks,
  useQuickBooksStartDatePreview,
  useRemoveQuickBooksReceipts,
  type QuickBooksOverview,
  type QuickBooksSettings,
} from "@/features/queries";
import { formatDateKey } from "./labels";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * The company this is connected to, and the ways to undo: take receipts back out, stop a
 * removal that can't run, or disconnect. Kept off the Overview on purpose: none of it is
 * everyday, and all of it is hard to take back.
 */
export function QuickBooksConnectionPane({
  row,
  overview,
  onReconnect,
  reconnecting,
  onStopRemoving,
  stopping,
}: {
  row: QuickBooksSettings;
  overview: QuickBooksOverview | undefined;
  onReconnect: () => void;
  reconnecting: boolean;
  onStopRemoving: () => void;
  stopping: boolean;
}) {
  const confirm = useConfirm();
  const removing = overview?.removing ?? 0;
  const lapsed = row.status === "needs_reconnect";

  async function onConnectDifferent() {
    if (!lapsed) {
      const ok = await confirm({
        title: "Connect a different company?",
        description:
          "Every setup answer is cleared and sync turns off, so nothing posts to the new company until you set it up again. Receipts already posted stay where they are.",
        confirmLabel: "Continue to Intuit",
      });
      if (!ok) return;
    }
    onReconnect();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-3">
          <div className="min-w-[14rem] flex-1">
            <CardTitle>Company</CardTitle>
            <CardDescription>The QuickBooks company paid invoices post to.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onConnectDifferent()}
            disabled={reconnecting || removing > 0}
          >
            {lapsed ? "Reconnect" : "Connect a different company"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            <ReadOnlyRow label="Company">
              {row.companyName ?? "Unnamed"}
              {row.useSandbox ? <span className="font-normal text-muted-foreground"> (sandbox)</span> : null}
            </ReadOnlyRow>
            <ReadOnlyRow label="Connected">
              {row.connectedAt ? format(parseISO(row.connectedAt), "MMM d, yyyy") : "–"}
            </ReadOnlyRow>
          </div>
        </CardContent>
      </Card>

      <UndoCard row={row} overview={overview} onStopRemoving={onStopRemoving} stopping={stopping} />
    </div>
  );
}

function ActionRow({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[13px] text-muted-foreground">{description}</div>
      </div>
      {children}
    </li>
  );
}

function UndoCard({
  row,
  overview,
  onStopRemoving,
  stopping,
}: {
  row: QuickBooksSettings;
  overview: QuickBooksOverview | undefined;
  onStopRemoving: () => void;
  stopping: boolean;
}) {
  const remove = useRemoveQuickBooksReceipts();
  const disconnect = useDisconnectQuickBooks();
  const confirm = useConfirm();
  const [allOpen, setAllOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const earlier = useQuickBooksStartDatePreview(row.syncStartDateKey);
  const before = earlier.data?.alreadyPostedBefore ?? { count: 0, totalCents: 0 };
  const posted = overview?.syncedHere ?? { count: 0, totalCents: 0 };
  const removing = overview?.removing ?? 0;
  const company = row.companyName ?? "QuickBooks";
  const WORD = "REMOVE";

  async function removeBefore() {
    if (!row.syncStartDateKey) return;
    const ok = await confirm({
      title: `Remove ${before.count.toLocaleString()} receipt${before.count === 1 ? "" : "s"}?`,
      description: `The receipts AerScheduler posted before your start date, ${formatDateKey(row.syncStartDateKey)} (${formatMoney(before.totalCents)}), are deleted from QuickBooks. They don't post again.`,
      confirmLabel: "Remove them",
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await remove.mutateAsync({ beforeDateKey: row.syncStartDateKey });
      toast.success(`Removing ${r.queued} receipt${r.queued === 1 ? "" : "s"} from QuickBooks`);
    } catch (err) {
      toast.error(errMessage(err, "Could not start the removal"));
    }
  }

  async function removeAll() {
    try {
      const r = await remove.mutateAsync({ all: true });
      toast.success(`Sync turned off. Removing ${r.queued} receipts from QuickBooks.`);
      setAllOpen(false);
      setTyped("");
    } catch (err) {
      toast.error(errMessage(err, "Could not start the removal"));
    }
  }

  async function onDisconnect() {
    const ok = await confirm({
      title: "Disconnect QuickBooks?",
      description:
        "Access is revoked at Intuit and nothing more is posted. Receipts already in QuickBooks stay there. Your setup answers are kept if you reconnect the same company.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync();
      toast.success("QuickBooks disconnected");
    } catch (err) {
      toast.error(errMessage(err, "Could not disconnect"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remove and disconnect</CardTitle>
        <CardDescription>
          Receipts already in a bank deposit can't be removed automatically. They show under Needs attention instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border border-t border-border">
          {removing > 0 ? (
            <ActionRow
              title="Removing receipts"
              description={`${removing.toLocaleString()} still to go. Connecting a different company or disconnecting waits until this finishes.`}
            >
              <Button variant="outline" size="sm" onClick={onStopRemoving} disabled={stopping}>
                {stopping ? <Loader2 className="size-4 animate-spin" /> : null}
                Stop removing
              </Button>
            </ActionRow>
          ) : null}
          {before.count > 0 && row.syncStartDateKey ? (
            <ActionRow
              title="Receipts before the start date"
              description={`${before.count.toLocaleString()} posted before ${formatDateKey(row.syncStartDateKey)}, ${formatMoney(before.totalCents)}.`}
            >
              <Button variant="outline" size="sm" onClick={() => void removeBefore()} disabled={remove.isPending}>
                Remove
              </Button>
            </ActionRow>
          ) : null}
          <ActionRow
            title="All receipts"
            description={
              posted.count > 0
                ? `Turns sync off and deletes all ${posted.count.toLocaleString()} from ${company}, ${formatMoney(posted.totalCents)}.`
                : `Nothing AerScheduler posted is in ${company} right now.`
            }
          >
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setAllOpen(true)}
              disabled={posted.count === 0 || remove.isPending}
            >
              Remove all
            </Button>
          </ActionRow>
          <ActionRow
            title="Disconnect"
            description={
              removing > 0
                ? "Waits until the receipts being removed are done, or stopped."
                : "Revokes access at Intuit. Receipts already posted stay in QuickBooks."
            }
          >
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => void onDisconnect()}
              disabled={disconnect.isPending || removing > 0}
            >
              Disconnect
            </Button>
          </ActionRow>
        </ul>
      </CardContent>

      <ResponsiveModal
        open={allOpen}
        onOpenChange={(o) => {
          setAllOpen(o);
          if (!o) setTyped("");
        }}
        title={`Remove all ${posted.count.toLocaleString()} receipts?`}
        description={`Sync turns off, and every Sales Receipt AerScheduler posted to ${company} (${formatMoney(posted.totalCents)}) is deleted there. Customers AerScheduler created stay: QuickBooks doesn't allow deleting a customer that has ever had a transaction.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== WORD || remove.isPending}
              onClick={() => void removeAll()}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove all
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="qbo-remove-word">Type {WORD} to confirm</Label>
          <Input id="qbo-remove-word" className="w-40" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      </ResponsiveModal>
    </Card>
  );
}
