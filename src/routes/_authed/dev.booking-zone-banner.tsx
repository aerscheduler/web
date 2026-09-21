import { createFileRoute } from "@tanstack/react-router";
import { BookingZoneBannerView } from "@/components/schedule/booking-zone-banner";

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
          Shown to owners and admins on the dashboard, the schedule and the booking form while
          the school has no time zone. Members never see it; their booking refusal says their
          admins have been told.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Airport found (the usual case)</h2>
        <BookingZoneBannerView suggestion={{ zone: "America/Chicago", from: "KCUH" }} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">No airport match: this computer's zone</h2>
        <BookingZoneBannerView suggestion={{ zone: "America/Denver", from: null }} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Nothing to suggest</h2>
        <BookingZoneBannerView suggestion={null} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">On the schedule (in context)</h2>
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            The Ramp
          </p>
          <BookingZoneBannerView suggestion={{ zone: "America/Chicago", from: "KOSX" }} />
          <div className="h-32 rounded-md border border-dashed bg-muted/30" aria-hidden />
        </div>
      </section>
    </div>
  );
}
