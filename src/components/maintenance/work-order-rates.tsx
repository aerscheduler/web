import * as React from "react";
import { toast } from "sonner";
import { useCustomerProfile, useUpdateCustomerProfile, useUpdateWorkOrder, useUpdateWorkOrderLine, useWorkOrderLines, useWorkOrderSettings } from "@/features/queries";
import type { RateSource, ShopRates, WorkOrder, WorkOrderLine } from "@/types/api";
import { cn, formatMoney } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { MoneyInput } from "@/components/money-input";
import { bpsFrom, pctText } from "@/components/settings/shop-rates-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * RATES FOR ONE CUSTOMER, AND FOR ONE JOB (Murray, 2026-10-08): Nathan priced a staff member's
 * annual at $45/h with every part at cost, typing the rate into 7 labor lines and pricing 10
 * parts by hand. Now the rate is said once, on the customer (every job billed to them) or on the
 * job, and the next line is priced at it, on the console and from the phone alike.
 *
 * A line keeps the price it was given; changing a rate offers to re-price the lines already on
 * an open job that were priced at the old one (never a flat price or a hand price).
 */

const KEYS = ["laborRateCents", "partsMarkupBps", "outsideWorkMarkupBps"] as const;
type Key = (typeof KEYS)[number];
const LABEL: Record<Key, string> = { laborRateCents: "Labor", partsMarkupBps: "Parts", outsideWorkMarkupBps: "Outside work" };

/** "$45.00/h", "+15%", "At cost"; null when nothing sets it. */
export function rateText(key: Key, value: number | null | undefined): string | null {
  if (value == null) return null;
  if (key === "laborRateCents") return `${formatMoney(value)}/h`;
  return value === 0 ? "At cost" : `+${value / 100}%`;
}

/** Where a rate came from, in words: "Bryan Jorgensen's rate", "This job's", "Shop rate". */
function sourceText(from: RateSource | null | undefined, customerName: string | null): string | null {
  if (from === "job") return "This job's";
  if (from === "customer") return customerName ? `${customerName}'s rate` : "The customer's rate";
  if (from === "shop") return "Shop rate";
  return null;
}

/** The three fields, each blank to follow the level above ("Shop: $110.00"). */
function RatesFields({
  idPrefix,
  value,
  onChange,
  fallback,
  fallbackLabel,
}: {
  idPrefix: string;
  value: { labor: number | undefined; parts: string; outside: string };
  onChange: (v: { labor: number | undefined; parts: string; outside: string }) => void;
  fallback: Partial<ShopRates> | null | undefined;
  fallbackLabel: (key: Key) => string;
}) {
  const hint = (key: Key) => {
    const t = rateText(key, fallback?.[key] ?? null);
    return t ? `Blank: ${fallbackLabel(key)}, ${t}` : "Blank: none set";
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-labor`} className="text-[12px]">
          Labor rate per hour
        </Label>
        <MoneyInput
          id={`${idPrefix}-labor`}
          cents={value.labor}
          onCentsChange={(c) => onChange({ ...value, labor: c })}
          onClear={() => onChange({ ...value, labor: undefined })}
          placeholder={fallback?.laborRateCents != null ? (fallback.laborRateCents / 100).toFixed(2) : "0.00"}
          className="h-8"
        />
        <p className="text-[11px] text-muted-foreground">{hint("laborRateCents")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(["partsMarkupBps", "outsideWorkMarkupBps"] as const).map((key) => {
          const field = key === "partsMarkupBps" ? "parts" : "outside";
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={`${idPrefix}-${field}`} className="text-[12px]">
                {key === "partsMarkupBps" ? "Parts markup" : "Outside work markup"}
              </Label>
              <div className="relative">
                <Input
                  id={`${idPrefix}-${field}`}
                  inputMode="decimal"
                  value={value[field]}
                  onChange={(e) => onChange({ ...value, [field]: e.target.value })}
                  placeholder={fallback?.[key] != null ? String(fallback[key]! / 100) : "0"}
                  className="h-8 pr-7 tnum"
                  aria-invalid={bpsFrom(value[field]) === undefined}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{hint(key)}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">0% is at cost.</p>
    </div>
  );
}

const draftFrom = (r: Partial<ShopRates> | null | undefined) => ({
  labor: r?.laborRateCents ?? undefined,
  parts: pctText(r?.partsMarkupBps ?? null),
  outside: pctText(r?.outsideWorkMarkupBps ?? null),
});

/** The draft as rates, or null when a markup is not a number. */
function ratesFrom(d: { labor: number | undefined; parts: string; outside: string }): ShopRates | null {
  const parts = bpsFrom(d.parts);
  const outside = bpsFrom(d.outside);
  if (parts === undefined || outside === undefined || (d.labor != null && d.labor > 100_000_000)) return null;
  return { laborRateCents: d.labor ?? null, partsMarkupBps: parts, outsideWorkMarkupBps: outside };
}

/** The lines on a job priced at a rate that is no longer the job's, and what each would be sent to re-price it. */
export function linesToReprice(lines: readonly WorkOrderLine[], rates: ShopRates): { line: WorkOrderLine; patch: Record<string, number> }[] {
  const out: { line: WorkOrderLine; patch: Record<string, number> }[] = [];
  for (const l of lines) {
    if (l.category === "labor") {
      // Hours at a rate, not a flat price: the price is what the hours at its rate come to.
      const atRate = l.minutes != null && l.rateCents != null && Math.round((l.minutes * l.rateCents) / 60) === l.unitPriceCents;
      if (atRate && rates.laborRateCents != null && l.rateCents !== rates.laborRateCents) out.push({ line: l, patch: { rateCents: rates.laborRateCents } });
    } else if (l.category === "part" || l.category === "outside_service") {
      const markup = l.category === "part" ? rates.partsMarkupBps : rates.outsideWorkMarkupBps;
      // Cost plus a markup, not a price typed by hand (no markup beside a cost).
      if (l.costCents != null && l.markupBps != null && markup != null && l.markupBps !== markup) out.push({ line: l, patch: { markupBps: markup } });
    }
  }
  return out;
}

/** Offers to re-price a job's lines at its new rates; answers how many were changed. */
function useRepriceOffer(w: WorkOrder) {
  const linesQ = useWorkOrderLines(w.id);
  const updateLine = useUpdateWorkOrderLine();
  const confirm = useConfirm();
  return async (rates: ShopRates) => {
    if (w.invoice || w.closedAt) return;
    const todo = linesToReprice(linesQ.data ?? [], rates);
    if (!todo.length) return;
    const ok = await confirm({
      title: `Re-price ${todo.length} ${todo.length === 1 ? "line" : "lines"} at the new rates?`,
      description: `${todo.map((t) => t.line.description).join(", ")}. Lines priced by hand or at a flat price keep their price.`,
      confirmLabel: "Re-price",
      cancelLabel: "Keep their prices",
    });
    if (!ok) return;
    let failed = 0;
    for (const t of todo) {
      try {
        await updateLine.mutateAsync({ workOrderId: w.id, lineId: t.line.id, ...t.patch });
      } catch {
        failed += 1;
      }
    }
    if (failed) toast.error(`${failed} ${failed === 1 ? "line" : "lines"} could not be re-priced. Open ${failed === 1 ? "it" : "them"} to check.`);
    else toast.success(`${todo.length} ${todo.length === 1 ? "line" : "lines"} re-priced`);
  };
}

/**
 * The job's rates, under its Billing card: what the next line is priced at and where that came
 * from. An admin changes them for this job only.
 */
export function JobRatesRows({ workOrder: w, editable }: { workOrder: WorkOrder; editable: boolean }) {
  const rates = w.rates;
  const update = useUpdateWorkOrder();
  const reprice = useRepriceOffer(w);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(draftFrom(w.ownRates));
  const customerName = w.billTo?.name ?? null;
  if (!rates) return null;
  const parsed = ratesFrom(draft);

  async function save(next: ShopRates) {
    try {
      const job = await update.mutateAsync({ id: w.id, ...next });
      setOpen(false);
      toast.success("Rates for this job saved");
      if (job.rates) await reprice(job.rates);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the rates");
    }
  }

  const rows = (
    <span className="block space-y-0.5">
      {KEYS.map((k) => {
        const text = rateText(k, rates[k]);
        const from = sourceText(rates.from[k], customerName);
        return (
          <span key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-2 py-0.5 text-[13px]">
            <span className="text-muted-foreground">{LABEL[k]}</span>
            <span className="min-w-0 truncate">
              <span className={cn("tnum", !text && "text-muted-foreground")}>{text ?? "Not set"}</span>
              {from && <span className={cn("ml-1.5 text-[11px]", rates.from[k] === "shop" ? "text-muted-foreground" : "text-foreground/80")}>{from}</span>}
            </span>
          </span>
        );
      })}
    </span>
  );

  return (
    <div className="mt-3 border-t border-border pt-3" data-testid="job-rates">
      <div className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
        Rates for new lines
        <DocsHint topic="work-order-rates" />
      </div>
      {editable ? (
        <Popover
          open={open}
          onOpenChange={(o) => {
            if (o) setDraft(draftFrom(w.ownRates));
            setOpen(o);
          }}
        >
          <PopoverTrigger asChild>
            <button type="button" className="-ml-2 block w-[calc(100%+0.5rem)] rounded-md px-2 py-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label="Change this job's rates">
              {rows}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <p className="text-[13px] font-medium">Rates for {w.label}</p>
            <RatesFields
              idPrefix="job-rate"
              value={draft}
              onChange={setDraft}
              fallback={w.inheritedRates}
              fallbackLabel={(k) => sourceText(w.inheritedRates?.from[k], customerName) ?? "Shop rate"}
            />
            {!parsed && <p className="text-xs text-destructive">A markup is a percentage from 0 to 1000, like 15.</p>}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={update.isPending || KEYS.every((k) => w.ownRates?.[k] == null)}
                onClick={() => void save({ laborRateCents: null, partsMarkupBps: null, outsideWorkMarkupBps: null })}
              >
                Use the {customerName && KEYS.some((k) => w.inheritedRates?.from[k] === "customer") ? "customer's" : "shop's"}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!parsed || update.isPending} onClick={() => parsed && void save(parsed)}>
                  {update.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        rows
      )}
    </div>
  );
}

/**
 * A customer's own rates, on their record: what every job billed to them is priced at, unless a
 * job says otherwise. Owners and admins change them; never their own (the server's rule).
 */
export function CustomerRatesCard({ orgUserId, name, editable }: { orgUserId: number; name: string | null; editable: boolean }) {
  const q = useCustomerProfile(orgUserId);
  const shopQ = useWorkOrderSettings();
  const save = useUpdateCustomerProfile(orgUserId);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(draftFrom(null));
  const profile = q.data;
  const shop = shopQ.data ?? null;
  const parsed = ratesFrom(draft);
  const own = profile ? KEYS.filter((k) => profile[k] != null) : [];

  async function submit(next: ShopRates) {
    try {
      await save.mutateAsync(next);
      setEditing(false);
      toast.success(`Rates for ${name ?? "this customer"} saved. New lines on their jobs use them.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the rates");
    }
  }

  return (
    <DetailCard
      title={
        <span className="inline-flex items-center gap-1">
          Rates
          <DocsHint topic="work-order-rates" />
        </span>
      }
      docShot="customer-rates"
      action={
        editable && !editing && profile ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(draftFrom(profile));
              setEditing(true);
            }}
          >
            {own.length ? "Change" : "Set rates"}
          </Button>
        ) : undefined
      }
    >
      {q.isLoading ? null : editing ? (
        <div className="space-y-3">
          <RatesFields idPrefix="customer-rate" value={draft} onChange={setDraft} fallback={shop} fallbackLabel={() => "Shop rate"} />
          {!parsed && <p className="text-xs text-destructive">A markup is a percentage from 0 to 1000, like 15.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!parsed || save.isPending} onClick={() => parsed && void submit(parsed)}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : own.length && profile ? (
        <div className="space-y-0.5">
          {KEYS.map((k) => (
            <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-2 py-0.5 text-[13px]">
              <span className="text-muted-foreground">{LABEL[k]}</span>
              <span className="tnum">
                {rateText(k, profile[k] ?? shop?.[k] ?? null) ?? "Not set"}
                {profile[k] == null && shop?.[k] != null && <span className="ml-1.5 text-[11px] text-muted-foreground">Shop rate</span>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <CardEmpty>The shop's rates. Set this customer's own, like staff at cost, and every new line on their jobs uses them.</CardEmpty>
      )}
    </DetailCard>
  );
}
