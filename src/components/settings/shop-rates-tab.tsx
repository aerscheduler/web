import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSetWorkOrderSettings, useWorkOrderSettings } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canManageBilling } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { DocsHint } from "@/components/docs-hint";
import { MoneyInput } from "@/components/money-input";
import { Field } from "@/components/settings/parts";

/** "15" or "15%" to basis points, "" to null, anything else undefined. */
export function bpsFrom(text: string): number | null | undefined {
  const t = text.trim().replace(/%$/, "");
  if (!t) return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return undefined;
  const bps = Math.round(Number(t) * 100);
  return bps <= 100_000 ? bps : undefined;
}
export const pctText = (bps: number | null) => (bps == null ? "" : String(bps / 100));

/**
 * The shop's defaults for pricing work order lines: the labor rate that fills in each labor entry,
 * and the markup on parts and on outside work (Murray: 15% on both). A line keeps the price it was
 * given, so changing these never rewrites a job already priced.
 */
export function ShopRatesTab() {
  const q = useWorkOrderSettings();
  const save = useSetWorkOrderSettings();
  const { roles } = useAuth();
  const canEdit = canManageBilling(roles);
  const [rate, setRate] = useState<number | undefined>(undefined);
  const [parts, setParts] = useState("");
  const [outside, setOutside] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const key = JSON.stringify(q.data);
    if (loadedFor === key) return;
    setLoadedFor(key);
    setRate(q.data.laborRateCents ?? undefined);
    setParts(pctText(q.data.partsMarkupBps));
    setOutside(pctText(q.data.outsideWorkMarkupBps));
  }, [q.data, loadedFor]);

  const partsBps = bpsFrom(parts);
  const outsideBps = bpsFrom(outside);
  // The server's bounds, checked here so the answer is in dollars and percent, not cents.
  const rateTooBig = rate != null && rate > 100_000_000;
  const invalid = partsBps === undefined || outsideBps === undefined || rateTooBig;

  async function submit() {
    if (invalid) return;
    try {
      await save.mutateAsync({ laborRateCents: rate ?? null, partsMarkupBps: partsBps, outsideWorkMarkupBps: outsideBps });
      toast.success("Shop rates saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the rates");
    }
  }

  return (
    <Card data-doc-shot="shop-rates">
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1">
          Shop rates
          <DocsHint topic="shop-rates" />
        </CardTitle>
        <CardDescription>How new labor and parts on a work order are priced. A line already on a job keeps its price.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <Field label="Labor rate per hour" htmlFor="shop-labor-rate" hint="Fills in each labor entry. Only an admin changes the rate on an entry.">
              <MoneyInput id="shop-labor-rate" cents={rate} onCentsChange={setRate} onClear={() => setRate(undefined)} className="w-40" disabled={!canEdit} placeholder="No rate" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Markup on parts" htmlFor="shop-parts-markup" hint="Added to what the shop paid, for example 15.">
                <div className="relative w-32">
                  <Input placeholder="15" id="shop-parts-markup" inputMode="decimal" value={parts} onChange={(e) => setParts(e.target.value)} disabled={!canEdit} className="pr-7 tnum" aria-invalid={partsBps === undefined} />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
                </div>
              </Field>
              <Field label="Markup on outside work" htmlFor="shop-outside-markup" hint="A propeller overhaul, a radio repair sent out.">
                <div className="relative w-32">
                  <Input placeholder="10" id="shop-outside-markup" inputMode="decimal" value={outside} onChange={(e) => setOutside(e.target.value)} disabled={!canEdit} className="pr-7 tnum" aria-invalid={outsideBps === undefined} />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
                </div>
              </Field>
            </div>
            {(partsBps === undefined || outsideBps === undefined) && <p className="text-xs text-destructive">A markup is a percentage from 0 to 1000, like 15.</p>}
            {rateTooBig && <p className="text-xs text-destructive">The labor rate can be at most $1,000,000.00 an hour.</p>}
            {canEdit ? (
              <div className="flex justify-end">
                <Button onClick={submit} disabled={save.isPending || invalid}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Only an admin can change the shop's rates.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
