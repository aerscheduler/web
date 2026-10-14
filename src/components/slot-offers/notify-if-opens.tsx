import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateStandbyInterest,
  useMyStandbyInterest,
  useWithdrawStandbyInterest,
} from "@/features/slot-offers";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canStandBy } from "@/lib/permissions";
import { orgSlotOffersEnabled } from "@/lib/slot-offers-enabled";
import { zonedWallClockToUtc } from "@/lib/timezone";
import { Button } from "@/components/ui/button";

const DAY_MS = 86_400_000;

/**
 * "Can't find the time you want? Notify me if N46132 opens on Tue, Oct 21."
 *
 * The moment somebody wants a slot is the moment they will say so: the time picker only
 * ever lists free times, so a student who wanted a taken one simply sees it missing and
 * gives up. This turns that moment into a standby request for the aircraft (and the
 * instructor, if one is chosen) for that whole day, the way a restaurant's "Notify me"
 * works. When anything that matches frees up they are told, along with anybody else who
 * asked, and the first to book it gets it.
 *
 * Before 2026-10-14 standby was set on a profile tab almost nobody found (7 people at the
 * busiest school), so nearly every recovered slot went to people who had never asked.
 */
export function NotifyIfOpens({
  date,
  timeZone,
  resourceId,
  resourceName,
  instructorOrgUserId,
  reservationType,
}: {
  /** "yyyy-MM-dd" of the day being booked, in the organization's zone. */
  date: string;
  timeZone: string;
  resourceId: number | null;
  resourceName: string | null;
  instructorOrgUserId: number | null;
  reservationType: string;
}) {
  const { organization, roles } = useAuth();
  const mine = useMyStandbyInterest();
  const create = useCreateStandbyInterest();
  const withdraw = useWithdrawStandbyInterest();

  if (!orgSlotOffersEnabled(organization) || !canStandBy(roles)) return null;
  if (!date || resourceId == null || !resourceName) return null;

  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dayStart = zonedWallClockToUtc(y, m, d, 0, 0, timeZone);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  //Nothing to ask for once the day is over.
  if (dayEnd.getTime() <= Date.now()) return null;

  const existing = (mine.data ?? []).find(
    (i) =>
      i.status === "active" &&
      i.kind === "open_window" &&
      i.resource?.id === resourceId &&
      i.start != null &&
      new Date(i.start).getTime() === dayStart.getTime()
  );

  const dayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(dayStart);

  const ask = async () => {
    try {
      const interest = await create.mutateAsync({
        kind: "open_window",
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
        expiresAt: dayEnd.toISOString(),
        resourceId,
        instructorOrgUserId,
        reservationType,
      });
      toast.success(`We'll tell you if ${resourceName} opens on ${dayLabel}.`);
      if (interest.notificationDelivery?.anyChannelEnabled === false) {
        toast.warning("Your offer notifications are off, so it will only show under Open slots for you.");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't set that up");
    }
  };

  const stop = async () => {
    if (!existing) return;
    try {
      await withdraw.mutateAsync(existing.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't stop it");
    }
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
      data-testid="notify-if-opens"
    >
      {existing ? (
        <>
          <span className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            You'll hear if {resourceName} opens on {dayLabel}.
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={withdraw.isPending} onClick={() => void stop()}>
            Stop
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">
            Can't find the time you want? Hear if {resourceName} opens up on {dayLabel}.
          </span>
          <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={() => void ask()}>
            <BellRing className="size-4" /> Notify me
          </Button>
        </>
      )}
    </div>
  );
}
