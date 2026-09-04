import { createFileRoute } from "@tanstack/react-router";
import { BookingZoneBannerView } from "@/components/schedule/booking-zone-banner";
import { BOOKING_ZONE_MEMBER_MESSAGE } from "@/lib/booking-zone-policy";

const SAMPLE_READINESS_MESSAGE =
  "Set your organization's time zone, or add a location with one, before turning on multi-day bookings. A trip's bill depends on how many nights it spans, and that can only be counted in the airport's own time zone.";

export const Route = createFileRoute("/_authed/dev/booking-zone-banner")({
  component: BookingZoneBannerPreviewPage,
});

function BookingZoneBannerPreviewPage() {
  if (!import.meta.env.DEV) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        This preview is only available in development builds.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 p-8">
      <div>
        <h1 className="text-lg font-semibold">Booking zone banner preview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown on the schedule and booking form when wall-clock rules are on but no airport or
          school time zone is configured.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Front desk / owner view</h2>
        <BookingZoneBannerView message={SAMPLE_READINESS_MESSAGE} staff />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Member view (student / renter)</h2>
        <BookingZoneBannerView message={BOOKING_ZONE_MEMBER_MESSAGE} staff={false} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">On the schedule (in context)</h2>
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            The Ramp
          </p>
          <BookingZoneBannerView message={SAMPLE_READINESS_MESSAGE} staff />
          <div className="h-32 rounded-md border border-dashed bg-muted/30" aria-hidden />
        </div>
      </section>
    </div>
  );
}
