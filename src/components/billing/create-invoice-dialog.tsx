import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateInvoice, useMembers } from "@/features/queries";
import type { CreateInvoiceInput } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMoney, cn } from "@/lib/utils";

type LineRow = { key: number; name: string; qty: string; unitPrice: number };

export type InvoiceDraft = {
  customerId?: string;
  memo?: string;
  items?: { name: string; qty: number; unitPrice: number }[];
};

let nextKey = 1;
function blankRow(): LineRow {
  return { key: nextKey++, name: "", qty: "1", unitPrice: 0 };
}

/** Create a custom invoice: pick a customer, add line items, set a memo and optional due date. */
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

  const [customerId, setCustomerId] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
  const [rows, setRows] = useState<LineRow[]>([blankRow()]);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = useState(false);

  // Reset the form each time the modal opens, applying any draft prefill.
  useEffect(() => {
    if (!open) return;
    setCustomerId(draft?.customerId ?? "");
    setMemo(draft?.memo ?? "");
    setDueAt(undefined);
    setRows(
      draft?.items?.length
        ? draft.items.map((it) => ({
            key: nextKey++,
            name: it.name,
            qty: String(it.qty),
            unitPrice: it.unitPrice,
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
          hint: ou.user?.email,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members.data]
  );

  const total = rows.reduce((sum, r) => {
    const qty = Number(r.qty);
    return sum + (Number.isFinite(qty) ? qty : 0) * r.unitPrice;
  }, 0);

  const validRows = rows.filter((r) => r.name.trim() && Number(r.qty) > 0);
  //Gates "Add line item": the row you'd be pushing down has to say what it is first.
  const lastRowIsDescribed = (rows[rows.length - 1]?.name ?? "").trim().length > 0;
  // Per-field validity, derived every render so inline messages clear as you fix them.
  const customerError = !customerId;
  const itemsError = validRows.length === 0;

  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    if (create.isPending) return;
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (customerError || itemsError) {
      setShowErrors(true);
      if (customerError) {
        document.getElementById("invoice-customer")?.querySelector("button")?.focus();
      } else {
        document.getElementById("invoice-item-0")?.focus();
      }
      return;
    }
    const dueIn = dueAt
      ? Math.max(1, Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000))
      : undefined;
    const input: CreateInvoiceInput = {
      customer: { id: Number(customerId) },
      memo: memo.trim() || undefined,
      dueAt: dueAt ? dueAt.toISOString() : undefined,
      dueIn,
      items: validRows.map((r) => ({
        name: r.name.trim(),
        qty: Number(r.qty),
        unitPrice: r.unitPrice,
      })),
    };
    create.mutate(input, {
      onSuccess: () => {
        toast.success("Invoice created");
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't create invoice"),
    });
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="New invoice"
      description="Bill a customer for time, fuel, fees, or anything else."
      className="sm:max-w-lg"
    >
      <div className="space-y-4" data-doc-shot="create-invoice-dialog">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-customer">Customer</Label>
          <div id="invoice-customer">
            <Combobox
              options={options}
              value={customerId}
              onChange={setCustomerId}
              placeholder={members.isLoading ? "Loading members…" : "Select a customer"}
              searchPlaceholder="Search members…"
              emptyText="No members found."
            />
          </div>
          {showErrors && customerError && (
            <p className="text-xs text-destructive">Select a customer.</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            <span className="text-xs text-muted-foreground">Qty × unit price</span>
          </div>

          <div className="space-y-2">
            {/* On a phone all four controls on one line squeezed the description down to
                a few characters — the field you actually type the most into. Below `sm`
                the description gets its own full-width line with qty/price/remove
                beneath it, and each item sits in its own bordered card so two items
                don't read as one run-on row. From `sm` up it stays the compact row. */}
            {rows.map((r, i) => (
              <div
                key={r.key}
                className="rounded-lg border border-border p-2 sm:flex sm:items-start sm:gap-2 sm:rounded-none sm:border-0 sm:p-0"
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
                    inputMode="decimal"
                    placeholder="Qty"
                    value={r.qty}
                    onChange={(e) =>
                      updateRow(r.key, { qty: e.target.value.replace(/[^0-9.]/g, "") })
                    }
                    className="w-16 tnum"
                  />
                  <div className="flex-1 sm:w-28 sm:flex-none">
                    <MoneyInput
                      cents={r.unitPrice}
                      onCentsChange={(cents) => updateRow(r.key, { unitPrice: cents })}
                    />
                  </div>
                  {/* The remove button lives in the mobile header above; from sm up it
                      belongs at the end of the row. */}
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
              </div>
            ))}
          </div>

          {/* Can't stack up blank rows: an unnamed line is an invoice line the customer
              can't read, and three empty rows above the one you're typing in is just
              noise. Disabled rather than hidden, with the reason said out loud — a
              control that vanishes is harder to understand than one that explains itself. */}
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

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-semibold tnum">{formatMoney(total)}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create invoice"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
