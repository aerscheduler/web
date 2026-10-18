import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function SlotOfferNotificationWarning() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">Offer notifications are off</p>
        <p className="mt-0.5 text-muted-foreground">
          Offers expire quickly. Turn on email or push alerts so you have time to accept.
        </p>
        <Link
          to="/me/notifications"
          className="mt-2 inline-flex font-medium text-primary hover:underline"
        >
          Open notification settings
        </Link>
      </div>
    </div>
  );
}
