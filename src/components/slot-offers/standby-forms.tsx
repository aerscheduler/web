import * as React from "react";
import { toast } from "sonner";
import { useCreateStandbyInterest } from "@/features/slot-offers";
import {
  useApprovedResources,
  useMembers,
  useMyInstructionPartners,
  useResources,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isInstructor, isStaff, selfBookableTypes } from "@/lib/permissions";
import { zonedWallClockToUtc } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { resourceLabel, type ReservationType } from "@/types/api";
import type { StandingCriteria } from "@/types/slot-offers";
import { TYPE_LABEL } from "@/components/schedule/meta";
import { Field } from "@/components/settings/parts";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { MultiCombobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The standby forms, built from the console's form vocabulary: a ResponsiveModal with
 * Cancel and Save in the footer, a labelled Field per input, Select for one choice,
 * MultiCombobox for lists, and the booking form's round weekday buttons ("Custom
 * repeat" in recurrence-field.tsx) for days.
 *
 * Used by Profile > Standby (add a preference, add an open window), by the "first
 * dibs" ask after accepting an offer, and by the question after joining a school.
 */

/** Same order and initials as the booking form's Custom repeat. 0 = Sunday. */
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type TimeChoice = "any" | "morning" | "afternoon" | "evening" | "custom";

const TIME_WINDOWS: Record<Exclude<TimeChoice, "any" | "custom">, [string, string]> = {
  morning: ["06:00", "12:00"],
  afternoon: ["12:00", "17:00"],
  evening: ["17:00", "22:00"],
};

const TIME_LABELS: Record<TimeChoice, string> = {
  any: "Any time",
  morning: "Mornings, 6 AM to noon",
  afternoon: "Afternoons, noon to 5 PM",
  evening: "Evenings, 5 PM to 10 PM",
  custom: "Custom hours",
};

/** The booking form's 15-minute grid. */
export const CLOCK_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
})();

export function formatClockLabel(hm: string): string {
  const [hs, ms] = hm.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, hs, ms)
  );
}

export type StandingDraft = {
  days: number[];
  time: TimeChoice;
  from: string;
  to: string;
  types: string[];
  resourceIds: string[];
  instructorIds: string[];
};

export type StandingInitial = { days?: number[]; time?: TimeChoice };

const draftFrom = (initial?: StandingInitial): StandingDraft => ({
  days: initial?.days ?? [],
  time: initial?.time ?? "any",
  from: "",
  to: "",
  types: [],
  resourceIds: [],
  instructorIds: [],
});

/** Criteria for POST /standby, or the message that says what is missing. */
export function criteriaFor(draft: StandingDraft): { criteria: StandingCriteria } | { error: string } {
  if (!draft.days.length) return { error: "Choose at least one day." };
  const criteria: StandingCriteria = { daysOfWeek: [...draft.days].sort((a, b) => a - b) };
  if (draft.time === "custom") {
    if (!draft.from || !draft.to) return { error: "Choose a From and a To time." };
    if (draft.from >= draft.to) return { error: "To has to be after From." };
    criteria.localTimeStart = draft.from;
    criteria.localTimeEnd = draft.to;
  } else if (draft.time !== "any") {
    [criteria.localTimeStart, criteria.localTimeEnd] = TIME_WINDOWS[draft.time];
  }
  if (draft.types.length) criteria.reservationTypes = draft.types;
  if (draft.resourceIds.length) criteria.resourceIds = draft.resourceIds.map(Number);
  if (draft.instructorIds.length) criteria.instructorOrgUserIds = draft.instructorIds.map(Number);
  return { criteria };
}

export function WeekdayPicker({
  value,
  onChange,
  id,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  id?: string;
}) {
  return (
    <div id={id} role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
      {DAY_INITIALS.map((initial, day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onChange(active ? value.filter((d) => d !== day) : [...value, day])}
            aria-pressed={active}
            aria-label={DAY_NAMES[day]}
            title={DAY_NAMES[day]}
            className={cn(
              "size-9 shrink-0 rounded-full border text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            {initial}
          </button>
        );
      })}
    </div>
  );
}

function ClockSelect({
  id,
  value,
  onChange,
  placeholder = "Select",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {CLOCK_OPTIONS.map((hm) => (
          <SelectItem key={hm} value={hm}>
            {formatClockLabel(hm)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The inputs of a standing preference, laid out as Fields. No container of its own. */
export function StandingPreferenceFields({
  draft,
  onChange,
  whenOnly = false,
}: {
  draft: StandingDraft;
  onChange: (patch: Partial<StandingDraft>) => void;
  /** Days and time only, for the one-question step after joining a school. */
  whenOnly?: boolean;
}) {
  const { user, organization, roles } = useAuth();
  const resourcesQ = useResources();
  const approvedQ = useApprovedResources(user?.id ?? 0, { enabled: user != null });
  const instructorsQ = useMembers({ instructor: true });
  const partners = useMyInstructionPartners(user?.id ?? 0, { enabled: user != null });

  // Same rule as the booking form's fleet picker: a school that requires a checkout
  // limits students and renters to what they are approved on.
  const restrictToApproved =
    organization?.preferences?.personnelCanOnlyUseApprovedResources === true &&
    !isStaff(roles) &&
    !isInstructor(roles);
  const resources = restrictToApproved ? (approvedQ.data ?? []) : (resourcesQ.data ?? []);
  const fleetPending = restrictToApproved ? approvedQ.isPending : resourcesQ.isPending;
  const resourceOptions: ComboOption[] = resources.map((r) => {
    const l = resourceLabel(r);
    return { value: String(r.id), label: l.name, hint: l.kind };
  });

  const partnerIds = React.useMemo(
    () =>
      new Set(
        (partners.data?.instructors ?? [])
          .map((p) => p.orgUser?.id)
          .filter((id): id is number => id != null)
      ),
    [partners.data]
  );
  const instructorOptions: ComboOption[] = React.useMemo(
    () =>
      (instructorsQ.data ?? [])
        .map((ou) => ({
          value: String(ou.id),
          label: ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`,
          hint: partnerIds.has(ou.id) ? "Your instructor" : (ou.identifier ?? undefined),
          mine: partnerIds.has(ou.id),
        }))
        .sort((a, b) => Number(b.mine) - Number(a.mine) || a.label.localeCompare(b.label))
        .map(({ mine: _mine, ...opt }) => opt),
    [instructorsQ.data, partnerIds]
  );

  const typeOptions: ComboOption[] = selfBookableTypes(roles).map((t) => ({
    value: t,
    label: TYPE_LABEL[t as ReservationType] ?? t,
  }));

  return (
    <div className="space-y-4">
      <Field label="Days">
        <WeekdayPicker value={draft.days} onChange={(days) => onChange({ days })} />
      </Field>

      <Field label="Time" htmlFor="standby-time">
        <Select value={draft.time} onValueChange={(v) => onChange({ time: v as TimeChoice })}>
          <SelectTrigger id="standby-time" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TIME_LABELS) as TimeChoice[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TIME_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {draft.time === "custom" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="standby-from">
            <ClockSelect id="standby-from" value={draft.from} onChange={(from) => onChange({ from })} />
          </Field>
          <Field label="To" htmlFor="standby-to">
            <ClockSelect id="standby-to" value={draft.to} onChange={(to) => onChange({ to })} />
          </Field>
        </div>
      )}

      {whenOnly ? null : (
        <>
      {typeOptions.length > 1 && (
        <Field label="Lesson types">
          <MultiCombobox
            options={typeOptions}
            values={draft.types}
            onChange={(types) => onChange({ types })}
            placeholder="Any type"
            searchPlaceholder="Search types…"
            emptyText="No types."
            className="h-9 w-full max-w-none"
          />
        </Field>
      )}

      <Field
        label="Aircraft"
        hint={restrictToApproved ? "Limited to aircraft you are checked out on, same as booking." : undefined}
      >
        <MultiCombobox
          options={resourceOptions}
          values={draft.resourceIds}
          onChange={(resourceIds) => onChange({ resourceIds })}
          placeholder={fleetPending ? "Loading…" : "Any aircraft"}
          searchPlaceholder="Search aircraft…"
          emptyText={
            restrictToApproved
              ? "No checked-out aircraft yet. Ask for a checkout, or leave this blank."
              : "No aircraft."
          }
          disabled={fleetPending}
          className="h-9 w-full max-w-none"
        />
      </Field>

      <Field label="Instructors">
        <MultiCombobox
          options={instructorOptions}
          values={draft.instructorIds}
          onChange={(instructorIds) => onChange({ instructorIds })}
          placeholder="Any instructor"
          searchPlaceholder="Search instructors…"
          emptyText="No instructors."
          disabled={instructorsQ.isPending}
          className="h-9 w-full max-w-none"
        />
      </Field>
        </>
      )}
    </div>
  );
}

/** Draft state plus the save, shared by the modal and the onboarding step. */
export function useStandingPreferenceForm(initial?: StandingInitial) {
  const create = useCreateStandbyInterest();
  const [draft, setDraft] = React.useState<StandingDraft>(() => draftFrom(initial));
  const update = React.useCallback(
    (patch: Partial<StandingDraft>) => setDraft((d) => ({ ...d, ...patch })),
    []
  );
  const reset = React.useCallback((next?: StandingInitial) => setDraft(draftFrom(next)), []);

  /** True when saved. Shows its own toast either way. */
  const save = async (): Promise<boolean> => {
    const built = criteriaFor(draft);
    if ("error" in built) {
      toast.error(built.error);
      return false;
    }
    try {
      const interest = await create.mutateAsync({ kind: "standing", criteria: built.criteria });
      toast.success("You'll get first dibs when a slot like this opens.");
      if (interest.notificationDelivery?.anyChannelEnabled === false) {
        toast.warning("Turn on offer notifications so you do not miss an opening.");
      }
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save your preference");
      return false;
    }
  };

  return { draft, update, reset, save, saving: create.isPending };
}

export function StandingPreferenceModal({
  open,
  onOpenChange,
  initial,
  description = "When someone cancels a time that fits, you're offered it before anyone else. You can always say no.",
  cancelLabel = "Cancel",
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: StandingInitial;
  description?: React.ReactNode;
  cancelLabel?: string;
  /** Runs when the person closes without saving. */
  onCancel?: () => void;
}) {
  const form = useStandingPreferenceForm(initial);
  const { reset } = form;

  // Each opening starts from its own prefill, not from the last attempt.
  React.useEffect(() => {
    if (open) reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (saved: boolean) => {
    if (!saved) onCancel?.();
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close(false))}
      title="Standby"
      description={description}
      size="sm"
      dataDocShot="standby-preference"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={form.saving}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={form.saving}
            onClick={async () => {
              if (await form.save()) close(true);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <StandingPreferenceFields draft={form.draft} onChange={form.update} />
    </ResponsiveModal>
  );
}

function wallToUtc(dateKey: string, hm: string, timeZone: string): Date | null {
  const parts = dateKey.split("-").map(Number);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  if (parts.length !== 3 || !m) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  return zonedWallClockToUtc(year, month, day, Number(m[1]), Number(m[2]), timeZone);
}

export function OpenWindowModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateStandbyInterest();
  const tz = useTimeZone();
  const [startDate, setStartDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endDate, setEndDate] = React.useState("");
  const [endTime, setEndTime] = React.useState("17:00");

  React.useEffect(() => {
    if (!open) return;
    setStartDate("");
    setStartTime("09:00");
    setEndDate("");
    setEndTime("17:00");
  }, [open]);

  const save = async () => {
    const end = endDate || startDate;
    if (!startDate) return toast.error("Choose a start date.");
    const s = wallToUtc(startDate, startTime, tz.zone);
    const e = wallToUtc(end, endTime, tz.zone);
    if (!s || !e) return toast.error("Couldn't read that date and time.");
    if (!(s.getTime() < e.getTime())) return toast.error("The end has to be after the start.");
    try {
      const interest = await create.mutateAsync({
        kind: "open_window",
        start: s.toISOString(),
        end: e.toISOString(),
      });
      toast.success("Open window saved");
      if (interest.notificationDelivery?.anyChannelEnabled === false) {
        toast.warning("Turn on offer notifications so you do not miss an opening.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save this window");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Open window"
      description={`A time you're free once. A slot that opens inside it is offered to you first. Times are ${tz.zone}.`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={create.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts on" htmlFor="open-window-start-date">
          <DatePickerField id="open-window-start-date" value={startDate} onChange={setStartDate} />
        </Field>
        <Field label="From" htmlFor="open-window-start-time">
          <ClockSelect id="open-window-start-time" value={startTime} onChange={setStartTime} />
        </Field>
        <Field label="Ends on" htmlFor="open-window-end-date" hint="Leave empty for the same day.">
          <DatePickerField
            id="open-window-end-date"
            value={endDate}
            min={startDate || undefined}
            onChange={setEndDate}
          />
        </Field>
        <Field label="To" htmlFor="open-window-end-time">
          <ClockSelect id="open-window-end-time" value={endTime} onChange={setEndTime} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
