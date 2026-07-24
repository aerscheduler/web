import * as React from "react";
import {
  CircleCheck,
  ClipboardCheck,
  Loader2,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
} from "lucide-react";
import type { Invoice, Reservation } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { useReservationInvoice } from "@/features/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/utils";
import {
  closeOutStep,
  confirmationCount,
  isReservationPersonnel,
  reviewerCount,
  type CloseOutStep,
} from "./close-out";
import { RampModal } from "./ramp-modal";
import { ConfirmReviewModal } from "./confirm-review-modal";

/**
 * Role-aware close-out flow for a reservation, walking the state machine:
 * ramp out → ramp in → confirm review → (auto) invoice. Rendered inside the detail sheet.
 */
export function CloseOutSection({ reservation }: { reservation: Reservation }) {
  const { orgUserId } = useAuth();
  const r = reservation;
  const step = closeOutStep(r);

  const [rampMode, setRampMode] = React.useState<"out" | "in" | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const invoiceQ = useReservationInvoice(r.id, { enabled: step === "invoiced" });
  const invoice = invoiceQ.data ?? r.invoice ?? null;

  const canConfirm = isReservationPersonnel(r, orgUserId);
  const needed = reviewerCount(r);
  const done = confirmationCount(r);

  return (
    <>
      <Separator />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Close-out
          </h3>
          <StepBadge step={step} invoice={invoice} />
        </div>

        {step === "rampOut" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This flight hasn&rsquo;t been ramped out yet.
            </p>
            <Button className="w-full" onClick={() => setRampMode("out")}>
              <PlaneTakeoff className="size-4" /> Ramp out
            </Button>
          </div>
        )}

        {step === "rampIn" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ramped out — record the ending readings when the aircraft is back.
            </p>
            <Button className="w-full" onClick={() => setRampMode("in")}>
              <PlaneLanding className="size-4" /> Ramp in
            </Button>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Flown — needs pilot sign-off.{" "}
              <span className="tnum text-foreground">
                {done} of {needed}
              </span>{" "}
              confirmed.
            </p>
            {canConfirm ? (
              <Button className="w-full" onClick={() => setConfirmOpen(true)}>
                <ClipboardCheck className="size-4" /> Confirm review
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for the assigned pilot(s) to confirm with their PIN.
              </p>
            )}
          </div>
        )}

        {step === "reviewed" && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <span>Review complete. The invoice will appear here once it&rsquo;s generated.</span>
          </div>
        )}

        {step === "invoiced" && (
          <InvoiceSummary invoice={invoice} loading={invoiceQ.isLoading && !invoice} />
        )}
      </section>

      <RampModal
        open={rampMode !== null}
        onOpenChange={(o) => !o && setRampMode(null)}
        reservation={r}
        mode={rampMode ?? "out"}
      />
      <ConfirmReviewModal open={confirmOpen} onOpenChange={setConfirmOpen} reservation={r} />
    </>
  );
}

function StepBadge({ step, invoice }: { step: CloseOutStep; invoice: Invoice | null }) {
  if (step === "invoiced") {
    if (invoice?.paidAt) return <Badge variant="success">Paid</Badge>;
    if (invoice?.voidedAt) return <Badge variant="outline">Void</Badge>;
    return <Badge variant="warning">Billed</Badge>;
  }
  const map: Record<Exclude<CloseOutStep, "invoiced">, { label: string; variant: "outline" | "warning" | "secondary" }> = {
    rampOut: { label: "Not ramped out", variant: "outline" },
    rampIn: { label: "In flight", variant: "warning" },
    confirm: { label: "Awaiting review", variant: "warning" },
    reviewed: { label: "Reviewed", variant: "secondary" },
  };
  const s = map[step];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function InvoiceSummary({ invoice, loading }: { invoice: Invoice | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading invoice…
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Receipt className="size-4 shrink-0" /> This flight has been invoiced.
      </div>
    );
  }

  const items = invoice.items ?? [];
  const subtotal = invoice.subtotal ?? items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Receipt className="size-4 shrink-0 text-muted-foreground" />
        Invoice #{invoice.id}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {it.name}
                {it.qty > 1 && <span className="text-muted-foreground"> × {it.qty}</span>}
              </span>
              <span className="tnum shrink-0">{formatMoney(it.qty * it.unitPrice)}</span>
            </li>
          ))}
        </ul>
      )}

      <Separator />
      <div className="space-y-1 text-sm">
        {invoice.tax != null && invoice.tax > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tnum">{formatMoney(subtotal)}</span>
          </div>
        )}
        <div className="flex items-center justify-between font-semibold">
          <span>Total</span>
          <span className="tnum text-lg">{formatMoney(invoice.total)}</span>
        </div>
      </div>
    </div>
  );
}
