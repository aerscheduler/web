import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock, CalendarRange, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import {
  useMyStandbyInterest,
  useSetSlotSuggestions,
  useSlotSuggestions,
  useWithdrawStandbyInterest,
} from "@/features/slot-offers";
import { useMembers, useOrgUserPreferences, useResources } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { resourceLabel, type ReservationType } from "@/types/api";
import type { StandbyInterest } from "@/types/slot-offers";
import { TYPE_LABEL } from "@/components/schedule/meta";
import { SlotOfferNotificationWarning } from "@/components/slot-offers/notification-warning";
import {
  OpenWindowModal,
  StandingPreferenceModal,
  formatClockLabel,
} from "@/components/slot-offers/standby-forms";
import { PreferenceToggle } from "@/components/settings/parts";
import { DocsHint } from "@/components/docs-hint";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Profile > Standby: the suggestions switch, the preferences you have, and buttons that
 * open the Standby and Open window modals. Per-reservation "stand by" stays on the
 * booking detail panel.
 */
export function StandbyPreferencesPanel() {
  const interestsQuery = useMyStandbyInterest();
  const preferencesQuery = useOrgUserPreferences();
  const withdraw = useWithdrawStandbyInterest();
  const resourcesQ = useResources();
  const instructorsQ = useMembers({ instructor: true });
  const [adding, setAdding] = React.useState<"standing" | "open_window" | null>(null);

  const active = (interestsQuery.data ?? [])
    .filter(
      (interest) =>
        interest.status === "active" &&
        (interest.kind === "standing" || interest.kind === "open_window")
    )
    // Weekly patterns first, Monday to Sunday, then one-off windows in date order.
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "standing" ? -1 : 1;
      if (a.kind === "open_window") return (a.start ?? "").localeCompare(b.start ?? "");
      return weekOrder(a) - weekOrder(b) || (a.criteria?.localTimeStart ?? "").localeCompare(b.criteria?.localTimeStart ?? "");
    });

  const names = React.useMemo(() => {
    const resources = new Map<number, string>();
    for (const r of resourcesQ.data ?? []) resources.set(r.id, resourceLabel(r).name);
    const instructors = new Map<number, string>();
    for (const ou of instructorsQ.data ?? []) {
      instructors.set(ou.id, ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`);
    }
    return { resources, instructors };
  }, [resourcesQ.data, instructorsQ.data]);

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
      toast.error(error instanceof ApiError ? error.message : "Couldn't withdraw this preference");
    }
  };

  return (
    <div className="space-y-5">
      {notificationsOff && <SlotOfferNotificationWarning />}

      <SuggestionsSetting />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Your preferences
            <DocsHint topic="standing-preferences" />
          </CardTitle>
          <CardDescription>
            When someone cancels a time that matches, you&rsquo;re offered it before anyone
            else. Add as many as you like.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {interestsQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading preferences…</p>
          ) : interestsQuery.isError ? (
            <ErrorState error={interestsQuery.error} onRetry={() => void interestsQuery.refetch()} />
          ) : active.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No preferences yet"
              body="Add the days and times you're usually free, or one specific window."
              docs="standing-preferences"
              compact
            />
          ) : (
            <ul className="divide-y rounded-lg border" data-testid="standby-preferences">
              {active.map((interest) => {
                const Icon = interest.kind === "standing" ? Repeat : CalendarRange;
                const what = describeWhat(interest, names);
                return (
                  <li key={interest.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{describeWhen(interest)}</p>
                      <p className="truncate text-xs text-muted-foreground">{what}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      disabled={withdraw.isPending}
                      onClick={() => void leave(interest)}
                    >
                      Withdraw
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding("standing")}>
              <Plus className="size-4" /> Add preference
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding("open_window")}>
              <Plus className="size-4" /> Add open window
            </Button>
          </div>
        </CardContent>
      </Card>

      <StandingPreferenceModal
        open={adding === "standing"}
        onOpenChange={(open) => setAdding(open ? "standing" : null)}
      />
      <OpenWindowModal
        open={adding === "open_window"}
        onOpenChange={(open) => setAdding(open ? "open_window" : null)}
      />
    </div>
  );
}

/**
 * The opt-out for suggested offers: slots offered because of how you fly, when you did
 * not stand by for them. Standby you set up yourself is unaffected either way.
 */
function SuggestionsSetting() {
  const suggestions = useSlotSuggestions();
  const setSuggestions = useSetSlotSuggestions();
  const enabled = suggestions.data?.enabled ?? true;

  const toggle = async (next: boolean) => {
    try {
      await setSuggestions.mutateAsync(next);
      toast.success(next ? "Suggested slots are on" : "Suggested slots are off");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update your setting");
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <PreferenceToggle
          label="Suggest open slots to me"
          docs="suggested-slots"
          description="Cancelled slots that fit how you usually fly, even without a preference. At most a few a week, and they stop after you pass on three in a row."
          checked={enabled}
          disabled={suggestions.isPending}
          saving={setSuggestions.isPending}
          onCheckedChange={(v) => void toggle(v)}
        />
      </CardContent>
    </Card>
  );
}

/** Earliest day in a Monday-first week; "any day" sorts first. */
function weekOrder(interest: StandbyInterest): number {
  const days = interest.criteria?.daysOfWeek ?? [];
  return days.length ? Math.min(...days.map((d) => (d + 6) % 7)) : -1;
}

function describeWhen(interest: StandbyInterest): string {
  if (interest.kind === "open_window" && interest.start && interest.end) {
    const s = parseISO(interest.start);
    const e = parseISO(interest.end);
    const sameDay = format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd");
    return sameDay
      ? `${format(s, "EEE, MMM d")} · ${format(s, "h:mm a")} to ${format(e, "h:mm a")}`
      : `${format(s, "EEE, MMM d, h:mm a")} to ${format(e, "EEE, MMM d, h:mm a")}`;
  }
  const c = interest.criteria ?? {};
  const days = c.daysOfWeek?.length
    ? c.daysOfWeek.length === 7
      ? "Every day"
      : c.daysOfWeek.map((d) => DAY_SHORT[d] ?? String(d)).join(", ")
    : "Any day";
  const time =
    c.localTimeStart && c.localTimeEnd
      ? `${formatClockLabel(c.localTimeStart)} to ${formatClockLabel(c.localTimeEnd)}`
      : "Any time";
  return `${days} · ${time}`;
}

function describeWhat(
  interest: StandbyInterest,
  names: { resources: Map<number, string>; instructors: Map<number, string> }
): string {
  if (interest.kind === "open_window") return "Open window";
  const c = interest.criteria ?? {};
  const parts: string[] = [
    c.reservationTypes?.length
      ? `Standing · ${c.reservationTypes.map((t) => TYPE_LABEL[t as ReservationType] ?? t).join(", ")}`
      : "Standing preference",
  ];
  if (c.resourceIds?.length) {
    parts.push(c.resourceIds.map((id) => names.resources.get(id) ?? `Aircraft #${id}`).join(", "));
  }
  if (c.instructorOrgUserIds?.length) {
    parts.push(
      `with ${c.instructorOrgUserIds.map((id) => names.instructors.get(id) ?? "an instructor").join(" or ")}`
    );
  }
  return parts.join(" · ");
}
