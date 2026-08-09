import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarRange, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateStandbyInterest,
  useMyStandbyInterest,
  useWithdrawStandbyInterest,
} from "@/features/slot-offers";
import {
  useApprovedResources,
  useMembers,
  useMyInstructionPartners,
  useOrgUserPreferences,
  useResources,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isInstructor, isStaff, selfBookableTypes } from "@/lib/permissions";
import { zonedWallClockToUtc } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { resourceLabel, type ReservationType, type Role } from "@/types/api";
import type { StandingCriteria, StandbyInterest } from "@/types/slot-offers";
import { TYPE_LABEL } from "@/components/schedule/meta";
import { SlotOfferNotificationWarning } from "@/components/slot-offers/notification-warning";
import { DocsHint } from "@/components/docs-hint";
import { EmptyState, ErrorState } from "@/components/states";
import { DatePickerField } from "@/components/date-picker";
import { MultiCombobox, type ComboOption } from "@/components/combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** API weekday: 0 = Sunday … 6 = Saturday */
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const DAY_NAME: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Same 15-minute grid the booking form uses for start/end selects. */
const CLOCK_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function formatClockLabel(hm: string): string {
  const [hs, ms] = hm.split(":").map(Number);
  const d = new Date(2000, 0, 1, hs, ms);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function wallToUtc(dateKey: string, hm: string, timeZone: string): Date | null {
  const parts = dateKey.split("-").map(Number);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  if (parts.length !== 3 || !m) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  return zonedWallClockToUtc(year, month, day, Number(m[1]), Number(m[2]), timeZone);
}

/**
 * Standing preferences and one-off open windows for slot offers.
 * Per-reservation "stand by" stays on the booking detail panel.
 */
export function StandbyPreferencesPanel() {
  const { roles } = useAuth();
  const interestsQuery = useMyStandbyInterest();
  const preferencesQuery = useOrgUserPreferences();
  const withdraw = useWithdrawStandbyInterest();

  const active = (interestsQuery.data ?? []).filter(
    (interest) =>
      interest.status === "active" &&
      (interest.kind === "standing" || interest.kind === "open_window")
  );

  const notificationPreferences = preferencesQuery.data?.notificationPreferences;
  const notificationsOff =
    !preferencesQuery.isPending &&
    !(
      notificationPreferences?.emailEnabled &&
      notificationPreferences.emailNotificationPreferences?.slotOffers
    ) &&
    !(
      notificationPreferences?.pushEnabled &&
      notificationPreferences.pushNotificationPreferences?.slotOffers
    );

  const leave = async (interest: StandbyInterest) => {
    try {
      await withdraw.mutateAsync(interest.id);
      toast.success("Standby preference withdrawn");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't withdraw this preference"
      );
    }
  };

  return (
    <div className="space-y-5">
      {notificationsOff && <SlotOfferNotificationWarning />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Your standby preferences
            <DocsHint topic="standing-preferences" />
          </CardTitle>
          <CardDescription>
            When a matching slot opens, you get a time-limited offer instead of a silent
            rebook. Leave a field blank to mean any.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {interestsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading preferences…</p>
          ) : interestsQuery.isError ? (
            <ErrorState
              error={interestsQuery.error}
              onRetry={() => void interestsQuery.refetch()}
            />
          ) : active.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="No standing preferences yet"
              body="Add a weekly pattern or a specific open window below."
            />
          ) : (
            <ul className="space-y-2">
              {active.map((interest) => (
                <li
                  key={interest.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {interest.kind === "standing" ? "Standing" : "Open window"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm">{describeInterest(interest)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={withdraw.isPending}
                    onClick={() => void leave(interest)}
                  >
                    <X className="size-4" /> Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <StandingPreferenceForm roles={roles} />
      <OpenWindowForm />
    </div>
  );
}

function StandingPreferenceForm({ roles }: { roles: Role[] }) {
  const { user, organization } = useAuth();
  const create = useCreateStandbyInterest();
  const resourcesQ = useResources();
  const approvedQ = useApprovedResources(user?.id ?? 0, { enabled: user != null });
  const instructorsQ = useMembers({ instructor: true });
  const partners = useMyInstructionPartners(user?.id ?? 0, { enabled: user != null });
  const typeOptions = selfBookableTypes(roles);

  // Same two facts the booking form and ReservationService.create use for the fleet
  // picker: org checkout setting, and whether this member would sit as student/renter
  // (instructors and staff keep the whole fleet).
  const restrictToApproved =
    organization?.preferences?.personnelCanOnlyUseApprovedResources === true &&
    !isStaff(roles) &&
    !isInstructor(roles);

  const resources = restrictToApproved ? (approvedQ.data ?? []) : (resourcesQ.data ?? []);
  const fleetPending = restrictToApproved ? approvedQ.isPending : resourcesQ.isPending;

  const partnerIds = React.useMemo(() => {
    return new Set(
      (partners.data?.instructors ?? [])
        .map((p) => p.orgUser?.id)
        .filter((id): id is number => id != null)
    );
  }, [partners.data]);

  const resourceOptions: ComboOption[] = resources.map((r) => {
    const l = resourceLabel(r);
    return { value: String(r.id), label: l.name, hint: l.kind };
  });

  const instructorOptions: ComboOption[] = React.useMemo(() => {
    return (instructorsQ.data ?? [])
      .map((ou) => ({
        value: String(ou.id),
        label: ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`,
        hint: partnerIds.has(ou.id) ? "Your instructor" : (ou.identifier ?? undefined),
        mine: partnerIds.has(ou.id),
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.label.localeCompare(b.label))
      .map(({ mine: _mine, ...opt }) => opt);
  }, [instructorsQ.data, partnerIds]);

  const [days, setDays] = React.useState<number[]>([]);
  const [types, setTypes] = React.useState<string[]>([]);
  const [timeStart, setTimeStart] = React.useState("");
  const [timeEnd, setTimeEnd] = React.useState("");
  const [resourceIds, setResourceIds] = React.useState<string[]>([]);
  const [instructorIds, setInstructorIds] = React.useState<string[]>([]);

  const toggleNum = (list: number[], value: number, set: (next: number[]) => void) => {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };
  const toggleStr = (list: string[], value: string, set: (next: string[]) => void) => {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (timeStart && !timeEnd) {
      toast.error("Add an end time, or clear the start time.");
      return;
    }
    if (timeEnd && !timeStart) {
      toast.error("Add a start time, or clear the end time.");
      return;
    }
    if (timeStart && timeEnd && timeStart >= timeEnd) {
      toast.error("End time must be after start time.");
      return;
    }

    const criteria: StandingCriteria = {};
    if (days.length) criteria.daysOfWeek = [...days].sort((a, b) => a - b);
    if (types.length) criteria.reservationTypes = types;
    if (timeStart && timeEnd) {
      criteria.localTimeStart = timeStart;
      criteria.localTimeEnd = timeEnd;
    }
    if (resourceIds.length) criteria.resourceIds = resourceIds.map(Number);
    if (instructorIds.length) criteria.instructorOrgUserIds = instructorIds.map(Number);

    if (Object.keys(criteria).length === 0) {
      toast.error("Pick at least one day, type, time window, aircraft, or instructor.");
      return;
    }

    try {
      const interest = await create.mutateAsync({ kind: "standing", criteria });
      toast.success("Standing preference saved");
      if (interest.notificationDelivery?.anyChannelEnabled === false) {
        toast.warning("Turn on slot offer notifications so you do not miss an opening.");
      }
      setDays([]);
      setTypes([]);
      setTimeStart("");
      setTimeEnd("");
      setResourceIds([]);
      setInstructorIds([]);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't save this preference"
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Add a standing preference
          <DocsHint topic="standing-preferences" />
        </CardTitle>
        <CardDescription>
          Example: dual on Tue to Thu mornings. Matches any cancel recovery or desk offer that
          fits.
          {restrictToApproved
            ? " Aircraft are limited to what you are checked out on, same as booking."
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(e) => void submit(e)}>
          <fieldset className="space-y-2">
            <Legend>Days</Legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const on = days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleNum(days, day.value, setDays)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {typeOptions.length > 0 && (
            <fieldset className="space-y-2">
              <Legend>Reservation types</Legend>
              <div className="flex flex-wrap gap-3">
                {typeOptions.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={types.includes(type)}
                      onCheckedChange={() => toggleStr(types, type, setTypes)}
                    />
                    {TYPE_LABEL[type as ReservationType] ?? type}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="standby-time-start">Local start</Label>
              <Select
                value={timeStart || undefined}
                onValueChange={(v) => setTimeStart(v === "__any__" ? "" : v)}
              >
                <SelectTrigger id="standby-time-start" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__any__">Any</SelectItem>
                  {CLOCK_OPTIONS.map((hm) => (
                    <SelectItem key={hm} value={hm}>
                      {formatClockLabel(hm)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="standby-time-end">Local end</Label>
              <Select
                value={timeEnd || undefined}
                onValueChange={(v) => setTimeEnd(v === "__any__" ? "" : v)}
              >
                <SelectTrigger id="standby-time-end" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__any__">Any</SelectItem>
                  {CLOCK_OPTIONS.map((hm) => (
                    <SelectItem key={hm} value={hm}>
                      {formatClockLabel(hm)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Aircraft / resources (optional)</Label>
            <MultiCombobox
              options={resourceOptions}
              values={resourceIds}
              onChange={setResourceIds}
              placeholder={
                fleetPending
                  ? "Loading…"
                  : restrictToApproved
                    ? "Checked-out fleet…"
                    : "Any aircraft…"
              }
              searchPlaceholder="Search aircraft…"
              emptyText={
                restrictToApproved
                  ? "No checked-out aircraft yet. Ask for a checkout, or leave this blank."
                  : "No resources."
              }
              disabled={fleetPending}
              className="h-9 w-full max-w-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Instructors (optional)</Label>
            <MultiCombobox
              options={instructorOptions}
              values={instructorIds}
              onChange={setInstructorIds}
              placeholder="Any instructor…"
              searchPlaceholder="Search instructors…"
              emptyText="No instructors."
              disabled={instructorsQ.isPending}
              className="h-9 w-full max-w-none"
            />
            <p className="text-xs text-muted-foreground">
              Your assigned instructors sort first. You can still prefer any instructor the
              school lists, same as booking.
            </p>
          </div>

          <Button type="submit" disabled={create.isPending}>
            Save standing preference
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function OpenWindowForm() {
  const create = useCreateStandbyInterest();
  const tz = useTimeZone();
  const [startDate, setStartDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [endTime, setEndTime] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !startTime || !endDate || !endTime) {
      toast.error("Pick a start and end date and time for the open window.");
      return;
    }
    const start = wallToUtc(startDate, startTime, tz.zone);
    const end = wallToUtc(endDate, endTime, tz.zone);
    if (!start || !end) {
      toast.error("Couldn't read that date and time.");
      return;
    }
    if (!(start.getTime() < end.getTime())) {
      toast.error("End must be after start.");
      return;
    }

    try {
      const interest = await create.mutateAsync({
        kind: "open_window",
        start: start.toISOString(),
        end: end.toISOString(),
      });
      toast.success("Open window saved");
      if (interest.notificationDelivery?.anyChannelEnabled === false) {
        toast.warning("Turn on slot offer notifications so you do not miss an opening.");
      }
      setStartDate("");
      setStartTime("");
      setEndDate("");
      setEndTime("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save this window");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="size-4 text-muted-foreground" />
          Add an open window
        </CardTitle>
        <CardDescription>
          A one-off range you are free. Any opening that overlaps this window can be offered
          to you. Times use the schedule zone ({tz.zone}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="open-window-start-date">Starts on</Label>
              <DatePickerField
                id="open-window-start-date"
                value={startDate}
                onChange={setStartDate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="open-window-start-time">Start time</Label>
              <Select value={startTime || undefined} onValueChange={setStartTime}>
                <SelectTrigger id="open-window-start-time" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {CLOCK_OPTIONS.map((hm) => (
                    <SelectItem key={hm} value={hm}>
                      {formatClockLabel(hm)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="open-window-end-date">Ends on</Label>
              <DatePickerField
                id="open-window-end-date"
                value={endDate}
                min={startDate || undefined}
                onChange={setEndDate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="open-window-end-time">End time</Label>
              <Select value={endTime || undefined} onValueChange={setEndTime}>
                <SelectTrigger id="open-window-end-time" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {CLOCK_OPTIONS.map((hm) => (
                    <SelectItem key={hm} value={hm}>
                      {formatClockLabel(hm)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={create.isPending}>
            Save open window
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="text-sm font-medium text-foreground">{children}</legend>
  );
}

function describeInterest(interest: StandbyInterest): string {
  if (interest.kind === "open_window" && interest.start && interest.end) {
    return `${format(parseISO(interest.start), "EEE MMM d, h:mm a")} to ${format(
      parseISO(interest.end),
      "EEE MMM d, h:mm a"
    )}`;
  }

  const c = interest.criteria ?? {};
  const parts: string[] = [];
  if (c.daysOfWeek?.length) {
    parts.push(c.daysOfWeek.map((d) => DAY_NAME[d] ?? String(d)).join(", "));
  }
  if (c.reservationTypes?.length) {
    parts.push(
      c.reservationTypes
        .map((t) => TYPE_LABEL[t as ReservationType] ?? t)
        .join(", ")
    );
  }
  if (c.localTimeStart && c.localTimeEnd) {
    parts.push(
      `${formatClockLabel(c.localTimeStart)} to ${formatClockLabel(c.localTimeEnd)}`
    );
  }
  if (c.resourceIds?.length) {
    parts.push(`${c.resourceIds.length} resource${c.resourceIds.length === 1 ? "" : "s"}`);
  }
  if (c.instructorOrgUserIds?.length) {
    parts.push(
      `${c.instructorOrgUserIds.length} instructor${
        c.instructorOrgUserIds.length === 1 ? "" : "s"
      }`
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "Any matching slot";
}
