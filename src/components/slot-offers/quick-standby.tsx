import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { useMyStandbyInterest } from "@/features/slot-offers";
import { useAuth } from "@/lib/auth";
import { canStandBy } from "@/lib/permissions";
import { orgSlotOffersEnabled } from "@/lib/slot-offers-enabled";
import type { Reservation } from "@/types/api";
import {
  StandingPreferenceModal,
  type StandingInitial,
  type TimeChoice,
} from "@/components/slot-offers/standby-forms";
import { Button } from "@/components/ui/button";

/**
 * "First dibs": pointing pilots at their standing standby preferences.
 *
 * The editor lives on Profile > Standby, and almost nobody found it (four active sign-ups
 * at our busiest school after seven weeks). So the question is asked at the moments a
 * pilot is thinking about their schedule: right after joining a school (onboarding),
 * right after accepting a slot (the Standby modal, prefilled), and as a one-line callout
 * on My schedule that links to the editor.
 */

export type QuickStandbyInitial = StandingInitial;

function timeOfDayForHour(hour: number): TimeChoice {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Weekday and hour of a slot in the zone it was booked in (the airport's). */
function localDayAndHour(iso: string, timeZone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return { day: day < 0 ? 0 : day, hour };
}

/** Prefill from a slot: its weekday and its part of the day. */
export function initialFromSlot(slot: { start: string; timeZoneName?: string | null }): QuickStandbyInitial {
  const { day, hour } = localDayAndHour(slot.start, slot.timeZoneName || "UTC");
  return { days: [day], time: timeOfDayForHour(hour) };
}

/** Prefill from a booking the member is on. */
export function initialFromReservation(reservation: Reservation): QuickStandbyInitial {
  return initialFromSlot({ start: reservation.start, timeZoneName: reservation.timeZoneName });
}

/**
 * Right after someone accepts a slot: they just showed they want this, so it is the best
 * moment to ask for a standing preference. Opens only when they have none yet.
 */
export function FirstDibsDialog({
  initial,
  open,
  onOpenChange,
}: {
  initial: QuickStandbyInitial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { orgUserId } = useAuth();
  return (
    <StandingPreferenceModal
      open={open && initial != null}
      onOpenChange={onOpenChange}
      initial={initial ?? undefined}
      description="Want first dibs on slots like this? When one opens, you're offered it before anyone else. You can always say no."
      cancelLabel="No thanks"
      // "No thanks" is an answer: do not ask again on My schedule a minute later.
      onCancel={() => orgUserId != null && writeDismissed(orgUserId)}
    />
  );
}

const dismissKey = (orgUserId: number) => `first-dibs-dismissed:${orgUserId}`;

/** Has this member dismissed the first-dibs ask on this browser? */
export function firstDibsDismissed(orgUserId: number | null | undefined): boolean {
  if (orgUserId == null) return false;
  try {
    return window.localStorage.getItem(dismissKey(orgUserId)) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(orgUserId: number) {
  try {
    window.localStorage.setItem(dismissKey(orgUserId), "1");
  } catch {
    // Private mode or blocked storage: the callout simply comes back next visit.
  }
}

/**
 * A one-line callout on My schedule linking to Profile > Standby. Only for someone who
 * can be seated, at a school with offers on, who has no standing or open-window
 * preference yet. The X hides it on this browser; setting one up hides it for good.
 */
export function FirstDibsCallout() {
  const { organization, roles, orgUserId } = useAuth();
  const interests = useMyStandbyInterest();
  const [dismissed, setDismissed] = React.useState(() => firstDibsDismissed(orgUserId));

  const hasPreference = (interests.data ?? []).some(
    (i) => i.status === "active" && (i.kind === "standing" || i.kind === "open_window")
  );

  if (
    dismissed ||
    orgUserId == null ||
    !orgSlotOffersEnabled(organization) ||
    !canStandBy(roles) ||
    interests.isPending ||
    interests.isError ||
    hasPreference
  ) {
    return null;
  }

  return (
    <div
      data-testid="first-dibs-callout"
      className="flex items-center gap-1 rounded-lg border bg-card pr-1 text-sm"
    >
      <Link
        to="/me/profile"
        search={{ tab: "standby" }}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg py-2.5 pl-3 hover:bg-accent/50"
      >
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">Get first dibs on cancelled slots</span>
          <span className="hidden text-muted-foreground sm:inline">
            {" "}
            Tell us when you&rsquo;re usually free.
          </span>
        </span>
        <span className="flex shrink-0 items-center font-medium text-primary">
          Set up <ChevronRight className="size-4" aria-hidden />
        </span>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label="Dismiss"
        onClick={() => {
          writeDismissed(orgUserId);
          setDismissed(true);
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
