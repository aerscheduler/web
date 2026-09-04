import { TriangleAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useMultiDayReadiness } from "@/features/queries";
import {
  BOOKING_ZONE_MEMBER_MESSAGE,
  orgWallClockRulesActive,
} from "@/lib/booking-zone-policy";
import { isStaff } from "@/lib/permissions";

export type BookingZoneBannerViewProps = {
  message: string;
  staff: boolean;
};

/** Presentational banner for schedule and booking forms (and dev preview). */
export function BookingZoneBannerView({ message, staff }: BookingZoneBannerViewProps) {
  return (
    <div
      className="mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p>{message}</p>
        {staff ? (
          <p>
            <Link to="/settings" className="font-medium underline underline-offset-2">
              Open Settings
            </Link>{" "}
            to set the school or airport time zone.
          </p>
        ) : (
          <p className="text-amber-800 dark:text-amber-200/90">
            Ask the front desk to set the school time zone if you need to book online.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Shown on the schedule when wall-clock rules are on but no booking zone is configured.
 * GET availability stays honest (fail-open); this explains why a member booking may refuse.
 */
export function BookingZoneBanner() {
  const { organization, roles } = useAuth();
  const needsZone = orgWallClockRulesActive(organization);
  const readiness = useMultiDayReadiness({ enabled: needsZone });
  const blocked = needsZone && readiness.data?.ready === false;

  if (!blocked) return null;

  const staff = isStaff(roles);
  const message = readiness.data?.problem ?? BOOKING_ZONE_MEMBER_MESSAGE;

  return <BookingZoneBannerView message={message} staff={staff} />;
}
