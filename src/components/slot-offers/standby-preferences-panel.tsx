import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarRange, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateStandbyInterest,
  useMyStandbyInterest,
  useWithdrawStandbyInterest,
} from "@/features/slot-offers";
import { useOrgUsers, useOrgUserPreferences, useResources } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { selfBookableTypes } from "@/lib/permissions";
import { resourceLabel, rolesOf, type ReservationType, type Role } from "@/types/api";
import type { StandingCriteria, StandbyInterest } from "@/types/slot-offers";
import { TYPE_LABEL } from "@/components/schedule/meta";
import { SlotOfferNotificationWarning } from "@/components/slot-offers/notification-warning";
import { DocsHint } from "@/components/docs-hint";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const create = useCreateStandbyInterest();
  const resourcesQ = useResources();
  const peopleQ = useOrgUsers();
  const typeOptions = selfBookableTypes(roles);

  const [days, setDays] = React.useState<number[]>([]);
  const [types, setTypes] = React.useState<string[]>([]);
  const [timeStart, setTimeStart] = React.useState("");
  const [timeEnd, setTimeEnd] = React.useState("");
  const [resourceIds, setResourceIds] = React.useState<number[]>([]);
  const [instructorIds, setInstructorIds] = React.useState<number[]>([]);

  const instructors = (peopleQ.data ?? []).filter((ou) =>
    rolesOf(ou).includes("instructor")
  );
  const resources = resourcesQ.data ?? [];

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
    if (resourceIds.length) criteria.resourceIds = resourceIds;
    if (instructorIds.length) criteria.instructorOrgUserIds = instructorIds;

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
              <Input
                id="standby-time-start"
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="standby-time-end">Local end</Label>
              <Input
                id="standby-time-end"
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              />
            </div>
          </div>

          {resources.length > 0 && (
            <fieldset className="space-y-2">
              <Legend>Aircraft / resources (optional)</Legend>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {resources.map((resource) => {
                  const label = resourceLabel(resource).name;
                  return (
                    <label key={resource.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={resourceIds.includes(resource.id)}
                        onCheckedChange={() =>
                          toggleNum(resourceIds, resource.id, setResourceIds)
                        }
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {instructors.length > 0 && (
            <fieldset className="space-y-2">
              <Legend>Instructors (optional)</Legend>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {instructors.map((ou) => (
                  <label key={ou.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={instructorIds.includes(ou.id)}
                      onCheckedChange={() =>
                        toggleNum(instructorIds, ou.id, setInstructorIds)
                      }
                    />
                    {ou.user?.name ?? `Member #${ou.id}`}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

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
  const [startLocal, setStartLocal] = React.useState("");
  const [endLocal, setEndLocal] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startLocal || !endLocal) {
      toast.error("Pick both a start and an end for the open window.");
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(endLocal);
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
      setStartLocal("");
      setEndLocal("");
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
          to you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="open-window-start">Starts</Label>
              <Input
                id="open-window-start"
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="open-window-end">Ends</Label>
              <Input
                id="open-window-end"
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
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
    parts.push(`${c.localTimeStart} to ${c.localTimeEnd}`);
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
