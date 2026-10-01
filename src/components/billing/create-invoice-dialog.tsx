import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useBilling, useCreateInvoice, useInvoicePreview, useMembers } from "@/features/queries";
import { memberEmail } from "@/components/people/util";
import type { CreateInvoiceInput, InvoiceLineCategory, InvoicePreview } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { LINE_CATEGORY_OPTIONS, percentLabel } from "@/lib/sales-tax";
import { DocsHint } from "@/components/docs-hint";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { priceWithServiceFee } from "@/lib/service-fee";
import { formatMoney, cn } from "@/lib/utils";

type LineRow = {
  key: number;
  name: string;
  qty: string;
  unitPrice: number;
  /** What the line is. Decides, with the school's rules, whether it is taxed. */
  category: InvoiceLineCategory;
  /** Null follows the school's rule for the category; true/false is this person's call. */
  taxable: boolean | null;
};

export type InvoiceDraft = {
  customerId?: string;
  memo?: string;
  items?: { name: string; qty: number; unitPrice: number }[];
};

let nextKey = 1;
function blankRow(): LineRow {
  return { key: nextKey++, name: "", qty: "1", unitPrice: 0, category: "other", taxable: null };
}

function looksLikeEmail(v: string): boolean {
  // Enough to catch an obvious typo before the server does. Not RFC-strict.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Create a custom invoice: pick a member or a guest (name + email), add line items,
 * set a memo and optional due date.
 *
 * Guest recipients used to be iPhone-only. The API has always accepted
 * `{ guest: { name, email } }` on `POST /invoices`; the console only offered members.
 */
export function CreateInvoiceDialog({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional prefill (e.g. billing an unbilled flight). */
  draft?: InvoiceDraft;
}) {
  const members = useMembers();
  const create = useCreateInvoice();
  const qc = useQueryClient();
  // `GET /organizations/billing` is isOrgUser(), so every role that can reach this dialog
  // can read the fee. While it loads there is no fee line and the total is the subtotal,
  // which is the old behaviour rather than a wrong new one.
  const billing = useBilling();

  const [guestMode, setGuestMode] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [memo, setMemo] = useState("");
  const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
  const [rows, setRows] = useState<LineRow[]>([blankRow()]);
  // The Taxable tick on the service fee line the server adds. Null follows the Fees rule.
  const [feeTaxable, setFeeTaxable] = useState<boolean | null>(null);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = useState(false);

  // Reset the form each time the modal opens, applying any draft prefill.
  useEffect(() => {
    if (!open) return;
    setGuestMode(false);
    setCustomerId(draft?.customerId ?? "");
    setGuestName("");
    setGuestEmail("");
    setMemo(draft?.memo ?? "");
    setDueAt(undefined);
    setFeeTaxable(null);
    setRows(
      draft?.items?.length
        ? draft.items.map((it) => ({
            key: nextKey++,
            name: it.name,
            qty: String(it.qty),
            unitPrice: it.unitPrice,
            category: "other" as const,
            taxable: null,
          }))
        : [blankRow()]
    );
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options: ComboOption[] = useMemo(
    () =>
      (members.data ?? [])
        .map((ou) => ({
          value: String(ou.id),
          label: ou.user?.name ?? `Member #${ou.id}`,
          //An aircraft owner's login is a placeholder; show where the invoice will go.
          hint: memberEmail(ou) ?? (ou.external ? "Aircraft owner, no email recorded" : undefined),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members.data]
  );

  // Whole numbers only: the quantity column is an integer, and the server refuses 1.5
  // rather than bill it. Hours go in the description and the amount in the price. A bad
  // quantity is shown as an error on its row, never quietly rewritten (1.5 once became 15).
  const qtyIsValid = (qty: string) => {
    const q = Number(qty);
    return qty.trim() !== "" && Number.isInteger(q) && q > 0 && q <= 99;
  };
  const validRows = rows.filter((r) => r.name.trim() && qtyIsValid(r.qty));

  const lines: CreateInvoiceInput["items"] = validRows.map((r) => ({
    name: r.name.trim(),
    qty: Number(r.qty),
    unitPrice: r.unitPrice,
    category: r.category,
    ...(r.taxable != null ? { taxable: r.taxable } : {}),
  }));

  // THE SERVER PRICES THE BILL: the school's service fee, its sales tax rules and the
  // customer's exemption all live there, so this dialog asks rather than keeping a copy of
  // the rules. Until a recipient is chosen it prices as a guest (who is never exempt); the
  // preview writes nothing, so the placeholder never goes anywhere. Keyed by a string so
  // the debounce settles instead of restarting on every render.
  const recipient: Pick<CreateInvoiceInput, "customer" | "guest"> =
    !guestMode && customerId
      ? { customer: { id: Number(customerId) } }
      : {
          guest: {
            name: guestMode && guestName.trim() ? guestName.trim() : "Preview",
            email: guestMode && looksLikeEmail(guestEmail) ? guestEmail.trim() : "preview@example.invalid",
          },
        };
  // Nothing to price until the lines are worth more than the server's 50-cent floor: a line
  // still being typed must not answer with a red "must be greater than 50 cents".
  const typedSubtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const pricingKey =
    open && lines.length && typedSubtotal > 50
      ? JSON.stringify({ ...recipient, items: lines, ...(feeTaxable != null ? { serviceFeeTaxable: feeTaxable } : {}) })
      : "";
  const settledKey = useDebouncedValue(pricingKey, 300);
  const previewInput = useMemo(
    () => (settledKey ? (JSON.parse(settledKey) as CreateInvoiceInput) : null),
    [settledKey]
  );
  const preview = useInvoicePreview(previewInput);
  const priced = settledKey === pricingKey && !preview.isFetching ? preview.data : undefined;
  const shown = pricingKey ? preview.data : undefined;
  const previewError =
    preview.error instanceof Error &&
    settledKey === pricingKey &&
    !(preview.error instanceof ApiError && (preview.error.status === 404 || preview.error.status === 405))
      ? preview.error.message
      : null;
  // Whether the school taxes at all, remembered from the last answer that came back: a
  // preview that fails (for example "untick Taxable on these lines") must not take the very
  // ticks it is asking about off the screen.
  const lastGood = useRef<InvoicePreview | null>(null);
  if (preview.data) lastGood.current = preview.data;
  const taxConfigured = (shown?.salesTaxConfigured ?? lastGood.current?.salesTaxConfigured) === true;
  // A priced line for a row: from this answer, or when pricing failed, from the last answer
  // that priced the same line, so a tick the rule set does not read as unticked.
  const pricedLineFor = (r: LineRow) => {
    const idx = validRows.indexOf(r);
    if (shown && idx >= 0) return shown.lines[idx] ?? null;
    return (
      lastGood.current?.lines.find(
        (l) =>
          !l.isServiceFee &&
          l.name === r.name.trim() &&
          l.qty === Number(r.qty) &&
          l.unitPrice === r.unitPrice &&
          l.category === r.category
      ) ?? null
    );
  };
  // Refused as it stands (a taxed charge to an account balance): the lines are still priced,
  // so the ticks stay on screen next to the reason.
  const refusal = shown?.refusal ?? null;
  // Nothing is sent until the figure on screen is the server's figure for exactly these
  // lines. During the debounce and the request the Total is the previous answer, and a bill
  // raised then would be priced by nobody who looked at it.
  // A server without the preview route (the console shipped before the API) must not lock
  // every school out of New invoice: the create still validates and prices the bill.
  const previewMissing = preview.error instanceof ApiError && (preview.error.status === 404 || preview.error.status === 405);
  const pricing = !!pricingKey && !priced && !previewMissing;
  // A described line whose quantity is not a whole number from 1 to 99 is NOT quietly left off
  // the bill: the form refuses to send until it is fixed.
  const badQtyRow = rows.find((r) => r.name.trim() && !qtyIsValid(r.qty)) ?? null;
  const exemption = !guestMode && customerId ? shown?.exemption ?? null : null;

  // Priced off `validRows` rather than every row, because `validRows` is exactly what
  // submit() sends. A half-typed line is not on the bill, so it must not be in the total.
  // This local figure only covers the moment before the server's answer arrives.
  const local = priceWithServiceFee(
    validRows.map((r) => ({ name: r.name, qty: Number(r.qty), unitPrice: r.unitPrice })),
    billing.data
  );
  const feeLine = shown?.lines.find((l) => l.isServiceFee) ?? null;
  // The fee's own Taxable tick survives a failed pricing, like the line ticks: the failure may
  // be the very thing it asks the desk to untick.
  const feeLineForTick = feeLine ?? lastGood.current?.lines.find((l) => l.isServiceFee) ?? null;
  const subtotal = shown ? shown.subtotal - (feeLine ? feeLine.qty * feeLine.unitPrice : 0) : local.subtotal;
  const fee = shown ? (feeLine ? { name: feeLine.name, unitPrice: feeLine.qty * feeLine.unitPrice, taxCents: feeLine.taxCents } : null) : local.fee;
  const total = shown ? shown.total : local.total;
  const lastRowIsDescribed = (rows[rows.length - 1]?.name ?? "").trim().length > 0;

  const customerError = !guestMode && !customerId;
  const guestNameError = guestMode && !guestName.trim();
  const guestEmailError =
    guestMode && (!guestEmail.trim() || !looksLikeEmail(guestEmail));
  const recipientError = customerError || guestNameError || guestEmailError;
  const itemsError = validRows.length === 0;

  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    if (create.isPending || pricing || refusal) return;
    if (badQtyRow) {
      setShowErrors(true);
      document.getElementById(`invoice-qty-${badQtyRow.key}`)?.focus();
      return;
    }
    if (recipientError || itemsError) {
      setShowErrors(true);
      if (guestMode) {
        document.getElementById(guestNameError ? "invoice-guest-name" : "invoice-guest-email")?.focus();
      } else if (customerError) {
        document.getElementById("invoice-customer")?.focus();
      } else {
        document.getElementById("invoice-item-0")?.focus();
      }
      return;
    }
    const dueIn = dueAt
      ? Math.max(1, Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000))
      : undefined;
    const input: CreateInvoiceInput = {
      ...(guestMode
        ? { guest: { name: guestName.trim(), email: guestEmail.trim() } }
        : { customer: { id: Number(customerId) } }),
      memo: memo.trim() || undefined,
      dueAt: dueAt ? dueAt.toISOString() : undefined,
      dueIn,
      items: lines,
      ...(feeTaxable != null ? { serviceFeeTaxable: feeTaxable } : {}),
      // What the person is looking at. If a tax rate or the customer's exemption moved
      // since it was priced, the server refuses rather than raise a different bill.
      ...(priced ? { expectedTotal: priced.total } : {}),
    };
    create.mutate(input, {
      onSuccess: (invoice) => {
        toast.success(
          typeof invoice?.total === "number" ? `Invoice created for ${formatMoney(invoice.total)}` : "Invoice created"
        );
        onOpenChange(false);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          qc.invalidateQueries({ queryKey: ["invoicePreview"] });
        }
        toast.error(err instanceof Error ? err.message : "Couldn't create invoice");
      },
    });
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending || pricing || !!refusal}>
              {create.isPending ? "Creating…" : pricing && !previewError ? "Pricing…" : "Create invoice"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="New invoice"
      description="Bill a customer for time, fuel, fees, or anything else."
      className="sm:max-w-lg"
    >
      <div className="space-y-4" data-doc-shot="create-invoice-dialog">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="invoice-guest-mode" className="cursor-pointer">
              Guest recipient
            </Label>
            <p className="text-xs text-muted-foreground">
              Bill someone who is not a member, by name and email. Stripe emails them a pay link.
            </p>
          </div>
          <Switch
            id="invoice-guest-mode"
            checked={guestMode}
            onCheckedChange={(v) => {
              setGuestMode(v);
              setShowErrors(false);
            }}
          />
        </div>

        {guestMode ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-guest-name">Name</Label>
              <Input
                id="invoice-guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Jordan Guest"
                aria-invalid={showErrors && guestNameError}
              />
              {showErrors && guestNameError && (
                <p className="text-xs text-destructive">Enter a name.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-guest-email">Email</Label>
              <Input
                id="invoice-guest-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="jordan@example.com"
                aria-invalid={showErrors && !!guestEmailError}
              />
              {showErrors && guestEmailError && (
                <p className="text-xs text-destructive">
                  {guestEmail.trim() ? "Enter a valid email." : "Enter an email."}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="invoice-customer">Customer</Label>
            <Combobox
              id="invoice-customer"
              options={options}
              value={customerId}
              onChange={setCustomerId}
              placeholder={members.isLoading ? "Loading members…" : "Select a customer"}
              searchPlaceholder="Search members…"
              emptyText="No members found."
              invalid={showErrors && !!customerError}
            />
            {showErrors && customerError && (
              <p className="text-xs text-destructive">Select a customer.</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Label>Line items</Label>
              {taxConfigured && <DocsHint topic="invoice-sales-tax" />}
            </span>
            <span className="text-xs text-muted-foreground">Whole-number qty × unit price</span>
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={r.key}
                className="rounded-lg border border-border p-2 sm:flex sm:flex-wrap sm:items-start sm:gap-2 sm:rounded-none sm:border-0 sm:p-0"
              >
                <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
                  <span className="text-xs font-medium text-muted-foreground">
                    Item {i + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line item"
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    className="size-7 text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <Input
                  id={`invoice-item-${i}`}
                  aria-label="Item description"
                  placeholder="Description"
                  value={r.name}
                  onChange={(e) => updateRow(r.key, { name: e.target.value })}
                  className="w-full sm:flex-1"
                  aria-invalid={showErrors && itemsError}
                />

                <div className="mt-2 flex items-start gap-2 sm:mt-0 sm:contents">
                  <Input
                    aria-label="Quantity"
                    inputMode="numeric"
                    placeholder="Qty"
                    value={r.qty}
                    onChange={(e) =>
                      updateRow(r.key, { qty: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) })
                    }
                    className="w-16 tnum"
                    id={`invoice-qty-${r.key}`}
                    aria-invalid={!!r.name.trim() && !qtyIsValid(r.qty)}
                    aria-describedby={r.name.trim() && !qtyIsValid(r.qty) ? `invoice-qty-error-${r.key}` : undefined}
                  />
                  <div className="flex-1 sm:w-28 sm:flex-none">
                    <MoneyInput
                      cents={r.unitPrice}
                      onCentsChange={(cents) => updateRow(r.key, { unitPrice: cents })}
                    />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line item"
                        disabled={rows.length === 1}
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        className="hidden text-muted-foreground sm:inline-flex"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove line item</TooltipContent>
                  </Tooltip>
                </div>

                {((r.qty !== "" && !qtyIsValid(r.qty)) || (showErrors && r.name.trim() && !qtyIsValid(r.qty))) && (
                  <p id={`invoice-qty-error-${r.key}`} className="mt-1 text-xs text-destructive sm:basis-full">
                    Whole numbers from 1 to 99. For 1.5 hours, put the hours in the description and the amount in the price.
                  </p>
                )}

                <LineTaxControls
                  row={r}
                  index={i}
                  priced={pricedLineFor(r)}
                  taxConfigured={taxConfigured}
                  exempt={exemption != null}
                  onChange={(patch) => updateRow(r.key, patch)}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!lastRowIsDescribed}
              onClick={() => setRows((rs) => [...rs, blankRow()])}
            >
              <Plus className="size-4" /> Add line item
            </Button>
            {!lastRowIsDescribed && (
              <span className="text-xs text-muted-foreground">
                Describe item {rows.length} first.
              </span>
            )}
          </div>

          {showErrors && itemsError && (
            <p className="text-xs text-destructive">
              Add at least one line item with a description and quantity.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invoice-memo">Memo</Label>
          <Textarea
            id="invoice-memo"
            placeholder="Optional note shown on the invoice"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Due date</Label>
          <Popover open={duePickerOpen} onOpenChange={setDuePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start gap-2 font-normal",
                  !dueAt && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="size-4 shrink-0 opacity-70" />
                {dueAt ? format(dueAt, "MMM d, yyyy") : "No due date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueAt}
                onSelect={(d) => {
                  setDueAt(d);
                  setDuePickerOpen(false);
                }}
                autoFocus
              />
              {dueAt && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setDueAt(undefined);
                      setDuePickerOpen(false);
                    }}
                  >
                    Clear due date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <Separator />

        {/*
          The fee and the sales tax are both added SERVER-side, so a dialog that totals only
          the typed lines shows the desk one number and bills the customer another. The
          figures below are the server's own preview (POST /invoices/preview); the local
          fee copy (lib/service-fee.ts) only fills the moment before it answers.
        */}
        {fee || (shown && shown.tax > 0) ? (
          <div className="space-y-1.5" data-testid="invoice-totals">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tnum">{formatMoney(subtotal)}</span>
            </div>
            {fee ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  {fee.name}
                  {taxConfigured && !exemption ? (
                    <label className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={feeTaxable ?? feeLineForTick?.taxable ?? false}
                        onCheckedChange={(v) => setFeeTaxable(v === true)}
                        aria-label="Charge sales tax on the service fee"
                      />
                      Taxable
                    </label>
                  ) : null}
                </span>
                <span className="tnum">{formatMoney(fee.unitPrice)}</span>
              </div>
            ) : null}
            {shown?.byRate.map((r) => (
              <div key={`${r.name}-${r.ratePpm}`} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {r.name} {percentLabel(r.ratePpm)}
                </span>
                <span className="tnum">{formatMoney(r.tax)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-semibold tnum" data-testid="invoice-total">
            {formatMoney(total)}
          </span>
        </div>

        {exemption ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="invoice-exemption">
            {exemption.printed}. No sales tax is charged on this invoice, and it says why.
          </p>
        ) : null}

        {refusal ? (
          <p className="text-xs text-destructive" role="status" data-testid="invoice-refusal">
            {refusal}
          </p>
        ) : null}

        {previewError ? (
          <div className="flex items-start justify-between gap-2 text-xs text-destructive" role="status">
            <p>{previewError}</p>
            <button type="button" className="shrink-0 underline" onClick={() => void preview.refetch()}>
              Try again
            </button>
          </div>
        ) : null}

        {fee ? (
          <p className="text-xs text-muted-foreground">
            Your organization adds {fee.name.toLowerCase()} to every invoice. Change it in
            Settings, Billing.
          </p>
        ) : null}

      </div>
    </ResponsiveModal>
  );
}

/**
 * What a line is, and whether it is taxed. The category is always asked (it also decides
 * where the line lands in QuickBooks); the Taxable tick only appears once the school has a
 * sales tax rate, starts from the school's rule for the category (as priced by the server),
 * and becomes this person's own call the moment they touch it.
 */
function LineTaxControls({
  row,
  index,
  priced,
  taxConfigured,
  exempt,
  onChange,
}: {
  row: LineRow;
  index: number;
  priced: { taxable: boolean; taxCents: number } | null;
  taxConfigured: boolean;
  exempt: boolean;
  onChange: (patch: Partial<LineRow>) => void;
}) {
  const taxed = row.taxable ?? priced?.taxable ?? false;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-0 sm:basis-full">
      <Select value={row.category} onValueChange={(v) => onChange({ category: v as InvoiceLineCategory, taxable: null })}>
        <SelectTrigger className="h-8 w-44 text-xs" aria-label={`What item ${index + 1} is`} id={`invoice-item-${index}-category`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LINE_CATEGORY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {taxConfigured && exempt ? (
        // No tick at all for an exempt customer: a greyed, unticked box reads as "not exempt".
        <span className="text-xs text-muted-foreground">Tax exempt</span>
      ) : taxConfigured ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={taxed}
            onCheckedChange={(v) => onChange({ taxable: v === true })}
            aria-label={`Charge sales tax on item ${index + 1}`}
          />
          Taxable
          {taxed && priced && priced.taxCents > 0 ? <span className="tnum">+{formatMoney(priced.taxCents)} tax</span> : null}
        </label>
      ) : null}
    </div>
  );
}
