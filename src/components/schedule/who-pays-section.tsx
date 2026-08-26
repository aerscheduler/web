import * as React from "react";
import { Loader2, Save, SplitSquareHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import { useSetReservationPayers } from "@/features/queries";
import { PILOT_ROLES, type PilotRole, type Reservation, type ReservationPayerInput } from "@/types/api";
import { billsOnHobbs, readsMeters, hasInstruction } from "./close-out";
import { CloseOutCard } from "./close-out-card";
import { DocsHint } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";

/**
 * Who pays what, on a booking with more than one PAYER on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * IT LISTS PAYERS, NOT PEOPLE, AND THAT IS NOT COSMETIC
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * This used to list everyone on the booking, instructors included, which put an instructor
 * in a table headed "who pays" and asked a dispatcher to give them a share. An instructor
 * flying with students is being PAID, not billed. `buildPayers` in the server's
 * splitInvoicing.ts settles this once, students and renters, else the instructors, and on
 * a guest booking the guest, and this mirrors it exactly rather than inventing a second
 * answer.
 *
 * The mismatch was not merely confusing, it produced close-outs the server then refuses.
 * Two students and an instructor on a dual, split by set shares: the panel showed three
 * rows and asked for 100% across them, so 33/33/34 looked correct here and reached the
 * engine as two students holding 66% of the booking, which is `weights_invalid`. The same
 * hole ran through the meter reconciliation, where the instructor's leg was counted into a
 * total the engine computes without it.
 *
 * The people who are on the booking but not billed are named in the header instead, because
 * "where did the instructor go" is a fair question and the answer is one sentence.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * ONLY THE FIELDS THE BOOKING CAN ACTUALLY HAVE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * A ground lesson has no aircraft, so it has no Hobbs reading, nobody is pilot in command
 * of a classroom, and the one figure that does divide is instruction time, which was the
 * single field this panel never offered. It asked for the three that cannot exist and
 * omitted the one that does. `readsMeters` is the same helper the ramp modal keys on, so
 * the two screens agree about what a booking is measured with. It answers false for a
 * glider as well as for a classroom: one departs and one does not, but neither produces a
 * reading, and a per-pilot leg on a meter that does not exist is a field nobody can fill.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS STILL NOT GATED ON THE ORG'S RULE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The obvious next step is to show the hours fields only when the organization's rule for
 * that charge is "each pays their own time". It isn't possible, and it wouldn't be right.
 *
 * Not possible: the split rules are admin-only (`GET /organizations/splitRules` is behind
 * `isOrgAdmin`), and the person closing out a flight is usually the instructor or the
 * dispatcher. Fetching the rules here would 403 for exactly the people who use this screen.
 *
 * Not right: recording who flew which leg is worth doing regardless of how the money
 * divides. It is the honest record of the flight, and the engine simply ignores the fields
 * its rule doesn't need. So everything the booking CAN have is offered, and the copy says
 * so rather than pretending the entry is mandatory.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * HOURS ARE TENTHS, AND THE INPUT SAYS SO
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The meters are stored in tenths of an hour, because that is how a Hobbs reads. A
 * dispatcher types "1014.2"; what goes over the wire is 10142. Doing that conversion at the
 * boundary keeps the whole rest of the stack in one unit, and stops a decimal point becoming
 * a factor-of-ten billing error.
 *
 * Instruction is the exception, and only in the wire format: `ReservationPayer` stores it in
 * MINUTES. It is entered here in hours like everything else on the close-out, and converted
 * as whole tenths (`hours → tenths → ×6 minutes`) so the value is always a multiple of six.
 * That matters because the engine converts back by dividing by six: anything else would
 * round on the way in, and a figure that changes when you reopen the screen reads as the
 * software losing your entry.
 */

/** A person on the booking who holds a stake. */
type Party = {
  key: string;
  name: string;
  orgUserId?: number;
  guestId?: number;
  /** Which roster they're on, shown so a dispatcher can tell two people apart. */
  side: string;
};

/** Editable state for one person. Strings, because these are text inputs mid-typing. */
type Draft = {
  /** The out reading on the meter this booking BILLS on. See `billsOnHobbs`. */
  meterOut: string;
  /** The in reading on the same meter. */
  meterIn: string;
  /** Hours, not minutes. See the header. */
  instructionHours: string;
  sharePercent: string;
  waived: boolean;
  waivedReason: string;
  pilotRole: PilotRole | "";
};

const EMPTY: Draft = {
  meterOut: "",
  meterIn: "",
  instructionHours: "",
  sharePercent: "",
  waived: false,
  waivedReason: "",
  pilotRole: "",
};

const ROLE_LABEL: Record<PilotRole, string> = {
  pic: "Pilot in command",
  safety_pilot: "Safety pilot",
  sic: "Second in command",
  passenger: "Passenger",
};

/** Hours as typed ("1014.2") → tenths (10142). Empty stays empty. */
function hoursToTenths(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10);
}

/** Tenths → hours, for seeding the input from what's stored. */
function tenthsToHours(v: number | null | undefined): string {
  return v == null ? "" : (v / 10).toFixed(1);
}

/** Percent as typed ("60") → basis points (6000). */
function percentToBps(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

const nameOf = (o: { id: number; user?: { name?: string | null } | null }) =>
  o.user?.name ?? `Member #${o.id}`;

const asParty = (o: { id: number; user?: { name?: string | null } | null }, side: string): Party => ({
  key: `o${o.id}`,
  name: nameOf(o),
  orgUserId: o.id,
  side,
});

/**
 * Who owes money on this booking, in the server's order.
 *
 * A straight mirror of `buildPayers` (server/src/utils/splitInvoicing.ts): students and
 * renters, or the instructors when there is nobody else, and on a guest booking the guest.
 * Order matters there (it decides who takes a `whole` line and who gets the leftover cent)
 * so it is preserved here too, and the row order a dispatcher sees is the order the money
 * follows.
 */
function payersOf(r: Reservation): Party[] {
  const p = r.personnel;

  // A discovery flight has one customer paying, whoever else is aboard.
  if (r.type === "guest") {
    return (p?.guests ?? []).map((g) => ({ key: `g${g.id}`, name: g.name, guestId: g.id, side: "Guest" }));
  }

  const students = (p?.students ?? []).map((s) => asParty(s, "Student"));
  const renters = (p?.renters ?? []).map((s) => asParty(s, "Renter"));
  const instructors = (p?.instructors ?? []).map((s) => asParty(s, "Instructor"));

  // An instructor is a payer only when there is nobody else: flying alone, they are renting
  // the aircraft. With a student aboard they are being paid.
  return students.length || renters.length ? [...students, ...renters] : instructors;
}

/**
 * On the booking, but not billed for it. Named in the header so their absence isn't a puzzle.
 *
 * Only instructors can land here, and that falls out of `payersOf` rather than being assumed:
 * students and renters are always billed when present, an instructor is billed when there is
 * nobody else, and the sides a guest booking forbids mean the guest's crew is the instructor.
 * So the sentence can say WHY they aren't billed, which is the thing worth saying.
 */
function nonPayersOf(r: Reservation, payers: Party[]): string[] {
  const billed = new Set(payers.map((x) => x.key));
  return (r.personnel?.instructors ?? [])
    .map((s) => asParty(s, "Instructor"))
    .filter((x) => !billed.has(x.key))
    .map((x) => x.name);
}

/** "Ann", ", Ann and Bo", ", Ann, Bo and Cy". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Divide `total` tenths into `n` parts that still add up to `total`.
 *
 * Every part has to be a whole tenth, because that is the resolution a Hobbs has and the
 * unit the engine bills in. 2.5 hours between two pilots is 1.3 and 1.2, not 1.25 twice:
 * the remainder goes to the earlier payers rather than being rounded away, so the legs
 * reconcile against the aircraft exactly and the close-out is billable.
 */
function evenTenths(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const spare = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < spare ? 1 : 0));
}

/**
 * TWO COLUMNS, ALWAYS, WHATEVER THE SCREEN SAYS.
 *
 * This grid used to widen with the VIEWPORT, up to five columns on a large monitor. The
 * panel it sits in is `sm:max-w-md`, so it never gets wider than 448px no matter how big
 * the display is: on the desktop this laid five inputs and their labels across roughly 70px
 * each, which is where "Instruction (hrs)" wrapped to three lines above a box too narrow to
 * show the number typed into it. A viewport breakpoint inside a fixed-width sheet is simply
 * a wrong measurement, and this is what it looked like.
 */
const FIELD_GRID = "grid-cols-2";

export function WhoPaysSection({ r }: { r: Reservation }) {
  const parties = React.useMemo(() => payersOf(r), [r]);
  const notBilled = React.useMemo(() => nonPayersOf(r, parties), [r, parties]);
  const save = useSetReservationPayers(r.id);

  // What this booking can be measured with. A ground lesson has no meters and no pilot in
  // command; a classroom has no rate at all, so instruction is the only thing to divide.
  //A glider has no meters either, so there are no per-pilot legs to collect on one. It is
  //not covered by `usesBriefingNotMeters`, which asks whether anything departs.
  const hasMeters = readsMeters(r);
  const billsInstruction = hasInstruction(r);
  // Pilot roles are a property of a flight. Nobody is second in command of a simulator or a
  // briefing room, and offering the field there invites a record that isn't true.
  const hasRoles = r.resource?.type?.plane != null;

  // WHICH METER. The server prices this booking off the resource's own `billByHobbsTime`
  // and reconciles each leg below against that figure, so the panel has to ask for the same
  // one. Collecting Hobbs legs on a tach-billed aircraft produced a sum that could never
  // match the total, and the close-out was refused with a message blaming the readings.
  const onHobbs = billsOnHobbs(r);
  const meterName = onHobbs ? "Hobbs" : "Tach";

  // Seed from what's stored. A booking with no stakes recorded is the normal case, and it
  // seeds empty, which reads correctly as "nothing entered", not as "everyone owes zero".
  const seed = React.useCallback((): Record<string, Draft> => {
    const out: Record<string, Draft> = {};
    for (const party of parties) {
      const stored = (r.payers ?? []).find((p) =>
        party.orgUserId != null ? p.orgUser?.id === party.orgUserId : p.guest?.id === party.guestId
      );
      out[party.key] = stored
        ? {
            meterOut: tenthsToHours(onHobbs ? stored.hobbsOut : stored.tachOut),
            meterIn: tenthsToHours(onHobbs ? stored.hobbsIn : stored.tachIn),
            instructionHours:
              stored.instructionMinutes == null ? "" : tenthsToHours(Math.round(stored.instructionMinutes / 6)),
            sharePercent: stored.weightBps == null ? "" : String(stored.weightBps / 100),
            waived: !!stored.waived,
            waivedReason: stored.waivedReason ?? "",
            pilotRole: (stored.pilotRole as PilotRole) ?? "",
          }
        : { ...EMPTY };
    }
    return out;
  }, [parties, r.payers, onHobbs]);

  const [drafts, setDrafts] = React.useState<Record<string, Draft>>(seed);
  const [dirty, setDirty] = React.useState(false);

  // Re-seed when the booking changes underneath us, but never over unsaved edits, a
  // background refetch must not silently discard half-typed meter readings.
  React.useEffect(() => {
    if (!dirty) setDrafts(seed());
  }, [seed, dirty]);

  const set = (key: string, patch: Partial<Draft>) => {
    setDirty(true);
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  // Only people who are being billed count toward the totals shown below.
  const billed = parties.filter((p) => !drafts[p.key]?.waived);

  /**
   * The reconciliation the server will do anyway, shown WHILE typing.
   *
   * The engine refuses a close-out whose individual legs don't add up to what the aircraft
   * actually ran, because scaling them to fit would bill hours the aircraft never flew.
   * That refusal is correct but it arrives late, after the dispatcher has finished and hit
   * a button. Doing the same arithmetic here turns it into a running total they can watch
   * converge, so the refusal should never actually fire.
   */
  const flightTenths = React.useMemo(() => {
    const rev = r.review;
    // The BILLED meter, with no fallback to the other one. This used to prefer Hobbs and
    // fall back to tach, so on a tach-billed aircraft where both were recorded the running
    // total was measured against the Hobbs figure while the server priced the tach one, and
    // a panel that said the legs added up met a refusal that said they did not.
    if (onHobbs) {
      return rev?.hobbsTimeIn != null && rev?.hobbsTimeOut != null ? rev.hobbsTimeIn - rev.hobbsTimeOut : null;
    }
    return rev?.tachTimeIn != null && rev?.tachTimeOut != null ? rev.tachTimeIn - rev.tachTimeOut : null;
  }, [r.review, onHobbs]);

  const legsTenths = billed.reduce((sum, p) => {
    const d = drafts[p.key];
    const out = hoursToTenths(d?.meterOut ?? "");
    const inn = hoursToTenths(d?.meterIn ?? "");
    return out != null && inn != null ? sum + (inn - out) : sum;
  }, 0);

  const anyLegEntered = billed.some(
    (p) => hoursToTenths(drafts[p.key]?.meterOut ?? "") != null && hoursToTenths(drafts[p.key]?.meterIn ?? "") != null
  );
  const allLegsEntered =
    billed.length > 0 &&
    billed.every(
      (p) => hoursToTenths(drafts[p.key]?.meterOut ?? "") != null && hoursToTenths(drafts[p.key]?.meterIn ?? "") != null
    );

  const legsReconcile = flightTenths != null && legsTenths === flightTenths;

  // The same running total for instruction, against the booking's own briefing figure. Only
  // meaningful when the school splits instruction by each person's own time: a class charged
  // per head is four students each owing the whole two hours, and that is SUPPOSED to come to
  // more than the lesson ran. So this reports rather than scolds, and names the condition.
  const briefingTenths = r.review?.briefing ?? null;

  const instructionTenths = billed.reduce((sum, p) => {
    const v = hoursToTenths(drafts[p.key]?.instructionHours ?? "");
    return v != null ? sum + v : sum;
  }, 0);

  const anyInstructionEntered = billed.some((p) => hoursToTenths(drafts[p.key]?.instructionHours ?? "") != null);
  const allInstructionEntered =
    billed.length > 0 && billed.every((p) => hoursToTenths(drafts[p.key]?.instructionHours ?? "") != null);
  const instructionReconciles = briefingTenths != null && instructionTenths === briefingTenths;

  const shareTotal = billed.reduce((sum, p) => sum + (percentToBps(drafts[p.key]?.sharePercent ?? "") ?? 0), 0);
  const anyShareEntered = billed.some((p) => percentToBps(drafts[p.key]?.sharePercent ?? "") != null);

  /**
   * Fill the whole panel with an even split, in one press.
   *
   * THE SHORTCUT THE SHARED RIDE ACTUALLY NEEDED.
   *
   * Two pilots taking an aircraft out together is the ordinary case this panel exists for,
   * and doing it by hand meant typing six numbers and getting the arithmetic right: the
   * legs have to be consecutive and sum to exactly what the aircraft flew, or the server
   * refuses the close-out. People got that wrong, then met a refusal at the end.
   *
   * The legs are laid out CONSECUTIVELY from the recorded out reading, which is also what
   * really happened: the first pilot flies from 1014.2 to 1015.2 and hands over, the second
   * flies 1015.2 to 1016.2. Shares and instruction divide the same way, and every remainder
   * lands on the earlier payers so the totals are exact rather than nearly right.
   *
   * It fills the fields rather than saving them. A dispatcher who then swaps two readings
   * because one pilot flew the longer leg is doing the normal thing, and Save is still
   * theirs to press.
   */
  const splitEvenly = () => {
    const n = billed.length;
    if (n === 0) return;

    const legs = flightTenths != null && flightTenths > 0 ? evenTenths(flightTenths, n) : null;
    //Lay the legs out from the booking's own out reading, on the meter it bills from.
    const legStart = hoursToTenths(
      tenthsToHours(onHobbs ? r.review?.hobbsTimeOut : r.review?.tachTimeOut)
    );
    const instruction =
      briefingTenths != null && briefingTenths > 0 ? evenTenths(briefingTenths, n) : null;
    const shares = evenTenths(10_000, n);

    let cursor = legStart;
    const next: Record<string, Draft> = { ...drafts };
    billed.forEach((party, i) => {
      const d = next[party.key] ?? EMPTY;
      const patch: Draft = { ...d, sharePercent: String(shares[i] / 100) };
      if (hasMeters && legs && cursor != null) {
        patch.meterOut = tenthsToHours(cursor);
        cursor += legs[i];
        patch.meterIn = tenthsToHours(cursor);
      }
      if (billsInstruction && instruction) {
        patch.instructionHours = tenthsToHours(instruction[i]);
      }
      next[party.key] = patch;
    });

    setDirty(true);
    setDrafts(next);
  };

  const submit = () => {
    const payers: ReservationPayerInput[] = parties.map((party) => {
      const d = drafts[party.key];
      const instructionTenthsForPayer = billsInstruction ? hoursToTenths(d.instructionHours) : null;
      return {
        ...(party.orgUserId != null ? { orgUserId: party.orgUserId } : { guestId: party.guestId }),
        // Never send a figure for something this booking can't have. A stale Hobbs reading
        // left on a booking that was later changed to a ground lesson would otherwise be
        // rewritten back with every save.
        // Only the meter this booking bills on. Sending the other one too would put a
        // number nobody entered on the record, and the reading it implies is not the one
        // the aircraft was priced from.
        hobbsOut: hasMeters && onHobbs ? hoursToTenths(d.meterOut) : null,
        hobbsIn: hasMeters && onHobbs ? hoursToTenths(d.meterIn) : null,
        tachOut: hasMeters && !onHobbs ? hoursToTenths(d.meterOut) : null,
        tachIn: hasMeters && !onHobbs ? hoursToTenths(d.meterIn) : null,
        // Tenths back to minutes, always a whole multiple of six. See the header.
        instructionMinutes: instructionTenthsForPayer == null ? null : instructionTenthsForPayer * 6,
        weightBps: percentToBps(d.sharePercent),
        waived: d.waived,
        waivedReason: d.waived && d.waivedReason.trim() ? d.waivedReason.trim() : null,
        pilotRole: hasRoles ? d.pilotRole || null : null,
      };
    });

    save.mutate(payers, {
      onSuccess: () => {
        setDirty(false);
        toast.success("Saved who pays what.");
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save that."),
    });
  };

  // One payer is billed the whole booking under every rule, so there is nothing here for
  // them to decide. This is why an ordinary ground lesson (one instructor, one student)
  // shows nothing: only the student is billed.
  if (parties.length < 2) return null;

  // Nothing on this booking costs anything to divide, a classroom with no instructor on it
  // has neither a resource rate nor an instruction line. Asking for shares of nothing is
  // worse than asking nothing at all.
  if (!hasMeters && !billsInstruction) return null;

  //WHAT THE CARD SAYS WHILE IT IS SHUT.
  //
  //A dispatcher opening a booking wants to know whether the split needs them, not to read
  //a grid of inputs. Three states are worth a word: nothing entered yet, entered and it
  //adds up, entered and it does not. Only the last one is a problem, and only the last one
  //opens the card by itself.
  const legsBroken = allLegsEntered && flightTenths != null && !legsReconcile;
  const sharesBroken = anyShareEntered && shareTotal !== 10_000;
  const attention = legsBroken || sharesBroken;
  const summary = attention
    ? legsBroken && sharesBroken
      ? "hours and shares do not add up"
      : legsBroken
        ? "hours do not add up"
        : "shares do not add up"
    : anyShareEntered || anyLegEntered || anyInstructionEntered
      ? `${billed.length} payers, split recorded`
      : `${billed.length} payers, nothing split yet`;

  return (
    <CloseOutCard
      title="Who pays what"
      icon={Users}
      summary={summary}
      attention={attention}
      docShot="who-pays-what-panel"
    >
    <div className="-m-3 rounded-md">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              How this booking divides
              <DocsHint topic="who-pays-what" />
            </div>
            <p className="text-xs text-muted-foreground">
              {parties.length} people are billed for this booking. Fill in only what your
              cost-splitting rules use. Anything else is ignored.
              {notBilled.length > 0 && (
                <>
                  {" "}
                  {listNames(notBilled)} {notBilled.length === 1 ? "is" : "are"} instructing, so they
                  aren't billed.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The one press that fills every field with the split people actually meant.
              Offered only once there is something to divide: before the aircraft is back
              there are no hours to lay out, and an even split of nothing is a lie. */}
          {(flightTenths != null || briefingTenths != null) && (
            <Button size="sm" variant="outline" onClick={splitEvenly}>
              <SplitSquareHorizontal className="size-4" />
              Split evenly
            </Button>
          )}
          <Button size="sm" disabled={save.isPending || !dirty} onClick={submit}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {parties.map((party) => {
          const d = drafts[party.key] ?? EMPTY;
          return (
            <div key={party.key} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{party.name}</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    {party.side}
                  </Badge>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={d.waived}
                    onChange={(e) => set(party.key, { waived: e.target.checked })}
                    className="size-3.5 accent-primary"
                  />
                  Not billed
                </label>
              </div>

              {d.waived ? (
                <Input
                  value={d.waivedReason}
                  onChange={(e) => set(party.key, { waivedReason: e.target.value })}
                  placeholder="Why? e.g. Safety pilot"
                  maxLength={60}
                  className="h-8 text-sm"
                />
              ) : (
                <div className={`grid items-end gap-2 ${FIELD_GRID}`}>
                  {hasMeters && (
                    <>
                      <div className="space-y-1">
                        <Label className="whitespace-nowrap text-xs text-muted-foreground">{meterName} out</Label>
                        <Input
                          value={d.meterOut}
                          onChange={(e) => set(party.key, { meterOut: e.target.value })}
                          inputMode="decimal"
                          placeholder="e.g. 1014.2"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="whitespace-nowrap text-xs text-muted-foreground">{meterName} in</Label>
                        <Input
                          value={d.meterIn}
                          onChange={(e) => set(party.key, { meterIn: e.target.value })}
                          inputMode="decimal"
                          placeholder="e.g. 1015.6"
                          className="h-8 text-sm"
                        />
                      </div>
                    </>
                  )}
                  {billsInstruction && (
                    <div className="space-y-1">
                      <Label className="whitespace-nowrap text-xs text-muted-foreground">Instruction (hrs)</Label>
                      <Input
                        value={d.instructionHours}
                        onChange={(e) => set(party.key, { instructionHours: e.target.value })}
                        inputMode="decimal"
                        placeholder="e.g. 1.5"
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">Share %</Label>
                    <Input
                      value={d.sharePercent}
                      onChange={(e) => set(party.key, { sharePercent: e.target.value })}
                      inputMode="decimal"
                      placeholder="e.g. 50"
                      className="h-8 text-sm"
                    />
                  </div>
                  {hasRoles && (
                    //Full width: "Pilot in command" and "Second in command" do not fit in
                    //half of a 448px panel, and a role nobody can read is a role nobody sets.
                    <div className="col-span-2 space-y-1">
                      <Label className="whitespace-nowrap text-xs text-muted-foreground">Role</Label>
                      <select
                        value={d.pilotRole}
                        onChange={(e) => set(party.key, { pilotRole: e.target.value as PilotRole | "" })}
                        className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                      >
                        <option value="">–</option>
                        {PILOT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The running totals. Each only appears once somebody has started entering the thing
          it describes, an untouched close-out shouldn't be shouting about a mismatch. */}
      {(anyLegEntered || anyInstructionEntered || anyShareEntered) && (
        <div className="space-y-1 border-t px-3 py-2 text-xs">
          {anyLegEntered && flightTenths != null && (
            <div
              className={
                allLegsEntered && !legsReconcile
                  ? "font-medium text-amber-600 dark:text-amber-500"
                  : "text-muted-foreground"
              }
            >
              Individual hours: {(legsTenths / 10).toFixed(1)} of {(flightTenths / 10).toFixed(1)} the
              aircraft flew
              {allLegsEntered &&
                !legsReconcile &&
                `, off by ${Math.abs((legsTenths - flightTenths) / 10).toFixed(1)}. These have to match, or we can't bill it.`}
              {allLegsEntered && legsReconcile && ". That adds up."}
            </div>
          )}
          {anyLegEntered && flightTenths == null && (
            <div className="text-muted-foreground">
              The aircraft's own readings aren't in yet, so there's nothing to check these against
              until it's ramped in.
            </div>
          )}
          {anyInstructionEntered && briefingTenths != null && (
            <div className="text-muted-foreground">
              Instruction: {(instructionTenths / 10).toFixed(1)} of {(briefingTenths / 10).toFixed(1)}{" "}
              recorded for the lesson
              {allInstructionEntered &&
                !instructionReconciles &&
                ". That's fine if each person is charged for the whole lesson, but if you split it by each person's own time these have to match."}
            </div>
          )}
          {anyShareEntered && (
            <div
              className={
                shareTotal !== 10_000 ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground"
              }
            >
              Shares total {(shareTotal / 100).toFixed(shareTotal % 100 === 0 ? 0 : 2)}%
              {shareTotal !== 10_000 && ". That has to be 100%."}
            </div>
          )}
        </div>
      )}
    </div>
    </CloseOutCard>
  );
}
