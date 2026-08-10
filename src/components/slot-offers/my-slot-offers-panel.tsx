import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { CalendarClock, Check, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useAcceptSlotOffer,
  useDeclineSlotOffer,
  useMySlotOffers,
} from "@/features/slot-offers";
import { useOrgUserPreferences } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { resourceLabel, type ReservationType, type Resource } from "@/types/api";
import type { SlotOffer } from "@/types/slot-offers";
import { SlotOfferNotificationWarning } from "@/components/slot-offers/notification-warning";
import { DocsHint } from "@/components/docs-hint";
import { typeLabel } from "@/components/schedule/meta";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Member accept/decline list. Renders inside the Schedule "Slot offers" tab. */
export function MySlotOffersPanel() {
  const offersQuery = useMySlotOffers();
  const preferencesQuery = useOrgUserPreferences();
  const accept = useAcceptSlotOffer();
  const decline = useDeclineSlotOffer();

  const pending = (offersQuery.data ?? []).filter((offer) => offer.status === "pending");
  const notificationPreferences = preferencesQuery.data?.notificationPreferences;
  const notificationsOff =
    pending.some((offer) => offer.notificationDelivery?.anyChannelEnabled === false) ||
    (!preferencesQuery.isPending &&
      !(
        notificationPreferences?.emailEnabled &&
        notificationPreferences.emailNotificationPreferences?.slotOffers
      ) &&
      !(
        notificationPreferences?.pushEnabled &&
        notificationPreferences.pushNotificationPreferences?.slotOffers
      ));

  const act = async (offer: SlotOffer, action: "accept" | "decline") => {
    try {
      if (action === "accept") {
        await accept.mutateAsync(offer.id);
        toast.success(
          offer.purpose === "instructor_confirm"
            ? "Confirmed. Eligible members can now be offered this slot."
            : "Slot accepted. Your reservation is booked."
        );
      } else {
        await decline.mutateAsync(offer.id);
        toast.success(
          offer.purpose === "instructor_confirm"
            ? "Availability declined. Recovery will not offer this slot to students."
            : "Slot offer declined"
        );
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Couldn't ${action} this slot offer`
      );
    }
  };

  return (
    <div className="space-y-4">
      {notificationsOff && <SlotOfferNotificationWarning />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            Standing preferences
            <DocsHint topic="slot-offers" />
          </p>
          <p className="text-xs text-muted-foreground">
            Set days, types, and open windows so matching slots can be offered to you.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/me/profile" search={{ tab: "standby" }}>
            <Settings2 className="size-4" /> Manage standby
          </Link>
        </Button>
      </div>

      {offersQuery.isPending ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading slot offers...</Card>
      ) : offersQuery.isError ? (
        <Card>
          <ErrorState error={offersQuery.error} onRetry={() => void offersQuery.refetch()} />
        </Card>
      ) : pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No pending slot offers"
            body="When a matching time opens, your offer will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              busy={accept.isPending || decline.isPending}
              onAccept={() => void act(offer, "accept")}
              onDecline={() => void act(offer, "decline")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: SlotOffer;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const expired = new Date(offer.holdUntil).getTime() <= Date.now();
  const resource = offer.resource
    ? resourceLabel(offer.resource as Resource).name
    : "No resource assigned";
  const instructorConfirm = offer.purpose === "instructor_confirm";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>
            {instructorConfirm
              ? "Confirm you can teach this slot"
              : resource !== "No resource assigned"
                ? `${resource} · ${typeLabel(offer.reservationType as ReservationType)}`
                : "Available reservation"}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatWindow(offer)}
            {resource !== "No resource assigned" ? ` · ${resource}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {instructorConfirm && <Badge variant="secondary">Instructor confirm</Badge>}
          <Badge variant="outline">
            {typeLabel(offer.reservationType as ReservationType)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {expired
            ? "This hold has expired."
            : instructorConfirm
              ? `Confirm within ${formatDistanceToNowStrict(new Date(offer.holdUntil))}.`
              : `Accept within ${formatDistanceToNowStrict(new Date(offer.holdUntil))}.`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || expired} onClick={onDecline}>
            <X className="size-4" /> Decline
          </Button>
          <Button disabled={busy || expired} onClick={onAccept}>
            <Check className="size-4" /> {instructorConfirm ? "Confirm" : "Accept"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatWindow(offer: SlotOffer): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
  });
  const endFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
    timeZoneName: "short",
  });
  return `${formatter.format(new Date(offer.start))} to ${endFormatter.format(
    new Date(offer.end)
  )}`;
}
