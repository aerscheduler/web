import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLedgerAutoRefill, useUpdateLedgerAutoRefill } from "@/features/queries";
import { ApiError } from "@/lib/api";
import type { LedgerAutoRefillCadence, LedgerAutoRefillMode } from "@/types/api";
import { DocsHint } from "@/components/docs-hint";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const MODE_LABEL: Record<LedgerAutoRefillMode, string> = {
  under_threshold: "When balance drops under a floor",
  pay_balance: "Pay whatever I owe",
  fixed_amount: "Charge a fixed amount",
};

function pausedCopy(reason: string | null): string | null {
  if (reason === "declined_card") {
    return "Paused: the saved card was declined. Update the card, then turn auto-refill back on.";
  }
  if (reason === "needs_authentication") {
    return "Paused: the card needs a one-time confirmation. Add funds from Billing, then turn auto-refill back on.";
  }
  if (reason === "no_payment_method") {
    return "Paused: no default card on file. Add a card and set it as default, then turn auto-refill back on.";
  }
  // Neither of these is the member's card. Saying so stops a school-side outage from
  // sending everyone to check a card that is perfectly fine.
  if (reason === "org_not_connected") {
    return "Paused: this school has not finished setting up card payments, so auto-refill could not run. Nothing to fix on your side.";
  }
  if (reason === "stripe_unavailable") {
    return "Paused: card payments were unavailable, so auto-refill could not run. Turn it back on to try again.";
  }
  return null;
}

function dollarsFromCents(cents: number | null): string {
  if (cents == null) return "";
  return String(cents / 100);
}

function parseDollars(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function AutoRefillCard({
  orgUserId,
  compact,
}: {
  orgUserId: number;
  compact?: boolean;
}) {
  const q = useLedgerAutoRefill(orgUserId);
  const save = useUpdateLedgerAutoRefill(orgUserId);
  const row = q.data;

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<LedgerAutoRefillMode>("under_threshold");
  const [threshold, setThreshold] = useState("");
  const [charge, setCharge] = useState("");
  const [cadence, setCadence] = useState<LedgerAutoRefillCadence>("daily");
  const [monthlyDay, setMonthlyDay] = useState("1");

  useEffect(() => {
    if (!row) return;
    setEnabled(row.enabled);
    setMode(row.mode);
    setThreshold(dollarsFromCents(row.thresholdCents));
    setCharge(dollarsFromCents(row.chargeCents));
    setCadence(row.cadence);
    setMonthlyDay(String(row.monthlyDay ?? 1));
  }, [row]);

  /**
   * Returns false when the save was rejected, so the caller can put optimistic UI back.
   * A switch that stays ON after a refusal is worse than no optimistic update at all:
   * the member walks away believing autopay is armed when nothing was stored.
   */
  async function persist(patch: Parameters<typeof save.mutateAsync>[0]): Promise<boolean> {
    try {
      await save.mutateAsync(patch);
      toast.success("Auto-refill saved");
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save auto-refill");
      return false;
    }
  }

  if (q.isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const pauseNote = pausedCopy(row?.pausedReason ?? null);

  return (
    <Card data-doc-shot="ledger-auto-refill">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="size-4 text-primary" /> Auto-refill
            <DocsHint topic="ledger-auto-refill" />
          </CardTitle>
          <CardDescription className="mt-1">
            Charge the default card to add credit on a schedule. Needs a default card.
            {compact ? null : " Runs in the school's time zone, usually around 4am at the field."}
          </CardDescription>
        </div>
        <Switch
          checked={enabled}
          disabled={save.isPending}
          onCheckedChange={async (next) => {
            setEnabled(next);
            const ok = await persist({ enabled: next });
            if (!ok) setEnabled(!next);
          }}
          aria-label="Toggle auto-refill"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {pauseNote && (
          <p className="text-sm text-amber-700 dark:text-amber-500">{pauseNote}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">When</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as LedgerAutoRefillMode)}
              disabled={save.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as LedgerAutoRefillMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">How often</Label>
            <Select
              value={cadence}
              onValueChange={(v) => setCadence(v as LedgerAutoRefillCadence)}
              disabled={save.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Every day</SelectItem>
                <SelectItem value="monthly">Once a month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "under_threshold" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                When balance is under
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={threshold}
                  disabled={save.isPending}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="200"
                  className="max-w-[8rem]"
                />
              </div>
            </div>
          )}
          {(mode === "under_threshold" || mode === "fixed_amount") && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Charge</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={charge}
                  disabled={save.isPending}
                  onChange={(e) => setCharge(e.target.value)}
                  placeholder="150"
                  className="max-w-[8rem]"
                />
              </div>
            </div>
          )}
          {cadence === "monthly" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Day of month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={monthlyDay}
                disabled={save.isPending}
                onChange={(e) => setMonthlyDay(e.target.value)}
                className="max-w-[8rem]"
              />
            </div>
          )}
        </div>

        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            void persist({
              enabled,
              mode,
              cadence,
              thresholdCents: parseDollars(threshold),
              chargeCents: parseDollars(charge),
              monthlyDay: cadence === "monthly" ? Number(monthlyDay) : null,
            })
          }
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save auto-refill
        </Button>
      </CardContent>
    </Card>
  );
}
