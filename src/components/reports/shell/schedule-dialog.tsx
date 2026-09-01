/**
 * Scheduling a saved view.
 *
 * Deliberately small: a cadence, a time, and who gets it. Everything else is
 * already decided, the view says which report and how it's filtered, and the
 * cadence decides the window, so there is no date range to pick and no way to
 * build a weekly email that reports the wrong week.
 *
 * Two things this screen must say out loud, because both are invisible
 * otherwise and both cause support tickets:
 *
 *  - **Whose clock.** 7am is 7am at the school. A reader in another zone would
 *    otherwise reasonably assume it meant theirs.
 *  - **What it covers.** "Every Monday" does not tell you whether Monday's
 *    email includes Monday. It doesn't, it covers the seven days before.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiCombobox, type ComboOption } from "@/components/combobox";
import { useConfirm } from "@/components/confirm-dialog";
import { useOrgUsers } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import {
  useCreateSchedule,
  useDeleteSchedule,
  useReportSchedules,
  useReportTimeZone,
  useSendScheduleNow,
  useUpdateSchedule,
} from "@/features/reports";
import { describeCoverage, formatHour, CADENCES, WEEKDAYS } from "@/types/schedules";
import type { Cadence } from "@/types/schedules";
import { zoneAbbreviation } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/** Deliberately loose: the server validates properly, this only catches typos. */
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

/** Sensible hours for a report to land. Nobody schedules one for 3am. */
const HOURS = [5, 6, 7, 8, 9, 10, 12, 15, 17, 18, 20];

export function ScheduleDialog({
  open,
  onOpenChange,
  view,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Only the id and the name are used, so the schedules page can pass the view
   * summary that comes back on a schedule without refetching the full record.
   */
  view: { id: number; name: string };
}) {
  const schedules = useReportSchedules();
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const remove = useDeleteSchedule();
  const sendNow = useSendScheduleNow();
  const members = useOrgUsers();
  const timeZone = useReportTimeZone();
  const confirm = useConfirm();
  // Only an owner or admin may route a report out of the school; the server
  // enforces it, and hiding the field keeps anyone else from finding a 403.
  const { isAdmin } = useAuth();

  const existing = useMemo(
    () => (schedules.data ?? []).find((s) => s.reportView?.id === view.id) ?? null,
    [schedules.data, view.id]
  );

  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [hour, setHour] = useState(7);
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipients, setRecipients] = useState<number[]>([]);
  const [external, setExternal] = useState<string[]>([]);
  const [draftEmail, setDraftEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset from whatever exists each time it opens, so editing never inherits a
  // half-filled form from the last view someone looked at.
  useEffect(() => {
    if (!open) return;
    setCadence((existing?.cadence as Cadence) ?? "weekly");
    setHour(existing?.hour ?? 7);
    setWeekday(existing?.weekday ?? 1);
    setDayOfMonth(existing?.dayOfMonth ?? 1);
    setRecipients(existing?.recipientOrgUserIds ?? []);
    setExternal(existing?.recipientEmails ?? []);
    setDraftEmail("");
    setError(null);
  }, [open, existing]);

  /**
   * The roster as picker options: the name is the label, the address is the
   * hint, so you can tell two Test Owners apart without leaving the list.
   *
   * There is no selected-first sorting here on purpose. Who is picked is shown
   * as chips under the picker rather than by position in it, which is both
   * easier to read and stable, an earlier version re-sorted the list and slid
   * rows out from under the cursor mid-click.
   */
  const peopleOptions = useMemo<ComboOption[]>(
    () =>
      (members.data ?? [])
        .filter((m) => m.user?.email)
        .map((m) => ({
          value: String(m.id),
          label: m.user?.name ?? m.user?.email ?? "Unknown",
          hint: m.user?.email ?? "",
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members.data]
  );

  const chosenPeople = useMemo(
    () => recipients.map((id) => peopleOptions.find((o) => o.value === String(id))).filter(Boolean),
    [recipients, peopleOptions]
  ) as ComboOption[];

  const addExternal = () => {
    const address = draftEmail.trim().toLowerCase();
    if (!address) return;
    if (!isEmail(address)) {
      setError(`"${address}" doesn't look like an email address.`);
      return;
    }
    setExternal((current) => [...new Set([...current, address])]);
    setDraftEmail("");
    setError(null);
  };

  const zoneLabel = zoneAbbreviation(new Date(), timeZone);

  const save = async () => {
    if (recipients.length === 0 && external.length === 0) {
      setError("Pick at least one person to send it to.");
      return;
    }
    // A half-typed address is a common way to lose a recipient silently, so it
    // is added rather than discarded, and rejected here if it isn't valid.
    const pending = draftEmail.trim().toLowerCase();
    if (pending && !isEmail(pending)) {
      setError(`"${pending}" doesn't look like an email address.`);
      return;
    }
    const allExternal = pending ? [...new Set([...external, pending])] : external;
    setError(null);

    const body = {
      cadence,
      hour,
      weekday: cadence === "weekly" ? weekday : null,
      dayOfMonth: cadence === "monthly" ? dayOfMonth : null,
      recipientOrgUserIds: recipients,
      ...(isAdmin ? { recipientEmails: allExternal } : {}),
    };

    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, ...body });
        toast.success("Schedule updated");
      } else {
        await create.mutateAsync({ reportViewId: view.id, ...body });
        toast.success(`"${view.name}" will be emailed ${CADENCE_LABEL[cadence].toLowerCase()}`);
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Could not save this schedule");
    }
  };

  const destroy = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: "Stop sending this report?",
      description: `"${view.name}" will no longer be emailed. The saved view itself is kept.`,
      confirmLabel: "Stop sending",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success("Schedule removed");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove the schedule");
    }
  };

  const test = async () => {
    if (!existing) return;
    try {
      await sendNow.mutateAsync(existing.id);
      toast.success("Sent. Check your inbox");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send it");
    }
  };

  const pending = create.isPending || update.isPending;
  const locked = !!existing && !existing.isMine;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      // Wide enough that the cadence, the time and the day sit on one row, so
      // "every Monday at 7am" reads as one sentence rather than three stacked
      // controls, and the roster gets a usable line length.
      size="xl"
      title={existing ? "Edit schedule" : "Schedule this report"}
      description={
        <>
          &ldquo;{view.name}&rdquo; will be emailed as a CSV.{" "}
          {/* The zone is stated, not converted: the schedule belongs to the
              school, and silently rendering it in the reader's clock is how a
              7am report looks like it is set for 6am. */}
          Times are {zoneLabel ? `${zoneLabel} ` : ""}at your school.
        </>
      }
      // One right-aligned pair, like every other form in the console. The
      // lifecycle actions (send a copy, stop sending) belong to the schedule
      // rather than to this form, so they live with it in the body.
      footer={
        // The error rides in the footer rather than at the end of the body: both
        // things it can complain about (nobody picked, a half-typed address) are
        // mid-form, and a message under the last section can sit off-screen.
        <div className="flex items-center justify-end gap-3">
          {error && <p className="flex-1 text-sm text-destructive">{error}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {locked ? "Close" : "Cancel"}
          </Button>
          {!locked && (
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {existing ? "Save changes" : "Schedule it"}
            </Button>
          )}
        </div>
      }
      dataDocShot="report-schedule-dialog"
    >
      <div className="space-y-6 pb-1">
        {locked && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Set up by {existing?.createdByName ?? "a colleague"}. Only they or an admin can change it.
          </p>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            When it sends
          </h3>
          <div
            className={cn(
              "grid gap-3",
              cadence === "daily" ? "sm:grid-cols-2" : "sm:grid-cols-3"
            )}
          >
            <div className="space-y-1.5">
              <Label>How often</Label>
              <Select
                value={cadence}
                onValueChange={(v) => setCadence(v as Cadence)}
                disabled={locked}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CADENCE_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cadence === "weekly" && (
              <div className="space-y-1.5">
                <Label>On</Label>
                <Select
                  value={String(weekday)}
                  onValueChange={(v) => setWeekday(Number(v))}
                  disabled={locked}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day, i) => (
                      <SelectItem key={day} value={String(i)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cadence === "monthly" && (
              <div className="space-y-1.5">
                <Label>Day of the month</Label>
                <Select
                  value={String(dayOfMonth)}
                  onValueChange={(v) => setDayOfMonth(Number(v))}
                  disabled={locked}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>At</Label>
              <Select
                value={String(hour)}
                onValueChange={(v) => setHour(Number(v))}
                disabled={locked}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {formatHour(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Says why 29-31 aren't offered, rather than leaving it as an
              unexplained limit someone works around by picking the 28th and
              wondering. */}
          {cadence === "monthly" && (
            <p className="text-xs text-muted-foreground">
              The day list stops at 28 so the report never skips February.
            </p>
          )}

          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {describeCoverage(cadence)}, so each email picks up exactly where the last
            one stopped.
          </p>
        </section>

        <section className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              {/* No count here: the picker's own trigger says how many, and
                  the chips under it say who. */}
              <Label>Send to</Label>
              {/* Clearing is the only bulk action offered: "everyone at the
                  school" on a report that carries money out of it is a mistake
                  worth having to make one name at a time. */}
              {!locked && recipients.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setRecipients([])}
                >
                  Clear
                </Button>
              )}
            </div>

            <MultiCombobox
              options={peopleOptions}
              values={recipients.map(String)}
              onChange={(next) => setRecipients(next.map(Number))}
              placeholder={members.isLoading ? "Loading…" : "Choose who gets it…"}
              searchPlaceholder="Search by name or email"
              emptyText="Nobody at this school has an email address on file."
              disabled={locked || members.isLoading}
              className="h-9 w-full max-w-none"
            />

            {/* Chips rather than a checked list: the picker says how many, this
                says who, and it reads the same as the outside addresses below. */}
            {chosenPeople.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chosenPeople.map((person) => (
                  <span
                    key={person.value}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs"
                  >
                    {person.label}
                    {!locked && (
                      <button
                        type="button"
                        aria-label={`Remove ${person.label}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setRecipients((c) => c.filter((id) => String(id) !== person.value))
                        }
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* The runner drops anyone who has since lost access to the report.
                Saying so here stops it reading as a bug later. */}
            <p className="text-xs text-muted-foreground">
              Anyone who loses access to this report stops receiving it automatically.
            </p>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="external-email">Also send outside the school</Label>
              <div className="flex gap-2">
                <Input
                  id="external-email"
                  type="email"
                  value={draftEmail}
                  disabled={locked}
                  placeholder="accountant@example.com"
                  onChange={(e) => setDraftEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExternal();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked || !draftEmail.trim()}
                  onClick={addExternal}
                >
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              {external.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {external.map((address) => (
                    <span
                      key={address}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs"
                    >
                      {address}
                      {!locked && (
                        <button
                          type="button"
                          aria-label={`Remove ${address}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setExternal((c) => c.filter((e) => e !== address))}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {/* Says the limit out loud. An outside address has no role to
                  re-check, so the compensating rule is worth knowing before
                  you rely on it. */}
              <p className="text-xs text-muted-foreground">
                Outside addresses keep receiving this only while you still have access
                to the report. Owners and admins only.
              </p>
            </div>
          )}
        </section>

        {existing && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              This schedule
            </h3>
            <div className="divide-y divide-border rounded-md border border-border">
              <label className="flex items-center justify-between gap-3 px-3 py-3">
                <span>
                  <span className="block text-sm font-medium">Active</span>
                  <span className="block text-xs text-muted-foreground">
                    Pause without losing the setup.
                  </span>
                </span>
                <Switch
                  checked={existing.isEnabled}
                  disabled={locked || update.isPending}
                  onCheckedChange={(isEnabled) =>
                    update.mutateAsync({ id: existing.id, isEnabled }).catch((err: any) =>
                      toast.error(err?.message ?? "Could not change that")
                    )
                  }
                />
              </label>

              <div className="px-3 py-2.5">
                {existing.lastError ? (
                  <p className="text-xs text-destructive">
                    Last send failed: {existing.lastError}
                  </p>
                ) : existing.lastRunAt ? (
                  <p className="text-xs text-muted-foreground">
                    Last sent {new Date(existing.lastRunAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not sent yet.</p>
                )}
              </div>

              {/* Neither of these is the form's action: "Send now" ignores
                  unsaved edits and "Stop sending" throws the schedule away, so
                  they sit with the schedule they act on and out of the footer,
                  where they read as ways to submit. */}
              {!locked && (
                <div className="flex flex-wrap gap-2 px-3 py-3">
                  <Button variant="outline" size="sm" onClick={test} disabled={sendNow.isPending}>
                    {sendNow.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Send me a copy now
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={destroy}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Stop sending
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}

      </div>
    </ResponsiveModal>
  );
}
