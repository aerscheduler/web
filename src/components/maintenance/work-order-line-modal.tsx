import * as React from "react";
import { Box, CircleDollarSign, Clock, CornerDownRight, Droplet, Landmark, Package, PackageCheck, Percent, Receipt, Truck, UserRound } from "lucide-react";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { toast } from "sonner";
import {
  useAddWorkOrderLine,
  useMembers,
  useUpdateWorkOrderLine,
  useSalesTaxSettings,
  useWorkOrderItems,
  useWorkOrderSettings,
} from "@/features/queries";
import { Link } from "@tanstack/react-router";
import type { WorkOrder, WorkOrderLine, WorkOrderLineCategory, WorkOrderLineInput } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canManageBilling } from "@/lib/permissions";
import { useTimeZone } from "@/lib/use-timezone";
import { dateKeyInZone } from "@/lib/timezone";
import { cn, formatMoney } from "@/lib/utils";
import { ResponsiveModal } from "@/components/responsive-modal";
import { MoneyInput } from "@/components/money-input";
import { Field } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import { ChipButton, ChipMenu, DateChip } from "@/components/property-chips";

export const LINE_KINDS: { value: WorkOrderLineCategory; label: string }[] = [
  { value: "labor", label: "Labor" },
  { value: "part", label: "Part" },
  { value: "outside_service", label: "Outside work" },
  { value: "supply", label: "Shop supplies" },
  { value: "freight", label: "Freight and shipping" },
  { value: "fee", label: "Fee" },
  { value: "other", label: "Other" },
];
export const LINE_KIND_ICON: Record<WorkOrderLineCategory, React.ComponentType<{ className?: string }>> = {
  labor: Clock,
  part: Package,
  outside_service: Truck,
  supply: Droplet,
  freight: Box,
  fee: Receipt,
  other: CircleDollarSign,
};
export const LINE_KIND_LABEL = Object.fromEntries(LINE_KINDS.map((k) => [k.value, k.label])) as Record<WorkOrderLineCategory, string>;

const NONE = "none";
const RULE = "rule";

/** What a technician is told when the school has no labor rate: they cannot type one, nor open Settings. */
const NO_RATE_FOR_TECH = "No shop labor rate is set yet. Ask an admin to set one under Settings, Shop rates.";

/** The server's bounds: 100,000 minutes of labor, $1,000,000.00 a unit, a bill of $999,999.99. */
const MINUTES_MAX = 100_000;
const CENTS_MAX = 100_000_000;
const LINE_MAX = 99_999_999;

/** "1.5" hours typed to minutes, or null when it is not a number of hours. */
function minutesFrom(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const m = Math.round(Number(t) * 60);
  return m > 0 && m <= MINUTES_MAX ? m : null;
}

/** "20 min", "1.5 h": what the minutes will read as on the job, as the server labels them. */
export function timeLabel(minutes: number): string {
  if (minutes % 15 === 0) return `${minutes / 60} h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** What a line charges: qty x the price each, less the discount, rounded once on the line (the server's rule). */
function lineCharge(unitPrice: number, qty: number, discountBps: number | null | undefined): number {
  const gross = unitPrice * qty;
  return discountBps ? Math.round((gross * (10_000 - discountBps)) / 10_000) : gross;
}

/** "15" or "15%" to basis points, "" to null, anything else undefined. */
function bpsFrom(text: string): number | null | undefined {
  const t = text.trim().replace(/%$/, "");
  if (!t) return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return undefined;
  const bps = Math.round(Number(t) * 100);
  return bps <= 100_000 ? bps : undefined;
}

/**
 * Add or change a line on a job. The fields follow the kind: labor is hours at a rate (the shop
 * rate by default) by a technician on a day; a part or outside work is a cost with the markup
 * (Murray: 15% on both), or a price typed outright; supplies, freight and fees are a price. What
 * the customer is charged is shown as it is worked out, and the server works it out the same way.
 */
export function WorkOrderLineModal({
  workOrder,
  open,
  onOpenChange,
  editing,
  defaultKind = "labor",
  defaultItemId = null,
}: {
  workOrder: WorkOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: WorkOrderLine | null;
  defaultKind?: WorkOrderLineCategory;
  /** A new line for this item: opened from the item's own menu. */
  defaultItemId?: number | null;
}) {
  const once = useSubmitOnce(open);
  const add = useAddWorkOrderLine();
  const update = useUpdateWorkOrderLine();
  const settingsQ = useWorkOrderSettings({ enabled: open });
  // Only an admin prices. Anyone else enters work at the shop's rates, so the pricing controls are
  // shown (they say what the line will charge) but not theirs to change; the server holds the rule.
  const { roles } = useAuth();
  const mayPrice = canManageBilling(roles);
  // Only an admin marks a line taxable, and only an admin reads the rates: one marked taxable with
  // no rate to charge it at is said here, not first at Raise invoice (Tony, 2026-10-05).
  const taxQ = useSalesTaxSettings({ enabled: mayPrice && open });
  const noTaxRate = !!taxQ.data && !taxQ.data.rates.some((r) => !r.archivedAt);
  const tz = useTimeZone();
  const membersQ = useMembers(undefined, { enabled: open });
  const itemsQ = useWorkOrderItems(open ? workOrder.id : null);

  const [kind, setKind] = React.useState<WorkOrderLineCategory>(defaultKind);
  const [description, setDescription] = React.useState("");
  const [hours, setHours] = React.useState("");
  const [rate, setRate] = React.useState<number | undefined>(undefined);
  const [technician, setTechnician] = React.useState(NONE);
  const [workedOn, setWorkedOn] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [cost, setCost] = React.useState<number | undefined>(undefined);
  const [markup, setMarkup] = React.useState("");
  const [ownPrice, setOwnPrice] = React.useState(false);
  const [price, setPrice] = React.useState<number | undefined>(undefined);
  const [partNumber, setPartNumber] = React.useState("");
  const [serialNumber, setSerialNumber] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [partStatus, setPartStatus] = React.useState<string>(NONE);
  const [orderedOn, setOrderedOn] = React.useState("");
  const [expectedOn, setExpectedOn] = React.useState("");
  const [taxable, setTaxable] = React.useState<string>(RULE);
  const [billable, setBillable] = React.useState(true);
  const [discount, setDiscount] = React.useState("");
  const [itemId, setItemId] = React.useState<string>(NONE);
  const [showErrors, setShowErrors] = React.useState(false);
  const seeded = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    const key = `${editing?.id ?? "new"}:${defaultKind}:${defaultItemId ?? ""}`;
    if (seeded.current === key) return;
    seeded.current = key;
    const l = editing;
    setKind(l?.category ?? defaultKind);
    setDescription(l?.description ?? "");
    setHours(l?.minutes ? String(Number((l.minutes / 60).toFixed(2))) : "");
    setRate(l?.rateCents ?? undefined);
    setTechnician(l?.technician ? String(l.technician.id) : NONE);
    // Today at the school, not in UTC: from 6 PM in Idaho the UTC date is already tomorrow.
    // An existing labor line keeps its day, even none: editing its wording must not stamp today.
    setWorkedOn(l && l.category === "labor" ? l.workedOn ?? "" : dateKeyInZone(new Date(), tz.zone));
    setQty(String(l?.qty ?? 1));
    setCost(l?.costCents ?? undefined);
    setMarkup(l?.markupBps != null ? String(l.markupBps / 100) : "");
    // An existing line priced by hand keeps its typed price: no markup, whether or not the shop's
    // cost is recorded beside it. Seeded wrong, the next save sent the shop's markup and the
    // server re-priced a $450 magneto to cost plus 15%.
    setOwnPrice(!!l && l.category !== "labor" && l.markupBps == null);
    setPrice(l?.unitPriceCents ?? undefined);
    setPartNumber(l?.partNumber ?? "");
    setSerialNumber(l?.serialNumber ?? "");
    setVendor(l?.vendor ?? "");
    setPartStatus(l?.partStatus ?? NONE);
    setOrderedOn(l?.orderedOn ?? "");
    setExpectedOn(l?.expectedOn ?? "");
    setTaxable(l?.taxable == null ? RULE : l.taxable ? "yes" : "no");
    setBillable(l?.billable ?? true);
    setDiscount(l?.discountBps ? String(l.discountBps / 100) : "");
    setItemId(l ? (l.itemId ? String(l.itemId) : NONE) : defaultItemId ? String(defaultItemId) : NONE);
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultKind, defaultItemId]);

  // The shop's defaults, shown as the value until somebody types their own.
  const settings = settingsQ.data;
  const effectiveRate = rate ?? settings?.laborRateCents ?? undefined;
  const defaultMarkupBps = kind === "part" ? settings?.partsMarkupBps : kind === "outside_service" ? settings?.outsideWorkMarkupBps : null;
  const markupBps = bpsFrom(markup);
  const effectiveMarkup = markup.trim() ? markupBps : defaultMarkupBps ?? null;

  // An admin's discount on the line: a percentage off the whole line, before tax. Read like the
  // markup above it, so "10%" is 10; 0 is no discount.
  const discountBps = (() => {
    const bps = bpsFrom(discount);
    if (bps === undefined || (bps != null && bps > 10_000)) return undefined;
    return bps || null;
  })();
  const isLabor = kind === "labor";
  const marksUp = kind === "part" || kind === "outside_service";
  const minutes = isLabor ? minutesFrom(hours) : null;
  const qtyNum = isLabor ? 1 : Number.parseInt(qty, 10);
  const qtyOk = isLabor || (/^\d{1,4}$/.test(qty.trim()) && qtyNum >= 1);

  // A labor line priced flat (a flat-rate annual) keeps that price while its hours and rate stay
  // as they were, exactly as the server does.
  const flatLabor =
    editing?.category === "labor" &&
    editing.minutes != null &&
    editing.rateCents != null &&
    editing.unitPriceCents !== Math.round((editing.minutes * editing.rateCents) / 60);

  // The customer's price per unit, worked out the way the server works it out.
  const unitPrice = isLabor
    ? flatLabor && minutes === editing!.minutes && effectiveRate === editing!.rateCents
      ? editing!.unitPriceCents
      : minutes != null && effectiveRate != null
        ? Math.round((minutes * effectiveRate) / 60)
        : null
    : marksUp && !ownPrice
      ? // Marked up from a cost, or not priced yet: never a price left over from another kind.
        cost != null
        ? Math.round((cost * (10_000 + (effectiveMarkup ?? 0))) / 10_000)
        : null
      : price ?? null;

  // The technician role only: an admin who does the work holds it too.
  const technicianOptions = (membersQ.data ?? []).filter((m) => !m.external && m.technicianRole);

  const errors = {
    description: !description.trim(),
    hours: isLabor && minutes == null,
    rate: isLabor && effectiveRate == null,
    qty: !qtyOk,
    markup: marksUp && !ownPrice && markupBps === undefined,
    price: unitPrice == null,
    discount: discountBps === undefined,
    tooBig:
      [effectiveRate, cost, price].some((v) => v != null && v > CENTS_MAX) ||
      (unitPrice != null && lineCharge(unitPrice, qtyOk ? qtyNum : 1, discountBps) > LINE_MAX),
  };
  const invalid = Object.values(errors).some(Boolean);
  const pending = add.isPending || update.isPending;

  async function submit() {
    if (invalid) {
      setShowErrors(true);
      return;
    }
    if (!once.begin()) return;
    const body: WorkOrderLineInput = {
      category: kind,
      description: description.trim(),
      billable,
      ...(mayPrice ? { discountBps: discountBps ?? null } : {}),
      taxable: taxable === RULE ? null : taxable === "yes",
      itemId: itemId === NONE ? null : Number(itemId),
    };
    if (isLabor) {
      Object.assign(body, {
        minutes: minutes!,
        // A non-admin's new line takes the server's CURRENT shop rate. Sending the one this
        // form loaded was refused as a rate change whenever an admin had changed it meanwhile.
        ...(mayPrice || editing ? { rateCents: effectiveRate ?? null } : {}),
        technicianOrgUserId: technician === NONE ? null : Number(technician),
        workedOn: workedOn || null,
      });
    } else {
      Object.assign(body, { qty: qtyNum, vendor: vendor.trim() || null });
      if (marksUp && !ownPrice) Object.assign(body, { costCents: cost ?? null, ...(mayPrice || editing ? { markupBps: effectiveMarkup ?? null } : {}) });
      else Object.assign(body, { unitPriceCents: price!, ...(marksUp ? { costCents: cost ?? null, markupBps: null } : {}) });
      if (kind === "part") {
        Object.assign(body, {
          partNumber: partNumber.trim() || null,
          serialNumber: serialNumber.trim() || null,
          partStatus: partStatus === NONE ? null : (partStatus as WorkOrderLine["partStatus"]),
          orderedOn: orderedOn || null,
          expectedOn: expectedOn || null,
        });
      }
    }
    try {
      if (editing) await update.mutateAsync({ workOrderId: workOrder.id, lineId: editing.id, ...body });
      else await add.mutateAsync({ workOrderId: workOrder.id, ...body });
      toast.success(editing ? "Line saved" : "Line added");
      onOpenChange(false);
    } catch (e) {
      once.fail();
      toast.error(e instanceof Error ? e.message : "Couldn't save the line");
    }
  }

  const items = itemsQ.data ?? [];
  const item = items.find((i) => String(i.id) === itemId);
  const tech =
    technicianOptions.find((m) => String(m.id) === technician) ??
    (editing?.technician && String(editing.technician.id) === technician ? { id: editing.technician.id, user: { name: editing.technician.name } } : null);
  const techName = tech ? (tech.user?.name ?? `Member #${tech.id}`) : null;
  const markupPct = effectiveMarkup ? effectiveMarkup / 100 : 0;
  const KindIcon = LINE_KIND_ICON[kind];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? "Edit line" : `Add ${LINE_KIND_LABEL[kind].toLowerCase()}`}
      description={`${workOrder.label}. Becomes a line on the job's invoice.`}
      dataDocShot={editing ? undefined : "work-order-add-line"}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm tnum text-muted-foreground">
            {!billable ? (
              "No charge to the customer"
            ) : unitPrice != null ? (
              <>
                Customer pays{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(lineCharge(unitPrice, qtyOk ? qtyNum : 1, discountBps))}
                </span>
                {discountBps ? ` (${discountBps / 100}% off)` : ""}
              </>
            ) : (
              "Customer pays: not priced yet"
            )}
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add line"}
            </Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={isLabor ? "What was done" : "Description"} htmlFor="wo-line-description">
          <Input
            id="wo-line-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder={isLabor ? "Replace brake caliper seals" : kind === "part" ? "Brake caliper seal kit" : kind === "outside_service" ? "Propeller overhaul" : "Misc hardware"}
            aria-invalid={showErrors && errors.description}
          />
        </Field>

        {isLabor ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hours"
              htmlFor="wo-line-hours"
              hint={
                minutes != null && Math.abs(minutes / 60 - Number(hours)) > 1e-9
                  ? `Saved as ${timeLabel(minutes)}, to the minute.`
                  : "Clock time: 1.5 is an hour and a half."
              }
            >
              <Input id="wo-line-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" className="tnum" aria-invalid={showErrors && errors.hours} />
            </Field>
            <Field label="Rate per hour" htmlFor="wo-line-rate" hint={
                settings?.laborRateCents != null
                  ? `Shop rate ${formatMoney(settings.laborRateCents)}`
                  : mayPrice
                    ? "No shop rate set; type one."
                    : NO_RATE_FOR_TECH
              }>
              <MoneyInput
                id="wo-line-rate"
                cents={effectiveRate}
                onCentsChange={setRate}
                onClear={() => setRate(undefined)}
                placeholder={settings?.laborRateCents != null ? (settings.laborRateCents / 100).toFixed(2) : "0.00"}
                disabled={!mayPrice}
              />
            </Field>
          </div>
        ) : (
          <div className={cn("grid gap-4", marksUp ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {/* Shown for every kind that bills a quantity, outside work too: hidden, a quantity
                carried over from another kind was billed with nothing on screen to fix it. */}
            <Field label="Quantity" htmlFor="wo-line-qty">
              <Input placeholder="1" id="wo-line-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="tnum" aria-invalid={showErrors && errors.qty} />
            </Field>
            {marksUp && (
              <Field label="Cost each" htmlFor="wo-line-cost" hint="What the shop paid.">
                <MoneyInput id="wo-line-cost" cents={cost} onCentsChange={setCost} onClear={() => setCost(undefined)} />
              </Field>
            )}
            {/* A part or outside work: the price follows the cost at the markup, shown greyed in
                the field, until somebody types their own; emptying the field goes back to the
                markup. One field, no switch (Tony, 2026-09-30: a "Priced by" toggle only added
                fields to a crowded form). */}
            <Field
              label="Price each"
              htmlFor="wo-line-price"
              hint={
                !marksUp
                  ? undefined
                  : ownPrice
                    ? mayPrice
                      ? `Typed. Empty it for cost plus ${markupPct}%.`
                      : "Typed by an admin."
                    : effectiveMarkup
                      ? `Cost plus ${markupPct}%.`
                      : "The cost: no markup is set."
              }
            >
              <MoneyInput
                id="wo-line-price"
                cents={marksUp && !ownPrice ? undefined : price}
                placeholder={marksUp && !ownPrice && unitPrice != null ? (unitPrice / 100).toFixed(2) : "0.00"}
                onCentsChange={(c) => {
                  setPrice(c);
                  if (marksUp) setOwnPrice(true);
                }}
                onClear={
                  marksUp
                    ? () => {
                        setPrice(undefined);
                        setOwnPrice(false);
                      }
                    : undefined
                }
                disabled={!mayPrice && marksUp}
              />
            </Field>
          </div>
        )}
        {!mayPrice && (marksUp || isLabor) && (
          <p className="text-xs text-muted-foreground">Priced at the shop's rates. Only an admin changes a line's rate, markup or price.</p>
        )}
        {kind === "part" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Part number" htmlFor="wo-line-pn">
              <Input placeholder="66-106" id="wo-line-pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Serial number" htmlFor="wo-line-sn">
              <Input placeholder="If it has one" id="wo-line-sn" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Vendor" htmlFor="wo-line-vendor">
              <Input placeholder="Aircraft Spruce" id="wo-line-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={80} />
            </Field>
          </div>
        ) : kind === "outside_service" ? (
          <Field label="Vendor" htmlFor="wo-line-vendor">
            <Input placeholder="Propeller shop" id="wo-line-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={80} />
          </Field>
        ) : null}

        {/* The rest of the line as chips (Linear's create form): each says its value, a click
            changes it, and a line that keeps the defaults never has to look at them. */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4" role="group" aria-label="More about the line">
          {/* Changing an existing line's kind re-prices it, which is the admin's (the server's rule). */}
          <ChipMenu
            id="wo-line-kind"
            name="Kind"
            leading={<KindIcon className="size-3.5" />}
            label={LINE_KIND_LABEL[kind]}
            set
            value={kind}
            onChange={(v) => setKind(v as WorkOrderLineCategory)}
            disabled={!!editing && !mayPrice}
            options={LINE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
          {items.length > 0 && (
            <ChipMenu
              id="wo-line-item"
              name="For item"
              leading={<CornerDownRight className="size-3.5" />}
              label={item ? item.description : "For an item"}
              set={!!item}
              value={itemId}
              onChange={setItemId}
              contentClassName="w-80"
              options={[{ value: NONE, label: "No item" }, ...items.map((i) => ({ value: String(i.id), label: <span className="line-clamp-2">{i.description}</span> }))]}
            />
          )}
          {isLabor && (
            <>
              <ChipMenu
                id="wo-line-tech"
                name="Technician"
                leading={techName ? <PersonAvatar name={techName} size="xs" className="-ml-0.5 size-4" /> : <UserRound className="size-3.5" />}
                label={techName ?? "Technician"}
                set={!!techName}
                value={technician}
                onChange={setTechnician}
                options={[
                  { value: NONE, label: "Not recorded" },
                  ...technicianOptions.map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}` })),
                  // Who did the work stays named after they leave or lose the role: the server
                  // keeps them on the line, it only refuses naming them on a new one.
                  ...(editing?.technician && !technicianOptions.some((m) => m.id === editing.technician!.id)
                    ? [{ value: String(editing.technician.id), label: `${editing.technician.name ?? "Former technician"} (no longer a technician)` }]
                    : []),
                ]}
              />
              <DateChip id="wo-line-day" name="Day" empty="No day" value={workedOn} onChange={setWorkedOn} />
            </>
          )}
          {kind === "part" && (
            <>
              <ChipMenu
                id="wo-line-status"
                name="Part status"
                leading={<PackageCheck className="size-3.5" />}
                label={partStatus === NONE ? "Status" : PART_STATUS_LABEL[partStatus]}
                set={partStatus !== NONE}
                value={partStatus}
                onChange={setPartStatus}
                options={[{ value: NONE, label: "Not tracked" }, ...Object.entries(PART_STATUS_LABEL).map(([value, label]) => ({ value, label }))]}
              />
              {/* Murray's parts list: the order date and the expected arrival, once it is on order. */}
              {(partStatus !== NONE || orderedOn) && (
                <DateChip id="wo-line-ordered" name="Ordered" prefix="Ordered " empty="Ordered" value={orderedOn} onChange={setOrderedOn} />
              )}
              {(partStatus === "ordered" || expectedOn) && (
                <DateChip id="wo-line-expected" name="Expected" prefix="Expected " empty="Expected" value={expectedOn} onChange={setExpectedOn} />
              )}
            </>
          )}
          {(mayPrice || !!discountBps) && (
            <DiscountChip
              value={discount}
              onChange={setDiscount}
              bps={discountBps}
              invalid={errors.discount}
              disabled={!mayPrice}
            />
          )}
          <ChipMenu
            id="wo-line-tax"
            name="Sales tax"
            leading={<Landmark className="size-3.5" />}
            label={taxable === RULE ? "Tax by rule" : taxable === "yes" ? "Taxable" : "Not taxable"}
            set={taxable !== RULE}
            value={taxable}
            onChange={setTaxable}
            disabled={!mayPrice}
            options={[
              { value: RULE, label: "Tax by rule", hint: "The organization's rule for this kind of line." },
              { value: "yes", label: "Taxable" },
              { value: "no", label: "Not taxable" },
            ]}
          />
          <ChipMenu
            id="wo-line-billing"
            name="Billing"
            leading={<CircleDollarSign className="size-3.5" />}
            label={billable ? "Billed" : "No charge"}
            set={!billable}
            value={billable ? "billed" : "free"}
            onChange={(v) => setBillable(v === "billed")}
            disabled={!mayPrice}
            options={[
              { value: "billed", label: "Billed", hint: "On the customer's invoice." },
              { value: "free", label: "No charge", hint: "Warranty or shop time: kept on the job, never billed." },
            ]}
          />
        </div>
        {taxable === "yes" && noTaxRate && (
          <p className="text-xs text-muted-foreground" data-testid="wo-line-no-tax-rate">
            There is no sales tax rate yet, so a taxable line cannot be invoiced.{" "}
            <Link to="/settings" search={{ tab: "sales-tax" } as never} className="font-medium text-foreground underline-offset-2 hover:underline">
              Set a sales tax rate
            </Link>
          </p>
        )}
        {showErrors && invalid && (
          <p className="text-xs text-destructive">
            {errors.description
              ? "Say what the line is for."
              : errors.hours
                ? "Hours are a number up to 1,666, like 1.5."
                : errors.rate
                  ? mayPrice
                    ? "Give the labor a rate, or set the shop rate in Settings, Shop rates."
                    : NO_RATE_FOR_TECH
                  : errors.qty
                    ? "The quantity is a whole number."
                    : errors.markup
                      ? "The markup is a percentage from 0 to 1000, like 15."
                      : errors.tooBig
                        ? "A line can be at most $999,999.99."
                        : errors.discount
                          ? "A discount is a percentage from 0 to 100, like 10."
                        : "Give the line a price, or a cost to mark up."}
          </p>
        )}
      </div>
    </ResponsiveModal>
  );
}

const PART_STATUS_LABEL: Record<string, string> = {
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
  returned: "Returned",
  unused: "Unused",
};

/** A discount off the whole line, typed as a percentage in a small popover. */
function DiscountChip({
  value,
  onChange,
  bps,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  bps: number | null | undefined;
  invalid: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const label = bps ? `${bps / 100}% off` : "Discount";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <ChipButton id="wo-line-discount-chip" leading={<Percent className="size-3.5" />} set={!!bps || invalid} aria-label={`Discount: ${bps ? label : invalid ? "not a percentage" : "none"}`}>
          {invalid ? "Discount?" : label}
        </ChipButton>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" align="start">
        <label htmlFor="wo-line-discount" className="text-sm font-medium">
          Discount
        </label>
        <div className="relative">
          <Input
            id="wo-line-discount"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="0"
            className="pr-7 tnum"
            aria-invalid={value.trim() !== "" && invalid}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {invalid ? "A percentage from 0 to 100, like 10." : "Off the whole line, before tax. At 100% the line still shows, at $0.00."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
