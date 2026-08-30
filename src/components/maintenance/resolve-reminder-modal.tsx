/**
 * Sign an inspection off.
 *
 * The field that matters here is the METER READING, and it is not a formality: signing off
 * an hour-based inspection starts the next interval counting from the number entered. Put
 * today's reading on a 100-hour that was actually done 6 hours ago and the next one comes
 * due 6 hours late, silently, and stays wrong for the life of the aircraft.
 *
 * So it defaults to the current meter (the common case, the work just happened) but is
 * editable, and the helper text says what the number is for rather than what it is.
 */

import * as React from "react";
import { DocsHint } from "@/components/docs-hint";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useResolveMaintenanceReminder } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { MaintenanceReminder } from "@/types/api";
import { MECHANIC_CERTIFICATE_TYPES, fromDeciHours, sourceLabel } from "@/lib/maintenance";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function ResolveReminderModal({
  reminder,
  open,
  onOpenChange,
}: {
  reminder: MaintenanceReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolve = useResolveMaintenanceReminder();
  const { user } = useAuth();
  //The server scopes orgUsers to the active org, so the first entry is this membership.
  const membership = user?.orgUsers?.[0];
  const due = reminder?.due;
  /**
   * The hour clock, wherever it is.
   *
   * On a combined interval ("100 hours or 12 months, whichever comes first") the CALENDAR
   * can be the side that came due, which makes `due.kind` "days" while the template is
   * still counting a meter. Asking only when `kind === "hours"` would sign that inspection
   * off with no reading, and the next interval's hour clock would start from nothing and
   * never count. Look for the meter on either side.
   */
  const hourSide = due?.kind === "hours" ? due : due?.also?.kind === "hours" ? due.also : null;
  const hourBased = hourSide != null || Boolean(reminder?.template?.remindHours);

  const [completedAt, setCompletedAt] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [hours, setHours] = React.useState("");
  const [notes, setNotes] = React.useState("");

  /**
   * THE COMPLIANCE HALF. Filled in only for a rule that is a regulation.
   *
   * Signing an oil change off should not demand a certificate number, so this is offered
   * rather than required: the server writes a permanent 14 CFR 91.417 record when a method
   * and a mechanic arrive, and otherwise behaves exactly as it always has.
   *
   * Opened by default when the template says it is an Airworthiness Directive, because for
   * those the record is the point of signing off at all.
   */
  const [tach, setTach] = React.useState("");
  const [hobbs, setHobbs] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [mechanicName, setMechanicName] = React.useState("");
  const [certNumber, setCertNumber] = React.useState("");
  const [certType, setCertType] = React.useState("");
  const [recording, setRecording] = React.useState(false);

  // Re-seed each time a different reminder is opened, not once on mount: this modal is
  // reused across every row in the list, so mount-time state would carry one row's meter
  // reading onto the next one you open.
  React.useEffect(() => {
    if (!open || !reminder) return;
    setCompletedAt(format(new Date(), "yyyy-MM-dd"));
    setHours(hourSide?.currentHours != null ? fromDeciHours(hourSide.currentHours) : "");
    setNotes("");
    setMethod("");
    //Prefilled from the aircraft so the normal case is confirming a number rather than
    //reading it off a panel and typing it. Both meters, whatever this rule counted:
    //Not because a regulation asks for both here, but so the record still reads correctly
    //to somebody working off the other clock. Neither is time in service per 14 CFR 1.1.
    const plane = reminder.resource?.type?.plane;
    setTach(plane?.tachTime != null ? fromDeciHours(plane.tachTime) : "");
    setHobbs(plane?.hobbsTime != null ? fromDeciHours(plane.hobbsTime) : "");
    //Prefilled from the signer's own membership. Six exact characters typed at every
    //signature is how a compliance log fills up with blanks and typos.
    setMechanicName(user?.name ?? "");
    setCertNumber(membership?.mechanicCertificateNumber ?? "");
    setCertType(membership?.mechanicCertificateType ?? "");
    setRecording(reminder.template?.sourceType === "ad");
  }, [open, reminder?.id, hourSide?.currentHours]);

  if (!reminder) return null;

  const name = due?.name ?? reminder.template?.name ?? "this inspection";
  // "Tach", not "tach", it opens a label, and the Hobbs case reads capitalised either way.
  const meter = hourSide?.basis === "hobbs" ? "Hobbs" : "Tach";
  const parsedHours = Number(hours);
  const hoursValid = !hourBased || (hours !== "" && Number.isFinite(parsedHours) && parsedHours >= 0);
  //A record with a method and nobody's name attached is not a record, and the server
  //refuses it. Say so here rather than after a round trip.
  const complianceValid = !recording || (method.trim().length > 0 && mechanicName.trim().length > 0);
  const sourceRef = reminder?.template?.sourceRef;

  async function submit() {
    if (!reminder) return;
    try {
      await resolve.mutateAsync({
        id: reminder.id,
        // Midday, so a date-only answer can't land on the previous day once it is read back
        // in a timezone west of the server.
        completedAt: new Date(`${completedAt}T12:00:00`).toISOString(),
        completedHours: hourBased && hours !== "" ? Math.round(parsedHours * 10) : undefined,
        notes: notes.trim() || undefined,
        ...(recording
          ? {
              methodOfCompliance: method.trim(),
              mechanicName: mechanicName.trim(),
              mechanicCertificateNumber: certNumber.trim() || undefined,
              mechanicCertificateType: certType.trim() || undefined,
              tachAtCompliance: tach !== "" ? Math.round(Number(tach) * 10) : undefined,
              hobbsAtCompliance: hobbs !== "" ? Math.round(Number(hobbs) * 10) : undefined,
            }
          : {}),
      });
      toast.success("Signed off.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign that off.");
    }
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!hoursValid || !complianceValid || resolve.isPending}>
              {resolve.isPending ? "Signing off…" : "Sign off"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="Sign off"
      description={`Record ${name} as done.`}
    >
      <div data-doc-shot="sign-off-inspection-modal" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="resolve-date">Completed on</Label>
          <DatePickerField
            id="resolve-date"
            value={completedAt}
            onChange={setCompletedAt}
            max={format(new Date(), "yyyy-MM-dd")}
          />
        </div>

        {hourBased && (
          <div className="space-y-1.5">
            <Label htmlFor="resolve-hours">{meter} reading when the work was done</Label>
            <Input
              id="resolve-hours"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum"
              placeholder={due?.currentHours != null ? fromDeciHours(due.currentHours) : "0.0"}
            />
            <p className="text-xs text-muted-foreground">
              The next interval counts from this number, enter what the meter read at the
              work, not today&rsquo;s reading, or the next one comes due early.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="resolve-notes">Notes</Label>
          <Textarea
            id="resolve-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Work order number, who signed it, anything worth keeping."
          />
        </div>

        {due?.grounds && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            This one grounds the aircraft. Signing it off returns the tail to service, unless
            something else is still holding it.
          </p>
        )}

        {/* THE PERMANENT RECORD.
            Offered rather than required, because an oil change should not have to name a
            certificate holder. Opened by default on an Airworthiness Directive, where the
            record is the reason for signing off at all. */}
        <div
          data-doc-shot="sign-off-compliance"
          className="space-y-3 rounded-lg border border-border p-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="resolve-record" className="inline-flex cursor-pointer items-center gap-1.5">
                Keep a compliance record
                <DocsHint topic="compliance-record" />
              </Label>
              <p className="text-xs text-muted-foreground">
                {/* "Required under 91.417" is true of an Airworthiness Directive and of
                    nothing else here. It fired for any source carrying a reference, so a
                    Service Bulletin, which is the manufacturer's advice and not law, told
                    a mechanic the FAA required this record. Wrong, and wrong in the
                    direction that erodes trust in every other claim on the page. */}
                {reminder.template?.sourceType === "ad"
                  ? `Required for ${sourceLabel(reminder.template ?? {}) ?? "this rule"} under 14 CFR 91.417.`
                  : sourceRef
                    ? `Recommended for ${sourceLabel(reminder.template ?? {}) ?? "this rule"}. Kept for the life of the aircraft.`
                    : "What was done, and who certified it. Kept for the life of the aircraft."}
              </p>
            </div>
            <Switch id="resolve-record" checked={recording} onCheckedChange={setRecording} />
          </div>

          {recording && (
            <div className="space-y-3 border-t border-border pt-3">
              {/* Said before the button, not after. Everything else in this console is
                  correctable, and this one thing is not. */}
              <p className="flex gap-2 rounded-md border border-[color-mix(in_oklch,var(--warning)_30%,transparent)] bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] px-3 py-2 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
                <span>
                  Once signed, this record can&rsquo;t be edited or removed. A correction is a
                  new record. This is a tracking record and does not replace the logbook entry
                  required by 14 CFR 43.9 and 43.11.
                </span>
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="resolve-method">What was done</Label>
                <Textarea
                  id="resolve-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Visual and dye-penetrant inspection of the forward spar carry-through per paragraph (g)(1). No cracking found."
                />
                <p className="text-xs text-muted-foreground">
                  The method of compliance. This is the sentence an inspector reads.
                </p>
              </div>

              {/* Both meters, whatever this rule counted. Prefilled from the aircraft, so
                  the usual answer is a glance rather than a walk to the panel. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="resolve-tach" className="inline-flex items-center gap-1.5">
                    Tach at compliance
                    <DocsHint topic="compliance-meters" />
                  </Label>
                  <Input
                    id="resolve-tach"
                    inputMode="decimal"
                    className="tnum"
                    value={tach}
                    onChange={(e) => setTach(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resolve-hobbs">Hobbs at compliance</Label>
                  <Input
                    id="resolve-hobbs"
                    inputMode="decimal"
                    className="tnum"
                    value={hobbs}
                    onChange={(e) => setHobbs(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="resolve-mechanic">Certified by</Label>
                  <Input
                    id="resolve-mechanic"
                    value={mechanicName}
                    onChange={(e) => setMechanicName(e.target.value)}
                    placeholder="The mechanic who signed it"
                    /* The column's own limit. Without it a pasted value reached Postgres,
                       raised a 22001, and came back as a generic failure. */
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resolve-cert">Certificate</Label>
                  {/* No example placeholder. A greyed "3421887" in an empty box reads as a
                      filled field at a glance, which is exactly how the first version of
                      this shipped a record with no certificate on it while looking correct
                      on screen. If it is empty it should look empty. */}
                  <Input
                    id="resolve-cert"
                    value={certNumber}
                    onChange={(e) => setCertNumber(e.target.value)}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    maxLength={32}
                  />
                </div>
                {/* THE TYPE, which this form seeded and submitted without ever showing.
                    "3421887" alone does not say whether the signer held an Inspection
                    Authorization, which is the whole question on an annual — and because
                    the value came from the signed-in user's profile, changing "Certified
                    by" to an outside IA still stamped the record with the console
                    operator's own rating. The phone has always had this picker. */}
                <div className="space-y-1.5">
                  <Label htmlFor="resolve-cert-type">Type</Label>
                  <Select
                    value={certType || "none"}
                    onValueChange={(v) => setCertType(v === "none" ? "" : v)}
                  >
                    <SelectTrigger id="resolve-cert-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {MECHANIC_CERTIFICATE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Only when the PROFILE is genuinely empty. This used to fire whenever the
                  box was empty, so clearing it to type somebody else's number told a
                  mechanic who had saved theirs that they had never saved it. */}
              {!membership?.mechanicCertificateNumber?.trim() && (
                <p className="text-xs text-muted-foreground">
                  No certificate on your profile yet. Add it under Profile and it fills in
                  here every time.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Stored as typed, not as a link to an account: an outside IA has no login here,
                and the record has to outlast anyone leaving the school.
              </p>
            </div>
          )}
        </div>

      </div>
    </ResponsiveModal>
  );
}
