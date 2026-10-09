import * as React from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useRaiseWorkOrderInvoice, useResourceOwners, useWorkOrderInvoicePreview } from "@/features/queries";
import type { WorkOrder, WorkOrderLine } from "@/types/api";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { useTimeZone } from "@/lib/use-timezone";
import { dateKeyInZone } from "@/lib/timezone";
import { DatePickerField } from "@/components/date-picker";
import { ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
 *
 * It also names the findings the bill charges for that the owner never agreed to (C6): ones never
 * sent to them, and ones sent and still waiting on their answer (C1: once billed, the owner can no
 * longer answer them), each of which the desk must tick to bill anyway (the server refuses
 * otherwise). What they declined or put off is left off the bill, and listed so the desk sees it.
 */
/** Why the bill cannot be raised, with the way to fix it when there is one. */
function CannotRaise({ error }: { error: ApiError }) {
  const { roles } = useAuth();
  const taxMissing = (error.body as { code?: string } | null | undefined)?.code === "TAX_RATE_MISSING";
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" data-testid="invoice-cannot-raise">
      <p>{error.message}</p>
      {taxMissing &&
        (isAdmin(roles) ? (
          <Link to="/settings" search={{ tab: "sales-tax" } as never} className="mt-1.5 inline-block font-medium underline-offset-2 hover:underline">
            Set a sales tax rate
          </Link>
        ) : (
          <p className="mt-1.5">Ask an admin to set a sales tax rate in Settings, Sales tax.</p>
        ))}
    </div>
  );
}

export function RaiseInvoiceModal({
  workOrder: w,
  open,
  onOpenChange,
  onRaised,
}: {
  workOrder: WorkOrder;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** After the invoice is raised: completing the job that was waiting on it. */
  onRaised?: () => void;
}) {
  // An owner the shop wrote down is reached only at the address on the Owners panel; without one
  // the server refuses the bill, so say so here instead of offering a button that always fails.
  // One who has signed in is billed at their own login, like a member.
  const noAddress = !!w.billTo?.external && !w.billTo.claimed && !w.billTo.contactEmail;
  const ownersQ = useResourceOwners(noAddress && open ? w.aircraft.id : undefined, { enabled: noAddress && open });
  // Removed from the aircraft since: the Owners panel no longer lists them to add an address to.
  const stillOwner = !ownersQ.data || ownersQ.data.some((o) => o.orgUser.id === w.billTo?.id);
  // How the bill reaches them, by the server's rule: Stripe's email at an address the shop
  // recorded; our own email (and the app) for anybody else, an owner who has signed in included.
  const sentBy = w.billTo?.contactEmail
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
  const notTold = p?.ownerNotTold ?? [];
  const unanswered = p?.awaitingAnswer ?? [];
  const leftOff = p?.leftOff ?? [];
  const [includeUnsent, setIncludeUnsent] = React.useState(false);
  const [includeUnanswered, setIncludeUnanswered] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setIncludeUnsent(false);
    setIncludeUnanswered(false);
  }, [open]);
  const tickedOk = (notTold.length === 0 || includeUnsent) && (unanswered.length === 0 || includeUnanswered);

  async function submit() {
    if (!p || !dueOk || !tickedOk) return;
    try {
      await raise.mutateAsync({
        workOrderId: w.id,
        expectedTotal: p.total,
        expectedDetails: p.details?.hash,
        dueIn: dueDays!,
        ...(notTold.length ? { includeUnsent: true } : {}),
        ...(unanswered.length ? { includeUnanswered: true } : {}),
      });
      toast.success(`${w.label} invoiced ${formatMoney(p.total)}. ${sentBy}.`);
      onOpenChange(false);
      onRaised?.();
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
          <Button onClick={submit} disabled={noAddress || !p || !dueOk || !tickedOk || raise.isPending || preview.isFetching}>
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
        // A reason the bill cannot be raised (a taxable line with no rate, nothing left to bill) is
        // said as what to do, not "Couldn't load this" with a Try again that can only fail again.
        preview.error instanceof ApiError && preview.error.status >= 400 && preview.error.status < 500 ? (
          <CannotRaise error={preview.error} />
        ) : (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        )
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
          {notTold.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" data-testid="invoice-not-told">
              <p className="font-medium">
                {notTold.length === 1 ? "A finding on this bill was never sent to the owner" : `${notTold.length} findings on this bill were never sent to the owner`}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {notTold.map((f) => (
                  <li key={f.itemId} className="flex justify-between gap-3">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{f.description}</span>
                    <span className="tnum shrink-0">{formatMoney(f.chargesCents)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px]">
                The owner has not been asked about {notTold.length === 1 ? "it" : "them"}. Send {notTold.length === 1 ? "it" : "them"} first, record their answer, mark{" "}
                {notTold.length === 1 ? "it" : "them"} done, or take {notTold.length === 1 ? "its" : "their"} lines off.
              </p>
              <label className="mt-2 flex items-start gap-2 font-medium">
                <Checkbox checked={includeUnsent} onCheckedChange={(v) => setIncludeUnsent(v === true)} className="mt-0.5" />
                Bill {notTold.length === 1 ? "it" : "them"} anyway
              </label>
            </div>
          )}
          {unanswered.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" data-testid="invoice-awaiting-answer">
              <p className="font-medium">
                {unanswered.length === 1 ? "A finding on this bill is still waiting on the owner's answer" : `${unanswered.length} findings on this bill are still waiting on the owner's answer`}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {unanswered.map((f) => (
                  <li key={f.itemId} className="flex justify-between gap-3">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{f.description}</span>
                    <span className="tnum shrink-0">{formatMoney(f.chargesCents)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px]">
                Once billed, the owner can no longer answer {unanswered.length === 1 ? "it" : "them"}. Record their answer, mark {unanswered.length === 1 ? "it" : "them"} done, or take{" "}
                {unanswered.length === 1 ? "its" : "their"} lines off.
              </p>
              <label className="mt-2 flex items-start gap-2 font-medium">
                <Checkbox checked={includeUnanswered} onCheckedChange={(v) => setIncludeUnanswered(v === true)} className="mt-0.5" />
                Bill {unanswered.length === 1 ? "it" : "them"} anyway
              </label>
            </div>
          )}
          {leftOff.length > 0 && (
            <div className="rounded-md border p-3 text-[13px]" data-testid="invoice-left-off">
              <p className="font-medium">Left off this bill</p>
              <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                {leftOff.map((f) => (
                  <li key={f.itemId} className="flex justify-between gap-3">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {f.description} <span className="text-[12px]">({f.decision === "declined" ? "declined" : "put off"})</span>
                    </span>
                    <s className="tnum shrink-0">{formatMoney(f.chargesCents)}</s>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {leftOff.length === 1
                  ? "The owner turned it down, so it is not charged. To bill it, record a new answer for it."
                  : "The owner turned these down, so they are not charged. To bill one, record a new answer for it."}
              </p>
            </div>
          )}
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
