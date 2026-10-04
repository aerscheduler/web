import * as React from "react";
import type { DeskPayment, DeskPaymentMethod, Invoice } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { Field } from "@/components/settings/parts";
import { DocsHint } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHECK_NUMBER_MAX, DESK_PAYMENT_METHODS, PAYMENT_NOTE_MAX } from "@/lib/payment-methods";
import { formatMoney, visibleEmail } from "@/lib/utils";
import { useSubmitOnce } from "@/lib/use-submit-once";

/**
 * "Mark paid" for a payment taken outside the card flow (Murray spec section 14): how it came in,
 * the check's number, the day it arrived (today in the organization's calendar, never later) and
 * a note. The person billed is sent a receipt that says how they paid.
 */
export function MarkPaidDialog({
  invoice,
  open,
  onOpenChange,
  todayKey,
  onSubmit,
  busy,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Today in the organization's calendar, YYYY-MM-DD: the default and the latest day allowed. */
  todayKey: string;
  /** Resolves true when the invoice was marked paid, so the dialog can close. */
  onSubmit: (payment: DeskPayment) => Promise<boolean>;
  busy?: boolean;
}) {
  const [method, setMethod] = React.useState<DeskPaymentMethod | "">("");
  const [checkNumber, setCheckNumber] = React.useState("");
  const [receivedOn, setReceivedOn] = React.useState(todayKey);
  const [note, setNote] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const once = useSubmitOnce(open);

  // A fresh form for every invoice: never the last one's check number.
  React.useEffect(() => {
    if (!open) return;
    setMethod("");
    setCheckNumber("");
    setReceivedOn(todayKey);
    setNote("");
    setTried(false);
  }, [open, invoice?.id, todayKey]);

  if (!invoice) return null;
  const who = invoice.customer?.user?.name ?? visibleEmail(invoice.customer?.user?.email) ?? null;
  const missingMethod = tried && !method;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!method) {
      document.getElementById("mark-paid-method")?.focus();
      return;
    }
    if (!once.begin()) return;
    const ok = await onSubmit({
      paymentMethod: method,
      checkNumber: method === "check" ? checkNumber.trim() || null : null,
      paymentReceivedOn: receivedOn || todayKey,
      paymentNote: note.trim() || null,
    });
    if (!ok) once.fail();
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      dataDocShot="mark-paid-dialog"
      title={
        <span className="inline-flex items-center gap-1.5">
          Mark invoice #{invoice.id} paid
          <DocsHint topic="mark-an-invoice-paid" />
        </span>
      }
      description={`${formatMoney(invoice.total)}${who ? ` from ${who}` : ""}. Record how it was paid; ${who ? "they are" : "the person billed is"} sent a receipt.`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="mark-paid-form" disabled={busy}>
            {busy ? "Saving…" : "Mark paid"}
          </Button>
        </div>
      }
    >
      <form id="mark-paid-form" onSubmit={submit} className="space-y-4 pb-1" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How it was paid" htmlFor="mark-paid-method">
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as DeskPaymentMethod);
                if (v !== "check") setCheckNumber("");
              }}
            >
              <SelectTrigger id="mark-paid-method" className="w-full" aria-invalid={missingMethod || undefined}>
                <SelectValue placeholder="Cash, check…" />
              </SelectTrigger>
              <SelectContent>
                {DESK_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {missingMethod && <p className="text-xs text-destructive">Choose how it was paid.</p>}
          </Field>
          {method === "check" && (
            <Field label="Check number" htmlFor="mark-paid-check">
              <Input
                id="mark-paid-check"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder="1234"
                inputMode="numeric"
                autoComplete="off"
                maxLength={CHECK_NUMBER_MAX}
              />
            </Field>
          )}
          <Field label="Date received" htmlFor="mark-paid-received" className={method === "check" ? "sm:col-span-2" : undefined}>
            <DatePickerField id="mark-paid-received" value={receivedOn} onChange={setReceivedOn} max={todayKey} />
          </Field>
        </div>
        <Field label="Note" htmlFor="mark-paid-note" hint="For your records. The person billed does not see it.">
          <Input
            id="mark-paid-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Deposited with the Oct 4 batch"
            maxLength={PAYMENT_NOTE_MAX}
          />
        </Field>
      </form>
    </ResponsiveModal>
  );
}
