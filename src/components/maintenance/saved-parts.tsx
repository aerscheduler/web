/**
 * The shop's saved parts (Murray Aviation, 2026-11-18): oil, filters, gaskets and the rest a shop
 * uses every week, saved so a technician picks one onto a job instead of typing it again. Murray
 * had typed the same 20W-50 three ways at three prices, the markup forgotten once.
 *
 * Every shop role reads the list and saves a part. Changing a part, archiving one and the
 * past-jobs import need "Shop pricing": admins, and a lead technician an admin gives it to under
 * People, Permissions. The server holds every rule; this only stops offering what it refuses.
 */
import * as React from "react";
import { Archive, ArchiveRestore, Box, CircleDollarSign, Droplet, Package, Plus, Receipt, Truck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateShopPart, useImportShopParts, useShopPartSuggestions, useShopParts, useUpdateShopPart } from "@/features/queries";
import type { ShopPart, ShopPartCategory, ShopPartInput, ShopPartSuggestion } from "@/types/api";
import { useCanPriceShopWork } from "@/lib/use-shop-pricing";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { formatMoney } from "@/lib/utils";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableRow } from "@/components/list-table";
import { EmptyState, ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import { MoneyInput } from "@/components/money-input";
import { useMoneyFieldsValid } from "@/hooks/use-money-fields-valid";
import { Field } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KINDS: { value: ShopPartCategory; label: string; icon: typeof Package }[] = [
  { value: "part", label: "Parts", icon: Package },
  { value: "supply", label: "Shop supplies", icon: Droplet },
  { value: "outside_service", label: "Outside work", icon: Truck },
  { value: "freight", label: "Freight and shipping", icon: Box },
  { value: "fee", label: "Fees", icon: Receipt },
  { value: "other", label: "Other", icon: CircleDollarSign },
];
const KIND_ONE: Record<ShopPartCategory, string> = {
  part: "Part",
  supply: "Shop supplies",
  outside_service: "Outside work",
  freight: "Freight and shipping",
  fee: "Fee",
  other: "Other",
};
/** Kinds priced from a cost plus the job's markup; the rest have nothing but a price. */
const marksUp = (k: ShopPartCategory) => k === "part" || k === "outside_service";

/** What a pick charges, in words: a fixed price, or the cost plus the job's markup. */
export function shopPartPriceLabel(p: Pick<ShopPart, "costCents" | "priceCents">): string {
  if (p.priceCents != null) return `${formatMoney(p.priceCents)} each`;
  if (p.costCents != null) return `Cost ${formatMoney(p.costCents)} plus the job's markup`;
  return "Not priced";
}

const COLUMNS: ListTableColumn[] = [
  { id: "partNumber", header: "Part number", width: "9rem" },
  { id: "vendor", header: "Vendor", width: "10rem" },
  { id: "price", header: "Price", width: "13rem" },
  { id: "used", header: "Used", width: "4.5rem", align: "end", narrow: "keep" },
];

export function SavedParts({
  q,
  newOpen,
  onNewOpenChange,
}: {
  q?: string;
  /** "Save a part" in the page header. */
  newOpen: boolean;
  onNewOpenChange: (open: boolean) => void;
}) {
  const mayPrice = useCanPriceShopWork();
  const [showArchived, setShowArchived] = React.useState(false);
  const partsQ = useShopParts({ q, archived: showArchived });
  const suggestionsQ = useShopPartSuggestions({ enabled: mayPrice && !showArchived });
  const [editing, setEditing] = React.useState<ShopPart | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const update = useUpdateShopPart();
  const suggestions = suggestionsQ.data ?? [];

  async function setArchived(part: ShopPart, archived: boolean) {
    try {
      await update.mutateAsync({ id: part.id, archived });
      toast.success(archived ? `${part.name} archived` : `${part.name} is back on the list`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change that part");
    }
  }

  const toolbar = (
    <>
      <Button variant={showArchived ? "secondary" : "ghost"} size="sm" onClick={() => setShowArchived((v) => !v)}>
        <Archive className="size-4" /> {showArchived ? "Showing archived" : "Archived"}
      </Button>
      {mayPrice && !showArchived && suggestions.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>
          <Wand2 className="size-4" /> Add from past jobs ({suggestions.length})
        </Button>
      )}
    </>
  );

  const modals = (
    <>
      <ShopPartModal open={newOpen || editing != null} part={editing} onOpenChange={(o) => {
        if (!o) {
          setEditing(null);
          onNewOpenChange(false);
        }
      }} />
      {mayPrice && <ImportPartsModal open={importOpen} onOpenChange={setImportOpen} suggestions={suggestions} />}
    </>
  );

  if (partsQ.isLoading) {
    return <ListTableSkeleton fill columns={COLUMNS} narrowAt={720} groups={2} rows={4} className="mb-4 min-h-0 flex-1" />;
  }
  if (partsQ.error) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col p-0">
        <ErrorState error={partsQ.error} onRetry={() => void partsQ.refetch()} />
      </Card>
    );
  }

  const parts = partsQ.data ?? [];
  if (parts.length === 0) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col p-0" data-testid="saved-parts-empty">
        <EmptyState
          icon={Package}
          title={q ? "No matches" : showArchived ? "Nothing archived" : "No saved parts yet"}
          body={
            q
              ? "No saved part matches that name, part number or vendor."
              : showArchived
                ? "Archived parts show here. They cannot be picked onto a job."
                : "Save the oil, filters, gaskets and fees you use every week, then pick them onto a job instead of typing them."
          }
          docs={q || showArchived ? undefined : "saved-parts"}
          action={
            q ? undefined : showArchived ? (
              <Button variant="outline" onClick={() => setShowArchived(false)}>
                Back to saved parts
              </Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {mayPrice && suggestions.length > 0 && (
                  <Button onClick={() => setImportOpen(true)}>
                    <Wand2 className="size-4" /> Add {suggestions.length} from past jobs
                  </Button>
                )}
                <Button variant={mayPrice && suggestions.length > 0 ? "outline" : "default"} onClick={() => onNewOpenChange(true)}>
                  <Plus className="size-4" /> Save a part
                </Button>
              </div>
            )
          }
        />
        {modals}
      </Card>
    );
  }

  const groups = KINDS.map((k) => ({ ...k, items: parts.filter((p) => p.category === k.value) })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <ListTable
        fill
        label="Saved parts"
        docShot="saved-parts"
        className="min-h-0"
        columns={COLUMNS}
        toolbar={toolbar}
        showHeader
        titleHeader="Part"
        narrowAt={720}
        groups={groups.map((g) => ({
          id: g.value,
          label: g.label,
          marker: <g.icon className="size-3.5 text-muted-foreground" aria-hidden />,
          count: g.items.length,
          rows: g.items.map(
            (p): ListTableRow => ({
              id: `part-${p.id}`,
              testId: `saved-part-row-${p.id}`,
              label: p.name,
              title: p.name,
              subtitle: p.notes ?? undefined,
              tags: p.taxable != null ? <ListTag>{p.taxable ? "Taxable" : "Not taxable"}</ListTag> : undefined,
              dim: p.archivedAt != null,
              onOpen: mayPrice ? () => setEditing(p) : undefined,
              actions: mayPrice ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={p.archivedAt ? `Bring back ${p.name}` : `Archive ${p.name}`}
                  title={p.archivedAt ? "Bring back" : "Archive"}
                  disabled={update.isPending}
                  onClick={() => void setArchived(p, p.archivedAt == null)}
                >
                  {p.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                </Button>
              ) : undefined,
              cells: {
                partNumber: p.partNumber ? <span className="font-mono text-xs">{p.partNumber}</span> : <span className="text-muted-foreground">None</span>,
                vendor: p.vendor ?? <span className="text-muted-foreground">None</span>,
                price: <span className="tnum">{shopPartPriceLabel(p)}</span>,
                used: <span className="tnum text-muted-foreground">{p.timesUsed}</span>,
              },
            })
          ),
        }))}
      />
      {!mayPrice && (
        <p className="mt-2 text-xs text-muted-foreground">
          You can save new parts. Changing a saved part's price, or archiving one, needs Shop pricing: ask an admin.
        </p>
      )}
      {modals}
    </div>
  );
}

const RULE = "rule";

/** Add a saved part, or change one (Shop pricing). */
export function ShopPartModal({ open, onOpenChange, part }: { open: boolean; onOpenChange: (open: boolean) => void; part: ShopPart | null }) {
  const mayPrice = useCanPriceShopWork();
  const create = useCreateShopPart();
  const update = useUpdateShopPart();
  const once = useSubmitOnce(open);
  const money = useMoneyFieldsValid();
  const [category, setCategory] = React.useState<ShopPartCategory>("part");
  const [name, setName] = React.useState("");
  const [partNumber, setPartNumber] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [cost, setCost] = React.useState<number | undefined>(undefined);
  const [price, setPrice] = React.useState<number | undefined>(undefined);
  const [taxable, setTaxable] = React.useState<string>(RULE);
  const [notes, setNotes] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCategory(part?.category ?? "part");
    setName(part?.name ?? "");
    setPartNumber(part?.partNumber ?? "");
    setVendor(part?.vendor ?? "");
    setCost(part?.costCents ?? undefined);
    setPrice(part?.priceCents ?? undefined);
    setTaxable(part?.taxable == null ? RULE : part.taxable ? "yes" : "no");
    setNotes(part?.notes ?? "");
    setShowErrors(false);
  }, [open, part]);

  const fromCost = marksUp(category);
  //Somebody without Shop pricing saves a part at the shop's pricing: a cost to mark up, or a
  //price for the kinds that have nothing but a price. The server's rule.
  const priceAllowed = mayPrice || !fromCost;
  const errors = {
    name: !name.trim(),
    price: fromCost ? cost == null && price == null : price == null,
  };
  const invalid = errors.name || errors.price;
  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!money.allValid) return;
    if (invalid) {
      setShowErrors(true);
      return;
    }
    if (!once.begin()) return;
    const body: ShopPartInput = {
      category,
      name: name.trim(),
      partNumber: partNumber.trim() || null,
      vendor: vendor.trim() || null,
      notes: notes.trim() || null,
      costCents: fromCost ? cost ?? null : null,
      ...(priceAllowed ? { priceCents: price ?? null } : {}),
      ...(mayPrice ? { taxable: taxable === RULE ? null : taxable === "yes" } : {}),
    };
    try {
      if (part) await update.mutateAsync({ id: part.id, ...body });
      else await create.mutateAsync(body);
      toast.success(part ? "Saved part changed" : "Part saved");
      onOpenChange(false);
    } catch (e) {
      once.fail();
      toast.error(e instanceof Error ? e.message : "Couldn't save the part");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={part ? "Edit saved part" : "Save a part"}
      description={part ? "Jobs already priced keep their lines as they are." : "Pick it onto any job afterwards, instead of typing it."}
      dataDocShot={part ? undefined : "saved-part-new"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !money.allValid}>
            {pending ? "Saving…" : part ? "Save" : "Save part"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Name" htmlFor="shop-part-name">
            <Input id="shop-part-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Phillips Victory 20W-50" aria-invalid={showErrors && errors.name} autoFocus={!part} />
          </Field>
          <Field label="Kind" htmlFor="shop-part-kind">
            <Select value={category} onValueChange={(v) => setCategory(v as ShopPartCategory)}>
              <SelectTrigger id="shop-part-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {KIND_ONE[k.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Part number" htmlFor="shop-part-pn" hint="One saved part per number.">
            <Input id="shop-part-pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} maxLength={40} placeholder="20W-50" className="font-mono" />
          </Field>
          <Field label="Vendor" htmlFor="shop-part-vendor">
            <Input id="shop-part-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={80} placeholder="Aircraft Spruce" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {fromCost && (
            <Field label="Cost each" htmlFor="shop-part-cost" hint="What the shop pays. Marked up by the job's markup when picked.">
              <MoneyInput id="shop-part-cost" cents={cost} onCentsChange={setCost} onClear={() => setCost(undefined)} onValidityChange={money.report("cost")} />
            </Field>
          )}
          <Field
            label={fromCost ? "Fixed price each (optional)" : "Price each"}
            htmlFor="shop-part-price"
            hint={
              !priceAllowed
                ? "Needs Shop pricing. The job's markup prices it from the cost."
                : fromCost
                  ? "Leave empty to charge the cost plus the job's markup."
                  : undefined
            }
          >
            <MoneyInput id="shop-part-price" cents={price} onCentsChange={setPrice} onClear={() => setPrice(undefined)} onValidityChange={money.report("price")} disabled={!priceAllowed} />
          </Field>
        </div>
        {mayPrice && (
          <Field label="Sales tax" htmlFor="shop-part-tax">
            <Select value={taxable} onValueChange={setTaxable}>
              <SelectTrigger id="shop-part-tax" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RULE} description="The organization's rule for this kind of line.">
                  Tax by rule
                </SelectItem>
                <SelectItem value="yes">Taxable</SelectItem>
                <SelectItem value="no">Not taxable</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Notes" htmlFor="shop-part-notes">
          <Input id="shop-part-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="Sold by the quart" />
        </Field>
        {showErrors && invalid && (
          <p className="text-xs text-destructive">
            {errors.name ? "Name the part." : fromCost ? "Give it a cost, or a fixed price." : "Give it a price each."}
          </p>
        )}
      </div>
    </ResponsiveModal>
  );
}

/** The one-time start: parts already used on jobs, ticked, saved in one go. */
function ImportPartsModal({ open, onOpenChange, suggestions }: { open: boolean; onOpenChange: (open: boolean) => void; suggestions: ShopPartSuggestion[] }) {
  const importParts = useImportShopParts();
  const once = useSubmitOnce(open);
  const keyOf = (s: ShopPartSuggestion) => `${s.partNumber ?? ""}|${s.name}`;
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (open) setChosen(new Set(suggestions.map(keyOf)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    const parts = suggestions.filter((s) => chosen.has(keyOf(s)));
    if (!parts.length || !once.begin()) return;
    try {
      const out = await importParts.mutateAsync(
        parts.map((s) => ({ category: s.category, name: s.name, partNumber: s.partNumber, vendor: s.vendor, costCents: s.costCents, priceCents: s.priceCents, taxable: s.taxable }))
      );
      toast.success(`${out.created.length} part${out.created.length === 1 ? "" : "s"} saved${out.skipped ? `, ${out.skipped} already on the list` : ""}`);
      onOpenChange(false);
    } catch (e) {
      once.fail();
      toast.error(e instanceof Error ? e.message : "Couldn't save those parts");
    }
  }

  const all = chosen.size === suggestions.length;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Add parts from past jobs"
      description="Every part already used on a job and not saved yet, with the latest cost or price. Untick any you do not want."
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setChosen(all ? new Set() : new Set(suggestions.map(keyOf)))}>
            {all ? "Untick all" : "Tick all"}
          </Button>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importParts.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={importParts.isPending || chosen.size === 0}>
              {importParts.isPending ? "Saving…" : `Save ${chosen.size} part${chosen.size === 1 ? "" : "s"}`}
            </Button>
          </span>
        </div>
      }
    >
      <ul className="divide-y divide-border rounded-md border border-border" data-testid="import-parts-list">
        {suggestions.map((s) => {
          const k = keyOf(s);
          return (
            <li key={k}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={chosen.has(k)}
                  onCheckedChange={(v) =>
                    setChosen((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(k);
                      else next.delete(k);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[KIND_ONE[s.category], s.partNumber, s.vendor, `used ${s.timesUsed} time${s.timesUsed === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs tnum text-muted-foreground">{shopPartPriceLabel(s)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </ResponsiveModal>
  );
}
