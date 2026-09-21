import { Clock, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMultiDayReadiness, useUpdateOrganizationTimeZone } from "@/features/queries";
import { isAdmin } from "@/lib/permissions";
import { DEVICE_TIME_ZONE, describeZone, isValidTimeZone } from "@/lib/timezone";
import { Button } from "@/components/ui/button";

/** The zone to offer, and where it came from: the school's airport, or this computer. */
export type ZoneSuggestion = { zone: string; from: string | null };

export type BookingZoneBannerViewProps = {
  suggestion: ZoneSuggestion | null;
  onUse?: () => void;
  busy?: boolean;
};

/**
 * Presentational half, so the dev preview can render it without a school behind it.
 *
 * Says what is broken in the admin's terms (members can't book), not the mechanism, and puts
 * the fix one click away. The suggestion is the airport's zone when the server could find the
 * airport, else this computer's; either way the admin sees it before it is saved.
 */
export function BookingZoneBannerView({ suggestion, onUse, busy }: BookingZoneBannerViewProps) {
  return (
    <div
      className="mb-3 flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
      data-doc-shot="booking-zone-banner"
    >
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-0.5">
          <p className="font-medium">Members can't book online until your school has a time zone.</p>
          <p className="text-amber-800 dark:text-amber-200/90">
            Hours and booking rules are read on your airport's clock, so a member's booking has
            nothing to be checked against yet. You and the front desk can still book for them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {suggestion && (
            <Button size="sm" onClick={onUse} disabled={busy}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Use {describeZone(suggestion.zone)}
            </Button>
          )}
          {suggestion && (
            <span className="text-xs text-amber-800 dark:text-amber-200/80">
              {suggestion.from ? `The time zone at ${suggestion.from}` : "This computer's time zone"}
            </span>
          )}
          <Link
            to="/settings"
            search={{ tab: "organization" }}
            className="text-xs font-medium underline underline-offset-2"
          >
            {suggestion ? "Choose a different one" : "Choose your time zone"}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown to owners and admins, on the dashboard, the schedule and the booking form, whenever
 * the school has no time zone a booking could be read in.
 *
 * Only they see it because only they can fix it, and because the readiness endpoint is
 * theirs. Members learn about it from the booking refusal, which now says their admins have
 * been told (and they have: the server notifies them).
 */
export function BookingZoneBanner() {
  const { roles, rehydrate } = useAuth();
  const admin = isAdmin(roles);
  const readiness = useMultiDayReadiness({ enabled: admin });
  const update = useUpdateOrganizationTimeZone();

  if (!admin || readiness.data?.ready !== false) return null;

  const fromAirport = readiness.data.suggestedTimeZone;
  const suggestion: ZoneSuggestion | null = isValidTimeZone(fromAirport)
    ? { zone: fromAirport!, from: readiness.data.suggestedFrom ?? null }
    : isValidTimeZone(DEVICE_TIME_ZONE)
      ? { zone: DEVICE_TIME_ZONE, from: null }
      : null;

  const use = () => {
    if (!suggestion) return;
    update.mutate(suggestion.zone, {
      onSuccess: async () => {
        toast.success(`Time zone set to ${describeZone(suggestion.zone)}. Members can book online again.`);
        await rehydrate();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Couldn't save the time zone"),
    });
  };

  return <BookingZoneBannerView suggestion={suggestion} onUse={use} busy={update.isPending} />;
}
