import { describe, expect, it } from "vitest";
import type { Reservation, Role } from "@/types/api";
import {
  canCorrectReviewTimes,
  hasLiveBill,
  reviewIsComplete,
  canReopenInOrg,
  hasCorrectableReadings,
  erasesAnotherSignOff,
  canOverrideReservationPayment,
  canCreateReservationInvoice,
  canReopenCloseOut,
  closeOutStep,
} from "./close-out";

/**
 * THE CLOSE-OUT HAS A REVERSE GEAR NOW, and these pin what it does and does not undo.
 *
 * The reported bug, in one sentence: a SOLO booking has one reviewer, and that reviewer is
 * the person typing the Hobbs reading in. So "you may correct this until everyone has
 * signed off" meant "you may correct this until you finish the thing you are doing", and a
 * school that fat-fingered a reading had to abandon the booking and re-create it carrying
 * the real hours. The abandoned row then sits on the board claiming a flight that never
 * happened. Cancelling it is not the tidy-up it sounds like either: cancel never looks at
 * ramp state, so it stamps `cancelledAt` on a flown booking and both new endpoints then
 * refuse it for being cancelled.
 *
 * So the lock moved from SIGN-OFFS to LIVE MONEY, on both surfaces, and reopening became an
 * action with its own name rather than a side effect of correcting something.
 *
 * Every predicate here has to agree with the server guard it will meet. Where it does not,
 * the symptom is always the same: a button that is offered and then refused.
 */

const PILOT = 7;
const STRANGER = 99;
const RENTER: Role[] = ["renter"];
const ADMIN: Role[] = ["admin"];
const BILLING_LIVE = { enabled: true, stripeEnabled: true };

/** A flown solo booking. `signedOff` is the state the school gets stuck in. */
function soloFlight(opts: {
  signedOff?: boolean;
  invoices?: { id: number; voidedAt: string | null }[];
  payers?: unknown[];
} = {}): Reservation {
  return {
    id: 1,
    type: "solo",
    cancelledAt: null,
    start: "2026-08-28T15:00:00.000Z",
    end: "2026-08-28T17:00:00.000Z",
    createdBy: { id: PILOT },
    personnel: { instructors: [], students: [], renters: [{ id: PILOT }] },
    resource: { id: 1, type: { plane: { id: 1, tailNumber: "N172TS" } } },
    review: {
      hobbsTimeOut: 40511,
      hobbsTimeIn: 40544,
      tachTimeOut: 40511,
      tachTimeIn: 40544,
      reviewConfirmations: opts.signedOff ? [{ id: 1, reviewedBy: { id: PILOT } }] : [],
    },
    invoices: opts.invoices ?? [],
    payers: opts.payers ?? [],
  } as unknown as Reservation;
}

const LIVE_INVOICE = [{ id: 5, voidedAt: null }];
const VOIDED_INVOICE = [{ id: 5, voidedAt: "2026-08-29T00:00:00.000Z" }];
const LIVE_LEDGER = [{ waived: false, ledgerEntry: { id: 3, reversedBy: null } }];
const REVERSED_LEDGER = [{ waived: false, ledgerEntry: { id: 3, reversedBy: { id: 4 } } }];

describe("retyping a rate on a flight somebody else signed", () => {
  const BILLING_ON = { enabled: true, stripeEnabled: true };

  //RETYPING A RATE CLEARS EVERY SIGN-OFF, exactly as correcting a reading does, so the server
  //applies the same rule to both. Both clients mirrored it on the correction door and neither
  //did here, so with `instructorsCanOverrideReservationPrices` on, an instructor with no
  //connection to a flight saw Override payment and was 403'd on save.
  it("is refused to somebody who would clear another person's PIN", () => {
    const r = soloFlight({ signedOff: true });
    (r.review as { reviewConfirmations: unknown[] }).reviewConfirmations = [{ id: 1, reviewedBy: { id: STRANGER } }];
    expect(canOverrideReservationPayment(r, ["instructor"], { instructorsCanOverrideReservationPrices: true } as never, BILLING_ON, PILOT)).toBe(false);
  });

  it("is allowed to an admin, who may take a signature back", () => {
    const r = soloFlight({ signedOff: true });
    (r.review as { reviewConfirmations: unknown[] }).reviewConfirmations = [{ id: 1, reviewedBy: { id: STRANGER } }];
    expect(canOverrideReservationPayment(r, ADMIN, null, BILLING_ON, PILOT)).toBe(true);
  });

  //Nothing signed means nothing to erase.
  it("is allowed before anybody has signed", () => {
    expect(canOverrideReservationPayment(soloFlight(), ADMIN, null, BILLING_ON, PILOT)).toBe(true);
  });

  //LEDGER-ONLY SCHOOLS SET RATES TOO. Requiring Stripe made this unreachable for a school
  //that bills on paper, which is the case the function's own docstring says it fixed.
  it("is allowed at a school on the ledger with Stripe off", () => {
    expect(canOverrideReservationPayment(soloFlight(), ADMIN, null, { enabled: true, stripeEnabled: false }, PILOT)).toBe(true);
  });
});

describe("raising the invoice for a share the fan-out missed", () => {
  const payer = (over: Record<string, unknown> = {}) => ({ id: 1, waived: false, ...over });

  //`coverage` is what the SERVER sends, and it counts crew rather than payer rows. The old
  //fixtures invented a stake row for the unbilled payer, a shape the server never produces:
  //a share that was never billed has no payer row at all, which is exactly what made the
  //re-derived version answer "fully billed" on a flight nobody had billed.
  const booking = (
    coverage: { expected: number; billed: number; complete: boolean } | null,
    payers: unknown[] = []
  ) =>
    ({
      ...soloFlight(),
      payers,
      coverage,
      review: { reviewConfirmations: [{ id: 1, reviewedBy: { id: PILOT } }] },
    }) as unknown as Reservation;

  const BILLING = { enabled: true, stripeEnabled: true };

  //THE CASE THE ENDPOINT EXISTS FOR. A split fan-out throws on invoice 2 of 3, and the
  //button that raises the missing share was hidden by `hasLiveBill`, which is true the moment
  //ONE share is raised. The report said billed, the booking page said Billed, and the pilot's
  //share was uncollectable through the product.
  //THE PARTIAL FAN-OUT. Invoice 1 of 3 succeeded and wrote a stake; 2 and 3 threw and wrote
  //nothing, so the booking carries ONE payer row and two uncollected shares.
  it("is offered while one share is still unbilled", () => {
    const r = booking({ expected: 3, billed: 1, complete: false }, [payer({ id: 1, invoice: { id: 5, voidedAt: null } })]);
    expect(canCreateReservationInvoice(r, ADMIN, BILLING)).toBe(true);
  });

  //THE PRIMARY CASE, and the one the re-derived version got exactly backwards: a flight
  //nobody has billed has no payer rows whatsoever.
  it("is offered on a flight nobody has billed at all", () => {
    expect(canCreateReservationInvoice(booking({ expected: 1, billed: 0, complete: false }), ADMIN, BILLING)).toBe(true);
  });

  it("is withdrawn once every share is billed", () => {
    const r = booking({ expected: 2, billed: 2, complete: true }, [
      payer({ id: 1, invoice: { id: 5, voidedAt: null } }),
      payer({ id: 2, ledgerEntry: { id: 7, reversedBy: null } }),
    ]);
    expect(canCreateReservationInvoice(r, ADMIN, BILLING)).toBe(false);
  });

  //A waived payer is not somebody the booking is waiting to bill.
  //An entirely waived crew is never going to be billed; the server says so with `expected: 0`.
  it("is withdrawn when nobody was ever going to be billed", () => {
    expect(canCreateReservationInvoice(booking({ expected: 0, billed: 0, complete: true }), ADMIN, BILLING)).toBe(false);
  });

  //THE ONE STATE THE RETRY MUST REFUSE: money moved onto a waived payer, which coverage
  //cannot see, so billing again charges one flight to two people.
  //THE ONE STATE COVERAGE CANNOT SEE, so it is still asked separately: money moved onto a
  //waived payer means billing again charges one flight to two people.
  it("is refused when money sits on a waived payer", () => {
    const r = booking({ expected: 1, billed: 0, complete: false }, [
      payer({ id: 2, waived: true, ledgerEntry: { id: 7, reversedBy: null } }),
    ]);
    expect(canCreateReservationInvoice(r, ADMIN, BILLING)).toBe(false);
  });

  //A voided invoice is not money, so that share is owed again.
  it("returns once an invoice is voided", () => {
    const r = booking({ expected: 1, billed: 0, complete: false }, [
      payer({ id: 1, invoice: { id: 5, voidedAt: "2026-08-31T00:00:00Z" } }),
    ]);
    expect(canCreateReservationInvoice(r, ADMIN, BILLING)).toBe(true);
  });

  //A LIST ROW WITH NO COVERAGE YET must not hide the remedy. Both clients render the list row
  //before the detail query resolves, and hiding a button on missing data is how a real
  //unbilled flight becomes invisible.
  it("is offered when the payload carries no coverage at all", () => {
    expect(canCreateReservationInvoice(booking(null), ADMIN, BILLING)).toBe(true);
  });

  //LEDGER-ONLY SCHOOLS BILL TOO. `billingIsLive` requires Stripe, and a cheque-driven club
  //running on the ledger alone had no retry button anywhere, for ever.
  it("is offered at a school on the ledger with Stripe switched off", () => {
    const r = booking({ expected: 1, billed: 0, complete: false });
    expect(canCreateReservationInvoice(r, ADMIN, { enabled: true, stripeEnabled: false })).toBe(true);
  });

  //A GUEST FLIGHT CLOSED OUT BY ITS INSTRUCTOR'S PIN. The server and the phone both accept
  //that branch; the console asked only for the guest flag and hid the button on a flight both
  //of them would have billed.
  it("is offered on a guest flight its instructor signed off", () => {
    const r = booking({ expected: 1, billed: 0, complete: false });
    (r as { type: string }).type = "guest";
    (r as { completedByForGuest?: unknown }).completedByForGuest = null;
    (r as { personnel?: unknown }).personnel = { instructors: [{ id: 42 }], students: [], renters: [] };
    (r as { review?: unknown }).review = { reviewConfirmations: [{ id: 1, reviewedBy: { id: 42 } }] };
    expect(canCreateReservationInvoice(r, ADMIN, BILLING)).toBe(true);
  });
});

describe("canCorrectReviewTimes and somebody else's signature", () => {
  //THE OFFERED-THEN-REFUSED BUTTON. The server gained a rule about clearing another
  //person's sign-off and neither client narrowed for it, so a dispatcher, or the student on
  //a dual their instructor had signed, saw Correct times and got a 403 on Save. The file's
  //own header names this exact symptom.
  it("is refused to a rostered pilot who would clear another person's PIN", () => {
    const r = soloFlight({ signedOff: true });
    (r.review as { reviewConfirmations: unknown[] }).reviewConfirmations = [
      { id: 1, reviewedBy: { id: STRANGER } },
    ];
    expect(canCorrectReviewTimes(r, RENTER, PILOT)).toBe(false);
  });

  //RE-DOING YOUR OWN IS NOT AN ERASURE, which is the distinction the server's first attempt
  //at this missed: it asked "is the close-out complete" and so made a renter fetch an admin
  //to fix their own solo, the very dead end the feature exists to remove.
  it("is allowed when the only signature is the viewer's own", () => {
    expect(canCorrectReviewTimes(soloFlight({ signedOff: true }), RENTER, PILOT)).toBe(true);
  });

  it("is allowed to an admin either way", () => {
    const r = soloFlight({ signedOff: true });
    (r.review as { reviewConfirmations: unknown[] }).reviewConfirmations = [
      { id: 1, reviewedBy: { id: STRANGER } },
    ];
    expect(canCorrectReviewTimes(r, ADMIN, STRANGER + 1)).toBe(true);
  });

  //A guest booking keeps its close-out in a flag rather than in confirmation rows.
  it("counts a guest close-out recorded by somebody else", () => {
    const r = soloFlight();
    (r as { type: string }).type = "guest";
    (r as { completedByForGuest?: unknown }).completedByForGuest = { id: STRANGER };
    expect(erasesAnotherSignOff(r, PILOT)).toBe(true);
    expect(erasesAnotherSignOff(r, STRANGER)).toBe(false);
  });
});

describe("canCorrectReviewTimes after sign-off", () => {
  //THE REPORTED BUG. This was false, and there was no other route to a correction.
  it("is allowed on a signed-off but unbilled flight", () => {
    expect(canCorrectReviewTimes(soloFlight({ signedOff: true }), RENTER, PILOT)).toBe(true);
  });

  it("is still allowed before anyone has signed off", () => {
    expect(canCorrectReviewTimes(soloFlight(), RENTER, PILOT)).toBe(true);
  });

  it("is refused while an invoice stands", () => {
    const r = soloFlight({ signedOff: true, invoices: LIVE_INVOICE });
    expect(canCorrectReviewTimes(r, ADMIN, PILOT)).toBe(false);
  });

  //The other half of the defect: the server counted the invoice ROW, so voiding, which is
  //what the product's own message told you to do, changed nothing.
  it("is allowed again once that invoice is voided", () => {
    const r = soloFlight({ signedOff: true, invoices: VOIDED_INVOICE });
    expect(canCorrectReviewTimes(r, ADMIN, PILOT)).toBe(true);
  });

  it("is refused while a ledger charge stands, and allowed once reversed", () => {
    expect(
      canCorrectReviewTimes(soloFlight({ signedOff: true, payers: LIVE_LEDGER }), ADMIN, PILOT)
    ).toBe(false);
    expect(
      canCorrectReviewTimes(soloFlight({ signedOff: true, payers: REVERSED_LEDGER }), ADMIN, PILOT)
    ).toBe(true);
  });

  it("still refuses somebody who is not on the booking and is not staff", () => {
    expect(canCorrectReviewTimes(soloFlight({ signedOff: true }), RENTER, STRANGER)).toBe(false);
  });

  it("still refuses a flight that has not come back yet", () => {
    const away = {
      ...soloFlight(),
      review: { hobbsTimeOut: 40511, tachTimeOut: 40511, reviewConfirmations: [] },
    } as unknown as Reservation;
    expect(canCorrectReviewTimes(away, ADMIN, PILOT)).toBe(false);
  });

  it("still refuses a cancelled booking", () => {
    const r = { ...soloFlight({ signedOff: true }), cancelledAt: "2026-08-29T00:00:00.000Z" };
    expect(canCorrectReviewTimes(r as Reservation, ADMIN, PILOT)).toBe(false);
  });
});

describe("canReopenCloseOut", () => {
  it("is offered on a signed-off, unbilled flight to an admin", () => {
    expect(canReopenCloseOut(soloFlight({ signedOff: true }), ADMIN, PILOT)).toBe(true);
  });

  //THE ASYMMETRY THIS PERMISSION EXISTS FOR. The renter on the booking may ramp it and may
  //correct the reading, because fixing a Hobbs entry is ordinary work. They may not take a
  //signature back off a flight record.
  it("is NOT offered to the renter on the booking, who can still correct it", () => {
    const r = soloFlight({ signedOff: true });
    expect(canCorrectReviewTimes(r, RENTER, PILOT)).toBe(true);
    expect(canReopenCloseOut(r, RENTER, PILOT)).toBe(false);
  });

  //THE FRONT DESK CAN REOPEN. This asserted the opposite, on the reasoning that closing a
  //flight out is not signing it. Measured against production, that reasoning cost more than
  //it bought: the desk could already fix a reading on a partly signed booking before the
  //lock moved off completion, 578 bookings sit in that state, and 55% of bookings pass
  //through a partly signed window. Owner's decision, with the numbers in hand.
  it("is offered to a dispatcher, who is the front desk", () => {
    expect(canReopenCloseOut(soloFlight({ signedOff: true }), ["dispatcher"], 1)).toBe(true);
  });

  //But a PILOT still cannot clear another pilot's PIN, which is the case the rule exists
  //for. Widening it to staff must not widen it to everybody who can ramp.
  it("is still refused to a rostered pilot who is neither staff nor the instructor", () => {
    expect(canReopenCloseOut(soloFlight({ signedOff: true }), RENTER, STRANGER)).toBe(false);
  });

  it("is offered to the instructor on the booking, without them being an admin", () => {
    const dual = {
      ...soloFlight({ signedOff: true }),
      type: "dual",
      personnel: { instructors: [{ id: 42 }], students: [{ id: PILOT }], renters: [] },
    } as unknown as Reservation;
    expect(canReopenInOrg(dual, ["instructor"], 42)).toBe(true);
    //An instructor who is not on THIS booking may not.
    expect(canReopenInOrg(dual, ["instructor"], 43)).toBe(false);
  });

  //Nothing to take back. Offering it here would be offering to undo a signature nobody gave.
  it("is NOT offered before anyone has signed off", () => {
    expect(canReopenCloseOut(soloFlight(), ADMIN, PILOT)).toBe(false);
  });

  it("is not offered to somebody unrelated to the booking", () => {
    expect(canReopenCloseOut(soloFlight({ signedOff: true }), RENTER, STRANGER)).toBe(false);
  });

  it("is withdrawn while money stands, and returns once it is voided or reversed", () => {
    expect(
      canReopenCloseOut(soloFlight({ signedOff: true, invoices: LIVE_INVOICE }), ADMIN, PILOT)
    ).toBe(false);
    expect(
      canReopenCloseOut(soloFlight({ signedOff: true, invoices: VOIDED_INVOICE }), ADMIN, PILOT)
    ).toBe(true);
    expect(
      canReopenCloseOut(soloFlight({ signedOff: true, payers: LIVE_LEDGER }), ADMIN, PILOT)
    ).toBe(false);
    expect(
      canReopenCloseOut(soloFlight({ signedOff: true, payers: REVERSED_LEDGER }), ADMIN, PILOT)
    ).toBe(true);
  });

  it("is not offered on a cancelled booking", () => {
    const r = { ...soloFlight({ signedOff: true }), cancelledAt: "2026-08-29T00:00:00.000Z" };
    expect(canReopenCloseOut(r as Reservation, ADMIN, PILOT)).toBe(false);
  });

  //A maintenance slot carries no personnel, so `closeOutStep` reads it as "reviewed" the
  //moment it ramps back in. There is no signature on it, so there is nothing to take back,
  //and the server refuses for the same reason. Offering it would be a guaranteed 400.
  it("is not offered on a booking with nobody to sign off", () => {
    const maintenance = {
      ...soloFlight(),
      type: "maintenance",
      personnel: { instructors: [], students: [], renters: [] },
    } as unknown as Reservation;
    expect(closeOutStep(maintenance)).toBe("reviewed");
    expect(canReopenCloseOut(maintenance, ADMIN, PILOT)).toBe(false);
  });

  //A guest flight is closed out by staff rather than by PIN, so its "signed off" flag is a
  //different field. It has to reach the same answer through it.
  it("follows completedByForGuest on a guest booking", () => {
    const base = {
      ...soloFlight(),
      type: "guest",
      personnel: { instructors: [{ id: PILOT }], students: [], renters: [], guests: [{ id: 1 }] },
    } as unknown as Reservation;
    expect(canReopenCloseOut(base, ADMIN, PILOT)).toBe(false);
    const reviewed = { ...base, completedByForGuest: { id: 3 } } as unknown as Reservation;
    expect(canReopenCloseOut(reviewed, ADMIN, PILOT)).toBe(true);
  });
});

describe("canOverrideReservationPayment after sign-off", () => {
  it("is allowed on a signed-off but unbilled flight", () => {
    const r = soloFlight({ signedOff: true });
    expect(canOverrideReservationPayment(r, ADMIN, null, BILLING_LIVE)).toBe(true);
  });

  it("is refused once an invoice stands, and allowed once it is voided", () => {
    expect(
      canOverrideReservationPayment(
        soloFlight({ signedOff: true, invoices: LIVE_INVOICE }),
        ADMIN,
        null,
        BILLING_LIVE
      )
    ).toBe(false);
    expect(
      canOverrideReservationPayment(
        soloFlight({ signedOff: true, invoices: VOIDED_INVOICE }),
        ADMIN,
        null,
        BILLING_LIVE
      )
    ).toBe(true);
  });

  //A guest flight at a school with billing on mints its invoice at close-out, so the lock
  //still lands, just through money rather than through a flag that nothing ever cleared.
  it("is refused on a guest flight whose close-out invoice stands", () => {
    const guest = {
      ...soloFlight({ signedOff: true, invoices: LIVE_INVOICE }),
      type: "guest",
      completedByForGuest: { id: 3 },
    } as unknown as Reservation;
    expect(canOverrideReservationPayment(guest, ADMIN, null, BILLING_LIVE)).toBe(false);
  });

  it("stays hidden entirely at a school that is not billing through the product", () => {
    const r = soloFlight({ signedOff: true });
    expect(canOverrideReservationPayment(r, ADMIN, null, { enabled: false })).toBe(false);
  });

  it("stays refused on maintenance, which pricing declines outright", () => {
    const maintenance = { ...soloFlight({ signedOff: true }), type: "maintenance" } as Reservation;
    expect(canOverrideReservationPayment(maintenance, ADMIN, null, BILLING_LIVE)).toBe(false);
  });
});

/**
 * NOTHING TO CORRECT IS NOT THE SAME AS "CORRECTABLE WITH NO FIELDS".
 *
 * `isRampedIn` alone was the gate, and it is true for two ordinary bookings that hold no
 * figures at all: a GLIDER, ramped in on its timestamp with no Hobbs and no tach, and a
 * GROUP GROUND with students and no instructor, ramped in on `!hasInstruction` with no
 * briefing. The correction modal renders a field only for a value the booking already
 * holds, so both opened with zero inputs and a live Save that posted an empty body. Every
 * server refusal is per-field, so an empty body passed them all and fell through to the
 * unconditional sign-off delete: a silent reopen announced as "Times corrected", and
 * without the confirm the real Reopen button carries.
 */
describe("bookings with nothing to correct", () => {
  const glider = {
    id: 2,
    type: "solo",
    cancelledAt: null,
    start: "2026-08-28T15:00:00.000Z",
    end: "2026-08-28T17:00:00.000Z",
    createdBy: { id: PILOT },
    personnel: { instructors: [], students: [], renters: [{ id: PILOT }] },
    resource: { id: 2, type: { plane: { id: 2, tailNumber: "N21ASK", meterMode: "none" } } },
    review: { rampedOutAt: "2026-08-28T15:00:00.000Z", rampedInAt: "2026-08-28T17:00:00.000Z", reviewConfirmations: [] },
    invoices: [],
    payers: [],
  } as unknown as Reservation;

  const groupGround = {
    id: 3,
    type: "ground",
    cancelledAt: null,
    start: "2026-08-28T15:00:00.000Z",
    end: "2026-08-28T17:00:00.000Z",
    createdBy: { id: PILOT },
    personnel: { instructors: [], students: [{ id: PILOT }], renters: [] },
    resource: null,
    review: { reviewConfirmations: [] },
    invoices: [],
    payers: [],
  } as unknown as Reservation;

  it("reports a glider that flew as ramped in but with nothing to correct", () => {
    expect(hasCorrectableReadings(glider)).toBe(false);
    expect(canCorrectReviewTimes(glider, ADMIN, PILOT)).toBe(false);
  });

  it("reports an instructorless group ground the same way", () => {
    expect(hasCorrectableReadings(groupGround)).toBe(false);
    expect(canCorrectReviewTimes(groupGround, ADMIN, PILOT)).toBe(false);
  });

  it("still allows a correction once a briefing figure exists", () => {
    const briefed = { ...groupGround, review: { briefing: 90, reviewConfirmations: [] } } as unknown as Reservation;
    expect(hasCorrectableReadings(briefed)).toBe(true);
    expect(canCorrectReviewTimes(briefed, ADMIN, PILOT)).toBe(true);
  });

  it("counts a tach-only booking, not just a Hobbs one", () => {
    const tachOnly = {
      ...soloFlight(),
      review: { tachTimeOut: 40511, tachTimeIn: 40544, reviewConfirmations: [] },
    } as unknown as Reservation;
    expect(hasCorrectableReadings(tachOnly)).toBe(true);
  });

  //Half a pair is not a pair. The server refuses to write one side alone.
  it("does not count a booking holding only an OUT reading", () => {
    const away = { ...soloFlight(), review: { hobbsTimeOut: 40511, reviewConfirmations: [] } } as unknown as Reservation;
    expect(hasCorrectableReadings(away)).toBe(false);
  });
});

/**
 * THE TWO RULES ADVERSARIAL REVIEW FOUND THE CLIENTS DISAGREEING WITH THE SERVER ON.
 *
 * Both were the exact failure this whole change exists to remove: a button offered and then
 * refused, or withheld when the server would have accepted it.
 */
describe("agreeing with the server", () => {
  //The server counts a waived payer's live ledger charge, because the flag says who SHOULD
  //have paid and does not un-debit an account that already was. The console excluded them,
  //so it offered Correct times and Reopen on a booking the server would refuse with
  //"already been charged to the account ledger".
  it("counts a waived payer's live ledger charge as money", () => {
    const waivedButCharged = soloFlight({
      signedOff: true,
      payers: [{ waived: true, ledgerEntry: { id: 3, reversedBy: null } }],
    });

    expect(hasLiveBill(waivedButCharged)).toBe(true);
    expect(canCorrectReviewTimes(waivedButCharged, ADMIN, PILOT)).toBe(false);
    expect(canReopenCloseOut(waivedButCharged, ADMIN, PILOT)).toBe(false);
  });

  it("still ignores a waived payer whose charge was reversed", () => {
    const reversed = soloFlight({
      signedOff: true,
      payers: [{ waived: true, ledgerEntry: { id: 3, reversedBy: { id: 4 } } }],
    });
    expect(hasLiveBill(reversed)).toBe(false);
  });

  //A signature is worth taking back the moment ONE exists. Requiring a complete set hid the
  //case the feature's own rationale names: on a two-pilot dual the student signs off by
  //mistake at 1 of 2, and the wrong PIN could not be removed until the instructor also
  //signed. The server has always accepted it.
  it("offers a reopen at a PARTIAL sign-off, as the server does", () => {
    const dual = {
      ...soloFlight(),
      type: "dual",
      personnel: { instructors: [{ id: 42 }], students: [{ id: PILOT }], renters: [] },
      review: {
        hobbsTimeOut: 40511,
        hobbsTimeIn: 40544,
        reviewConfirmations: [{ id: 1, reviewedBy: { id: PILOT } }],
      },
    } as unknown as Reservation;

    expect(reviewIsComplete(dual)).toBe(false);
    expect(canReopenCloseOut(dual, ADMIN, PILOT)).toBe(true);
  });

  //Still nothing to take back when nobody has signed at all.
  it("does not offer one when no PIN has been entered", () => {
    expect(canReopenCloseOut(soloFlight(), ADMIN, PILOT)).toBe(false);
  });
});
