import * as React from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useRaiseWorkOrderInvoice, useResourceOwners, useWorkOrderInvoicePreview } from "@/features/queries";
import type { WorkOrder, WorkOrderLine } from "@/types/api";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useTimeZone } from "@/lib/use-timezone";
import { dateKeyInZone } from "@/lib/timezone";
import { DatePickerField } from "@/components/date-picker";
import { ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Labor's "each" is its hourly rate, so the row reads hours x rate; anything else its price each.
 * Both BEFORE a discount, which is taken off the line's total, the way the invoice prints it:
 * "4 x $12.65, 10% off".
 */
export function eachLabel(l: WorkOrderLine): string {
  if (l.category === "labor" && l.minutes != null && l.rateCents != null && Math.round((l.minutes * l.rateCents) / 60) === l.unitPriceCents) {
    return `${formatMoney(l.rateCents)}/h`;
  }
  return formatMoney(l.unitPriceCents);
}

/** A due date picked on the calendar rather than one of the usual terms (Tony, 2026-09-30). */
const CUSTOM = "custom";
/** The server's bound on days until due. */
const DUE_MAX_DAYS = 365;

const DUE: { value: string; label: string }[] = [
  { value: "0", label: "On receipt" },
  { value: "15", label: "In 15 days" },
  { value: "30", label: "In 30 days" },
  { value: CUSTOM, label: "On a date…" },
];

/**
 * The bill before it is raised, priced by the server exactly as it will be raised: each line with
 * its tax, the school's service fee, and the total. Raising sends the total the person saw, and is
 * refused with the new one if a line or a rate moved meanwhile.
 */
export function RaiseInvoiceModal({ workOrder: w, open, onOpenChange }: { workOrder: WorkOrder; open: boolean; onOpenChange: (o: boolean) => void }) {
  // An owner the shop wrote down is reached only at the address on the Owners panel; without one
  // the server refuses the bill, so say so here instead of offering a button that always fails.
  const noAddress = !!w.billTo?.external && !w.billTo.contactEmail;
  const ownersQ = useResourceOwners(noAddress && open ? w.aircraft.id : undefined, { enabled: noAddress && open });
  // Removed from the aircraft since: the Owners panel no longer lists them to add an address to.
  const stillOwner = !ownersQ.data || ownersQ.data.some((o) => o.orgUser.id === w.billTo?.id);
  // How the bill reaches them: Stripe's email for an owner the shop wrote down, our own email
  // (and the app) for a member.
  const sentBy = w.billTo?.external
    ? `Stripe emails it to ${w.billTo.contactEmail}`
    : `${w.billTo?.name ?? "The member"} gets it by email and in the app`;
  const preview = useWorkOrderInvoicePreview(open && !noAddress ? w.id : null);
  const raise = useRaiseWorkOrderInvoice();
  const [dueIn, setDueIn] = React.useState("0");
  const [dueOn, setDueOn] = React.useState("");
  // Days are counted from today at the organization, the same day the server counts from.
  const tz = useTimeZone();
  const today = dateKeyInZone(new Date(), tz.zone);
  const lastDay = format(addDays(parseISO(today), DUE_MAX_DAYS), "yyyy-MM-dd");
  const dueDays = dueIn === CUSTOM ? (dueOn ? differenceInCalendarDays(parseISO(dueOn), parseISO(today)) : null) : Number(dueIn);
  const dueOk = dueDays != null && dueDays >= 0 && dueDays <= DUE_MAX_DAYS;
  const p = preview.data;

  async function submit() {
    if (!p || !dueOk) return;
    try {
      await raise.mutateAsync({ workOrderId: w.id, expectedTotal: p.total, expectedDetails: p.details?.hash, dueIn: dueDays! });
      toast.success(`${w.label} invoiced ${formatMoney(p.total)}. ${sentBy}.`);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The server's words: a moved total, changed text, or a bill Stripe would not void that needs the desk.
        toast.error(e.message || "The total changed since it was priced. Check it and raise the invoice again.");
        void preview.refetch();
        return;
      }
      toast.error(e instanceof Error ? e.message : "Couldn't raise the invoice");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Invoice ${w.billTo?.name ?? "the owner"}`}
      description={
        noAddress
          ? `${w.label}.`
          : `${w.label}. ${sentBy}; they pay online, or you record cash or a check.`
      }
      dataDocShot="work-order-raise-invoice"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={raise.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={noAddress || !p || !dueOk || raise.isPending || preview.isFetching}>
            {raise.isPending ? "Raising…" : p ? `Raise ${formatMoney(p.total)} invoice` : "Raise invoice"}
          </Button>
        </div>
      }
    >
      {noAddress ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {stillOwner ? (
            <>
              {w.billTo?.name ?? "The owner"} has no email address to send the invoice to. Add one on the aircraft's{" "}
              <Link to="/aircraft/$resourceId" params={{ resourceId: String(w.aircraft.id) }} search={{ tab: "owners" } as never} className="font-medium underline-offset-2 hover:underline">
                Owners panel
              </Link>
              , then raise it.
            </>
          ) : (
            <>
              {w.billTo?.name ?? "The person billed"} has no email address and is no longer an owner of this aircraft. Add them back on its{" "}
              <Link to="/aircraft/$resourceId" params={{ resourceId: String(w.aircraft.id) }} search={{ tab: "owners" } as never} className="font-medium underline-offset-2 hover:underline">
                Owners panel
              </Link>{" "}
              with their email, or edit the job and choose who pays.
            </>
          )}
        </div>
      ) : preview.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : preview.isError ? (
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
      ) : p ? (
        <div className="space-y-4">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-border">
              {p.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    {l.name}
                    {l.taxable && <span className="ml-1.5 text-[11px] text-muted-foreground">+ {formatMoney(l.taxCents)} tax</span>}
                  </td>
                  <td className="py-1.5 text-right tnum">{formatMoney(l.qty * l.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-[13px]">
              <tr className="border-t border-border">
                <td className="pt-2">Subtotal</td>
                <td className="pt-2 text-right tnum">{formatMoney(p.subtotal)}</td>
              </tr>
              {p.byRate.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="text-right tnum">{formatMoney(r.tax)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pt-1">Total</td>
                <td className="pt-1 text-right tnum">{formatMoney(p.total)}</td>
              </tr>
            </tfoot>
          </table>
          {p.exemption && <p className="text-xs text-muted-foreground">{p.exemption.printed}</p>}
          {/* What the invoice also says (Murray §13), so the whole bill is reviewed before it goes. */}
          {p.details && (
            <div className="rounded-md border p-3 text-[13px]" data-testid="invoice-details">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Also on the invoice</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {p.details.customFields.map((f) => (
                  <React.Fragment key={f.name}>
                    <dt className="text-muted-foreground">{f.name}</dt>
                    <dd className="tnum">{f.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {p.details.description && <p className="mt-2 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{p.details.description}</p>}
              {p.details.shortened && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Shortened to fit the invoice. The whole list and your notes stay on the job.
                </p>
              )}
            </div>
          )}
          <div>
            <p className="mb-1.5 text-sm font-medium">Due</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dueIn} onValueChange={setDueIn}>
                <SelectTrigger className="w-48" aria-label="Due">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUE.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dueIn === CUSTOM && (
                <div className="w-48">
                  <DatePickerField id="wo-invoice-due-on" value={dueOn} onChange={setDueOn} min={today} max={lastDay} placeholder="Pick the day" />
                </div>
              )}
            </div>
            {dueIn === CUSTOM && dueOn && dueOk && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {dueDays === 0 ? "Due today." : `Due in ${dueDays} ${dueDays === 1 ? "day" : "days"}, at the end of that day.`}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Once raised, the job's lines are frozen: void the invoice to change them.{" "}
            <Link to="/billing" className="underline-offset-2 hover:underline">
              Billing
            </Link>{" "}
            lists it with every other invoice.
          </p>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}
