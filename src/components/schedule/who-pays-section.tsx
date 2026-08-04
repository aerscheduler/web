import * as React from "react";
import { Loader2, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { useSetReservationPayers } from "@/features/queries";
import { PILOT_ROLES, type PilotRole, type Reservation, type ReservationPayerInput } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";

/**
 * Who pays what, on a booking with more than one person on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ALWAYS OFFERED, NOT GATED ON THE ORG'S RULE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The obvious design is to show the hours fields only when the organization's rule for that
 * charge is "each pays their own time". It isn't possible, and it wouldn't be right anyway.
 *
 * Not possible: the split rules are admin-only (`GET /organizations/splitRules` is behind
 * `isOrgAdmin`), and the person closing out a flight is usually the instructor or the
 * dispatcher. Fetching the rules here would 403 for exactly the people who use this screen.
 *
 * Not right: recording who flew which leg is worth doing regardless of how the money
 * divides. It is the honest record of the flight, and the engine simply ignores the fields
 * its rule doesn't need. So everything is offered, and the copy says so rather than
 * pretending the entry is mandatory.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * HOURS ARE TENTHS, AND THE INPUT SAYS SO
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The meters are stored in tenths of an hour, because that is how a Hobbs reads. A
 * dispatcher types "1014.2"; what goes over the wire is 10142. Doing that conversion at the
 * boundary keeps the whole rest of the stack in one unit, and stops a decimal point becoming
 * a factor-of-ten billing error.
 */

/** A person on the booking who can hold a stake. */
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
  hobbsOut: string;
  hobbsIn: string;
  instructionMinutes: string;
  sharePercent: string;
  waived: boolean;
  waivedReason: string;
  pilotRole: PilotRole | "";
};

const EMPTY: Draft = {
  hobbsOut: "",
  hobbsIn: "",
  instructionMinutes: "",
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

function partiesOf(r: Reservation): Party[] {
  const p = r.personnel;
  const out: Party[] = [];
  for (const s of p?.students ?? [])
    out.push({ key: `o${s.id}`, name: s.user?.name ?? `Member #${s.id}`, orgUserId: s.id, side: "Student" });
  for (const s of p?.renters ?? [])
    out.push({ key: `o${s.id}`, name: s.user?.name ?? `Member #${s.id}`, orgUserId: s.id, side: "Renter" });
  for (const s of p?.instructors ?? [])
    out.push({ key: `o${s.id}`, name: s.user?.name ?? `Member #${s.id}`, orgUserId: s.id, side: "Instructor" });
  for (const g of p?.guests ?? []) out.push({ key: `g${g.id}`, name: g.name, guestId: g.id, side: "Guest" });
  return out;
}

export function WhoPaysSection({ r }: { r: Reservation }) {
  const parties = React.useMemo(() => partiesOf(r), [r]);
  const save = useSetReservationPayers(r.id);

  // Seed from what's stored. A booking with no stakes recorded is the normal case, and it
  // seeds empty — which reads correctly as "nothing entered", not as "everyone owes zero".
  const seed = React.useCallback((): Record<string, Draft> => {
    const out: Record<string, Draft> = {};
    for (const party of parties) {
      const stored = (r.payers ?? []).find((p) =>
        party.orgUserId != null ? p.orgUser?.id === party.orgUserId : p.guest?.id === party.guestId
      );
      out[party.key] = stored
        ? {
            hobbsOut: tenthsToHours(stored.hobbsOut),
            hobbsIn: tenthsToHours(stored.hobbsIn),
            instructionMinutes: stored.instructionMinutes == null ? "" : String(stored.instructionMinutes),
            sharePercent: stored.weightBps == null ? "" : String(stored.weightBps / 100),
            waived: !!stored.waived,
            waivedReason: stored.waivedReason ?? "",
            pilotRole: (stored.pilotRole as PilotRole) ?? "",
          }
        : { ...EMPTY };
    }
    return out;
  }, [parties, r.payers]);

  const [drafts, setDrafts] = React.useState<Record<string, Draft>>(seed);
  const [dirty, setDirty] = React.useState(false);

  // Re-seed when the booking changes underneath us, but never over unsaved edits — a
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
   * actually ran, because scaling them to fit would bill hours the aeroplane never flew.
   * That refusal is correct but it arrives late — after the dispatcher has finished and hit
   * a button. Doing the same arithmetic here turns it into a running total they can watch
   * converge, so the refusal should never actually fire.
   */
  const flightTenths = React.useMemo(() => {
    const rev = r.review;
    if (rev?.hobbsTimeIn != null && rev?.hobbsTimeOut != null) return rev.hobbsTimeIn - rev.hobbsTimeOut;
    if (rev?.tachTimeIn != null && rev?.tachTimeOut != null) return rev.tachTimeIn - rev.tachTimeOut;
    return null;
  }, [r.review]);

  const legsTenths = billed.reduce((sum, p) => {
    const d = drafts[p.key];
    const out = hoursToTenths(d?.hobbsOut ?? "");
    const inn = hoursToTenths(d?.hobbsIn ?? "");
    return out != null && inn != null ? sum + (inn - out) : sum;
  }, 0);

  const anyLegEntered = billed.some(
    (p) => hoursToTenths(drafts[p.key]?.hobbsOut ?? "") != null && hoursToTenths(drafts[p.key]?.hobbsIn ?? "") != null
  );
  const allLegsEntered =
    billed.length > 0 &&
    billed.every(
      (p) => hoursToTenths(drafts[p.key]?.hobbsOut ?? "") != null && hoursToTenths(drafts[p.key]?.hobbsIn ?? "") != null
    );

  const legsReconcile = flightTenths != null && legsTenths === flightTenths;

  const shareTotal = billed.reduce((sum, p) => sum + (percentToBps(drafts[p.key]?.sharePercent ?? "") ?? 0), 0);
  const anyShareEntered = billed.some((p) => percentToBps(drafts[p.key]?.sharePercent ?? "") != null);

  const submit = () => {
    const payers: ReservationPayerInput[] = parties.map((party) => {
      const d = drafts[party.key];
      return {
        ...(party.orgUserId != null ? { orgUserId: party.orgUserId } : { guestId: party.guestId }),
        hobbsOut: hoursToTenths(d.hobbsOut),
        hobbsIn: hoursToTenths(d.hobbsIn),
        instructionMinutes: d.instructionMinutes.trim() ? Number(d.instructionMinutes) : null,
        weightBps: percentToBps(d.sharePercent),
        waived: d.waived,
        waivedReason: d.waived && d.waivedReason.trim() ? d.waivedReason.trim() : null,
        pilotRole: d.pilotRole || null,
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

  // One person on a booking is billed the whole thing under every rule, so there is nothing
  // here for them to decide.
  if (parties.length < 2) return null;

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">Who pays what</div>
            <p className="text-xs text-muted-foreground">
              {parties.length} people on this booking. Fill in only what your cost-splitting rules
              use — anything else is ignored.
            </p>
          </div>
        </div>
        <Button size="sm" disabled={save.isPending || !dirty} onClick={submit}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
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
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">Hobbs out</Label>
                    <Input
                      value={d.hobbsOut}
                      onChange={(e) => set(party.key, { hobbsOut: e.target.value })}
                      inputMode="decimal"
                      placeholder="e.g. 1014.2"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">Hobbs in</Label>
                    <Input
                      value={d.hobbsIn}
                      onChange={(e) => set(party.key, { hobbsIn: e.target.value })}
                      inputMode="decimal"
                      placeholder="e.g. 1015.6"
                      className="h-8 text-sm"
                    />
                  </div>
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
                  <div className="space-y-1">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">Role</Label>
                    <select
                      value={d.pilotRole}
                      onChange={(e) => set(party.key, { pilotRole: e.target.value as PilotRole | "" })}
                      className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="">—</option>
                      {PILOT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The running totals. Both only appear once somebody has started entering the thing
          they describe — an untouched close-out shouldn't be shouting about a mismatch. */}
      {(anyLegEntered || anyShareEntered) && (
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
                ` — off by ${Math.abs((legsTenths - flightTenths) / 10).toFixed(1)}. These have to match, or we can't bill it.`}
              {allLegsEntered && legsReconcile && " — adds up."}
            </div>
          )}
          {anyLegEntered && flightTenths == null && (
            <div className="text-muted-foreground">
              The aircraft's own readings aren't in yet, so there's nothing to check these against
              until it's ramped in.
            </div>
          )}
          {anyShareEntered && (
            <div
              className={
                shareTotal !== 10_000 ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground"
              }
            >
              Shares total {(shareTotal / 100).toFixed(shareTotal % 100 === 0 ? 0 : 2)}%
              {shareTotal !== 10_000 && " — has to be 100%."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
