import * as React from "react";
import {
  CircleCheck,
  ClipboardCheck,
  Loader2,
  Lock,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
  SlidersHorizontal,
  SquarePen,
  Tag,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type { Invoice, Reservation } from "@/types/api";
import { WhoPaysSection } from "./who-pays-section";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  useBilling,
  useCreateReservationInvoice,
  useOrgLedgerSettings,
  useReservationInvoice,
} from "@/features/queries";
import { useTimeZone } from "@/lib/use-timezone";
import { OvernightMinimumNotice } from "./overnight-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DocsHint } from "@/components/docs-hint";
import { formatMoney } from "@/lib/utils";
import {
  canCorrectReviewTimes,
  canCreateReservationInvoice,
  canOverridePricesInOrg,
  canOverrideReservationPayment,
  canReviewGuest,
  canRampReservation,
  canViewReservationInvoice,
  billingIsLive,
  hasLiveInvoice,
  liveLedgerStakes,
  closeOutStep,
  usesBriefingNotMeters,
  confirmationCount,
  hasConfirmedReview,
  isReservationPersonnel,
  reviewerCount,
} from "./close-out";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { CloseOutCard } from "./close-out-card";
import { CloseOutRail } from "./close-out-rail";
import { CloseOutReadings } from "./close-out-readings";
import { RampModal } from "./ramp-modal";
import { ConfirmReviewModal } from "./confirm-review-modal";
import { ConfirmGuestReviewModal } from "./confirm-guest-review-modal";
import { CorrectTimesModal } from "./correct-times-modal";
import { OverridePaymentModal } from "./override-payment-modal";

/**
 * Role-aware close-out flow for a reservation, walking the state machine:
 * ramp out → ramp in → confirm review → (auto) invoice. Rendered inside the detail sheet.
 */
export function CloseOutSection({ reservation }: { reservation: Reservation }) {
  const { orgUserId, roles, isStaff, organization } = useAuth();
  const tz = useTimeZone();
  const r = reservation;
  const step = closeOutStep(r);
  //Only needed while there is still a minimum to disclose; once billed the invoice speaks.
  const billingQ = useBilling({ enabled: step !== "invoiced" });
  //`enabled` + `stripeEnabled` decide whether a rate override or a manual invoice can do
  //anything at all. The session's copy of the org carries the same two flags, so the money
  //actions below appear immediately rather than popping in when the fetch lands.
  const billing = billingQ.data ?? organization?.billing ?? null;
  //Ledger mode: same endpoint posts a flight_charge, but the copy must not say "invoice".
  const ledgerQ = useOrgLedgerSettings();
  const ledgerMode = ledgerQ.data?.enabled === true;

  const [rampMode, setRampMode] = React.useState<"out" | "in" | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [guestConfirmOpen, setGuestConfirmOpen] = React.useState(false);
  const [correctOpen, setCorrectOpen] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [squawkOpen, setSquawkOpen] = React.useState(false);

  const invoiceQ = useReservationInvoice(r.id, {
    enabled:
      step === "invoiced" &&
      hasLiveInvoice(r) &&
      canViewReservationInvoice(r, orgUserId, isStaff),
  });
  //The detail fetch is authoritative. Falling back to the row, take the first LIVE
  //invoice: on a split booking this is one payer's share rather than the booking's bill,
  //which is why the summary beside it reports the whole set instead.
  const invoice = invoiceQ.data ?? (r.invoices ?? []).find((i) => !i.voidedAt) ?? null;
  //How many people were billed. Shown beside the invoice so a group close-out doesn't
  //present one student's share as though it were the whole class's bill.
  const invoiceCount = (r.invoices ?? []).filter((i) => !i.voidedAt).length;
  const ledgerStakeCount = liveLedgerStakes(r).length;

  // A pilot on the flight may confirm, but only once. The server rejects a second
  // confirmation from the same person, so after signing off they wait on their
  // counterpart rather than being offered a button that can only 400.
  const alreadyConfirmed = hasConfirmedReview(r, orgUserId);
  const canConfirm = isReservationPersonnel(r, orgUserId) && !alreadyConfirmed;
  // Ramp out/in mirrors Flutter's !viewOnly: staff (admin/dispatcher) or a pilot
  // assigned to this reservation.
  const canRamp = canRampReservation(r, roles, orgUserId);
  const isAdmin = roles.some((role) => role === "owner" || role === "admin");
  const canConfirmGuest = canReviewGuest(r, orgUserId, isAdmin);
  const guestName = r.personnel?.guests?.[0]?.name ?? "the guest";
  const needed = reviewerCount(r);
  const done = confirmationCount(r);

  // The three things the phone could do here and the console could not: retype a rate,
  // fix a reading, and bill a flight that closed out without an invoice. Each predicate
  // mirrors the server guard it will meet (see close-out.ts).
  const canOverride = canOverrideReservationPayment(r, roles, organization?.preferences, billing);
  const canCorrect = canCorrectReviewTimes(r, roles, orgUserId);
  const canInvoice = canCreateReservationInvoice(r, roles, billing);
  // Somebody who could have overridden, on a booking that has moved past the point where
  // the server allows it. Worth one sentence: otherwise the action simply vanishes and
  // reads as a permissions problem.
  const pricesLocked =
    step === "reviewed" &&
    !canOverride &&
    billingIsLive(billing) &&
    r.type !== "maintenance" &&
    canOverridePricesInOrg(roles, organization?.preferences);
  // What has been typed by hand on this booking, in cents per hour. Only present on the
  // hydrated detail record (the board's list select omits the whole relation).
  const overrides = r.paymentOverrides ?? null;
  const hasOverrides =
    overrides != null &&
    (overrides.resourceRateOverride != null || overrides.instructorRateOverride != null);

  const createInvoice = useCreateReservationInvoice(r.id);

  async function raiseInvoice() {
    try {
      const { invoices, warnings } = await createInvoice.mutateAsync();
      //Says HOW MANY people were billed. A group close-out reporting "Invoice sent" leaves
      //a dispatcher unsure whether the rest of the class was charged at all.
      //Ledger mode posts flight_charges through the same endpoint — wording must match.
      toast.success(
        ledgerMode
          ? invoices.length === 1
            ? "Charged to account ledger"
            : `${invoices.length} ledger charges posted, one per person`
          : invoices.length === 1
            ? "Invoice sent"
            : `${invoices.length} invoices sent, one per person`
      );
      //A partial fan-out is a success AND a problem: invoices 1 and 3 are real money in
      //Stripe, and number 2 is not. Both have to be said.
      for (const warning of warnings) toast.warning(warning);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : ledgerMode
            ? "Couldn't post the ledger charge"
            : "Couldn't create the invoice"
      );
    }
  }

  // A cancelled reservation is off the board, nothing to dispatch or close out.
  if (r.cancelledAt) return null;

  // A lesson with no aircraft is never dispatched and never ramps. It has one figure to
  // record (the instruction time) and then the sign-offs, so it gets its own wording all
  // the way through this section rather than being told to wait for an aeroplane that
  // isn't on the booking. Same helper the ramp modal and the Flutter app key on.
  const noMeters = usesBriefingNotMeters(r);

  // Before the aircraft is ramped out the flight is simply scheduled, frame it
  // as "Dispatch", not "Close-out" (which only makes sense once it has flown).
  // Mirrors the Flutter detail view, which shows a neutral "Not Started" status
  // and a plain "Ramp Out" action rather than an overdue close-out prompt.
  const heading = step === "rampOut" && !noMeters ? "Dispatch" : "Close-out";

  /**
   * THE SQUAWK THE CONSOLE NEVER ASKED FOR.
   *
   * Close a flight out on the phone and the app opens a squawk form the moment the readings
   * are in, every time. The console asked nobody, ever, and worse: the whole Maintenance
   * area is hidden from instructors, students and renters, so the people who actually find
   * the discrepancy had no way to file one from a desk at all. Our own help page said as
   * much out loud, in the words "if you are one of those, use the app".
   *
   * `POST /maintenance/squawks` has always been `isOrgUser`. The restriction was never a
   * permission, it was a missing button, and this is the screen where the pilot is already
   * standing.
   *
   * Aircraft only. A squawk is a discrepancy on an aeroplane; a classroom has none, and the
   * modal's own tail field would have nothing to put in it.
   */
  const canSquawk = canRamp && r.resource?.type?.plane != null;

  //What the Adjustments card says while it is shut. Silent when there is nothing to report
  //beyond the buttons themselves, which is the ordinary case.
  const adjustmentsSummary = [
    hasOverrides ? "priced by hand" : null,
    pricesLocked ? "locked" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Separator />
      <section data-doc-shot="close-out-not-started" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </h3>
          {/* Only the money state, which the rail cannot carry: an invoice can be paid or
              voided long after the flight is over. Everything before billing is the rail's
              to say, and saying it twice in different words was half of what made this
              section noisy. */}
          {step === "invoiced" && <StepBadge invoice={invoice} />}
        </div>

        <CloseOutRail step={step} noMeters={noMeters} />

        {/* What is on the record so far. Renders nothing before the booking has flown. */}
        <CloseOutReadings r={r} />

        {step === "rampOut" &&
          (canRamp ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {noMeters
                  ? "Record the instruction time once the lesson is done."
                  : "Ready to dispatch. Ramp out when the aircraft departs."}
              </p>
              <Button className="w-full" onClick={() => setRampMode("out")}>
                {noMeters ? (
                  <>
                    <ClipboardCheck className="size-4" /> Review times
                  </>
                ) : (
                  <>
                    <PlaneTakeoff className="size-4" /> Ramp out
                  </>
                )}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not started yet.</p>
          ))}

        {step === "rampIn" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ramped out, record the ending readings when the aircraft is back.
            </p>
            {canRamp && (
              <Button className="w-full" onClick={() => setRampMode("in")}>
                <PlaneLanding className="size-4" /> Ramp in
              </Button>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div data-doc-shot="reservation-detail-awaiting-signoff" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {noMeters ? "Times recorded. Needs sign-off." : "Flown. Needs pilot sign-off."}{" "}
              <span className="tnum text-foreground">
                {done} of {needed}
              </span>{" "}
              confirmed.
            </p>
            {canConfirm ? (
              <Button className="w-full" onClick={() => setConfirmOpen(true)}>
                <ClipboardCheck className="size-4" /> Confirm review
              </Button>
            ) : alreadyConfirmed ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <span>You&rsquo;ve signed off. Waiting on the other pilot&rsquo;s PIN.</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for the assigned pilot(s) to confirm with their PIN.
              </p>
            )}
          </div>
        )}

        {step === "confirmGuest" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Flown: this guest flight needs to be closed out and billed to{" "}
              <span className="text-foreground">{guestName}</span>.
            </p>
            {canConfirmGuest ? (
              <Button className="w-full" onClick={() => setGuestConfirmOpen(true)}>
                <Receipt className="size-4" /> Close out &amp; bill guest
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                An admin or the assigned instructor can close this out.
              </p>
            )}
          </div>
        )}

        {/* The overnight minimum, from dispatch through to sign-off. Deliberately shown at
            every step before the invoice exists rather than only at ramp-in: the person who
            ramps the aircraft back in is often not the person who booked it and saw the
            notice on the form, and after "invoiced" the invoice itself is the honest answer.

            Renders nothing for a same-day booking or a school with no minimum, which is
            almost every booking. */}
        {step !== "invoiced" && (
          <OvernightMinimumNotice
            start={new Date(r.start)}
            end={new Date(r.end)}
            timeZone={tz.zone}
            resource={r.resource ?? undefined}
            orgMinimumTenths={billingQ.data?.overnightMinimumTenths ?? null}
            graceMinutes={billingQ.data?.overnightGraceMinutes ?? null}
          />
        )}

        {/* Anything wrong with the aeroplane, from the person who just flew it. */}
        {canSquawk && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setSquawkOpen(true)}
          >
            <Wrench className="size-4" /> Report a squawk
          </Button>
        )}

        {/* Who pays what, on a booking with more than one person on it. Offered from the
            moment the flight is back until it's billed, after that the charges describe
            the shares they were computed from, and the server refuses to change them.

            Renders nothing for a one-person booking, which is the overwhelming majority. */}
        {step !== "invoiced" && canRamp && <WhoPaysSection r={r} />}
        {step === "invoiced" && canRamp && (r.payers?.length ?? 0) >= 2 && (
          <p className="text-sm text-muted-foreground">
            Who pays what is locked
            {ledgerStakeCount > 0
              ? " — this flight was charged to the ledger"
              : " — see the invoice(s) above for each share"}
            .
          </p>
        )}

        {/* Corrections and hand-typed prices. Both were phone-only until now, which meant a
            dispatcher at a desk with a mistyped Hobbs reading in front of them had to pick
            up an iPhone to fix it.

            They live together because they are the same act from the pilots' point of view:
            each rewrites what the flight costs, and each discards every PIN already
            entered. */}
        {(canCorrect || canOverride || hasOverrides || pricesLocked) && (
          <CloseOutCard
            title="Adjustments"
            icon={SlidersHorizontal}
            summary={adjustmentsSummary || undefined}
            docShot="close-out-adjustments"
          >
          <div className="space-y-2">
            {hasOverrides && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <Tag className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Priced by hand:{" "}
                  <span className="tnum text-foreground">
                    {[
                      overrides?.resourceRateOverride != null
                        ? `${formatMoney(overrides.resourceRateOverride)}/hr aircraft`
                        : null,
                      overrides?.instructorRateOverride != null
                        ? `${formatMoney(overrides.instructorRateOverride)}/hr instruction`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  . The school&rsquo;s rate card does not apply to this booking.
                </span>
              </div>
            )}

            {(canCorrect || canOverride) && (
              <div className="flex flex-wrap gap-2">
                {canCorrect && (
                  <Button variant="outline" size="sm" onClick={() => setCorrectOpen(true)}>
                    <SquarePen className="size-4" />
                    {noMeters ? "Correct instruction time" : "Correct times"}
                  </Button>
                )}
                {canOverride && (
                  <Button variant="outline" size="sm" onClick={() => setOverrideOpen(true)}>
                    <Tag className="size-4" />
                    {hasOverrides ? "Change rates" : "Override payment"}
                  </Button>
                )}
              </div>
            )}

            {/* The one moment worth explaining rather than silently hiding a button: the
                server refuses both actions once the last pilot has signed off, and a
                dispatcher who watched the option disappear would otherwise reasonably
                conclude their permissions had changed. */}
            {pricesLocked && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" />
                <span>
                  Everyone has signed off, so this flight&rsquo;s rates and readings are now
                  fixed.{" "}
                  {ledgerMode
                    ? "Any money fix has to be a ledger reassign or adjustment on the member&rsquo;s billing tab."
                    : "Any adjustment has to be made on the invoice."}
                </span>
              </p>
            )}
          </div>
          </CloseOutCard>
        )}

        {step === "reviewed" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                {canInvoice
                  ? ledgerMode
                    ? "Review complete, and this flight has no ledger charge yet. Post one when you're ready."
                    : "Review complete, and this flight has no invoice against it. Raise one when you're ready."
                  : ledgerMode
                    ? "Review complete. The ledger charge will appear here once it’s posted."
                    : "Review complete. The invoice will appear here once it’s generated."}
              </span>
            </div>
            {/* The bill normally mints itself the moment the last pilot signs off. When
                that fails (Stripe unreachable, a rate missing at the time) the booking sits
                here reviewed and unbilled, and until now the only way to bill it was the
                phone. Admin only, because the endpoint is. Ledger mode posts a
                flight_charge through the same route — label must not say "invoice". */}
            {canInvoice && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {ledgerMode ? "Post to ledger" : "Create invoice"}
                  {ledgerMode && <DocsHint topic="post-to-ledger" />}
                </div>
                <Button
                  className="w-full"
                  onClick={() => void raiseInvoice()}
                  disabled={createInvoice.isPending}
                >
                  {createInvoice.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />{" "}
                      {ledgerMode ? "Posting charge…" : "Creating invoice…"}
                    </>
                  ) : (
                    <>
                      <Receipt className="size-4" />{" "}
                      {ledgerMode ? "Post to ledger" : "Create invoice"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "invoiced" && (
          <div className="space-y-3">
            {/* Mixed voided-invoice leftovers + live ledger stake, or a true split across
                invoice + ledger: show every live money artifact, not only the first invoice. */}
            {ledgerStakeCount > 0 && (
              <LedgerChargeSummary
                splitAcross={ledgerStakeCount > 1 ? ledgerStakeCount : null}
              />
            )}
            {invoiceCount > 0 && (
              <InvoiceSummary
                invoice={invoice}
                loading={invoiceQ.isLoading && !invoice}
                splitAcross={invoiceCount > 1 ? invoiceCount : null}
              />
            )}
          </div>
        )}
      </section>

      <RampModal
        open={rampMode !== null}
        onOpenChange={(o) => !o && setRampMode(null)}
        reservation={r}
        mode={rampMode ?? "out"}
      />
      <ConfirmReviewModal open={confirmOpen} onOpenChange={setConfirmOpen} reservation={r} />
      <ConfirmGuestReviewModal
        open={guestConfirmOpen}
        onOpenChange={setGuestConfirmOpen}
        reservation={r}
      />
      <CorrectTimesModal open={correctOpen} onOpenChange={setCorrectOpen} reservation={r} />
      {/* The tail comes from the booking, so the modal never asks for it. That also keeps
          it usable by a student: the fleet list behind its picker is staff-only, and this
          way nothing fetches it. */}
      {canSquawk && (
        <LogSquawkModal
          open={squawkOpen}
          onOpenChange={setSquawkOpen}
          fixedResource={r.resource ?? null}
        />
      )}
      <OverridePaymentModal
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        reservation={r}
        defaultInstructorRateCents={billing?.defaultInstructorRate}
      />
    </>
  );
}

/**
 * The money state of a billed booking, and only that.
 *
 * Every earlier state used to be duplicated here as a second badge beside a heading that
 * already changed word, and a sentence of prose that changed with both. The rail carries
 * those now. What it cannot carry is what happened to the invoice afterwards: an invoice is
 * paid or voided days later, with the flight itself unchanged.
 */
function StepBadge({ invoice }: { invoice: Invoice | null }) {
  if (invoice?.paidAt) return <Badge variant="success">Paid</Badge>;
  if (invoice?.voidedAt) return <Badge variant="outline">Void</Badge>;
  return <Badge variant="warning">Billed</Badge>;
}

function LedgerChargeSummary({ splitAcross }: { splitAcross: number | null }) {
  return (
    <div
      data-doc-shot="close-out-ledger-summary"
      className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
    >
      <Receipt className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="inline-flex items-center gap-1.5 font-medium">
          Charged to account ledger
          <DocsHint topic="post-to-ledger" />
        </div>
        <p className="mt-0.5 text-muted-foreground">
          This flight was posted to the member&rsquo;s ledger
          {splitAcross ? ` (${splitAcross} shares)` : ""}. Open their billing tab for the
          receipt or to reassign the charge.
        </p>
      </div>
    </div>
  );
}

function InvoiceSummary({
  invoice,
  loading,
  splitAcross,
}: {
  invoice: Invoice | null;
  loading: boolean;
  /** How many people were billed, when it was more than one. */
  splitAcross: number | null;
}) {
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

  //Says WHOSE share this is. Without it a group close-out shows one student's figures as
  //though they were the class's bill, which is the same mistake, in the UI, that the
  //server's old students[0] payer selection made in the money.
  const items = invoice.items ?? [];
  const subtotal = invoice.subtotal ?? items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  return (
    <div
      data-doc-shot="close-out-invoice-summary"
      className="space-y-3 rounded-lg border border-border bg-muted/40 p-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Receipt className="size-4 shrink-0 text-muted-foreground" />
        Invoice #{invoice.id}
        {splitAcross && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            (one of {splitAcross} shares for this booking)
          </span>
        )}
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
