import * as React from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { BellRing, CalendarClock, Check, Settings2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  markSlotOfferViewed,
  useAcceptSlotOffer,
  useDeclineSlotOffer,
  useMySlotOffers,
  useMyStandbyInterest,
  useSetSlotSuggestions,
} from "@/features/slot-offers";
import { useOrgUserPreferences } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { resourceLabel, type ReservationType, type Resource } from "@/types/api";
import { isAskedOffer, isSuggestedOffer, type SlotOffer } from "@/types/slot-offers";
import {
  FirstDibsDialog,
  firstDibsDismissed,
  initialFromSlot,
  type QuickStandbyInitial,
} from "@/components/slot-offers/quick-standby";
import { SlotOfferNotificationWarning } from "@/components/slot-offers/notification-warning";
import { DocsHint } from "@/components/docs-hint";
import { typeLabel } from "@/components/schedule/meta";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Member accept/decline list. Renders inside the Schedule "Offers" tab. */
export function MySlotOffersPanel() {
  const offersQuery = useMySlotOffers();
  const preferencesQuery = useOrgUserPreferences();
  const accept = useAcceptSlotOffer();
  const decline = useDeclineSlotOffer();
  const { orgUserId } = useAuth();
  const interests = useMyStandbyInterest();
  const setSuggestions = useSetSlotSuggestions();
  const [firstDibs, setFirstDibs] = React.useState<QuickStandbyInitial | null>(null);
  const hasPreference = (interests.data ?? []).some(
    (i) => i.status === "active" && (i.kind === "standing" || i.kind === "open_window")
  );

  const pending = (offersQuery.data ?? []).filter((offer) => offer.status === "pending");
  React.useEffect(() => {
    for (const offer of pending) markSlotOfferViewed(offer.id);
  }, [pending]);
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
        const result = await accept.mutateAsync(offer.id);
        toast.success(
          offer.purpose === "instructor_confirm"
            ? "Confirmed. Eligible members can now be offered this slot."
            : result?.bookingRequestId
              ? "Sent to the desk for approval. You'll hear when they decide."
              : "Booked. It's on your schedule."
        );
        if (offer.purpose === "claim" && !hasPreference && interests.isSuccess && !firstDibsDismissed(orgUserId)) {
          setFirstDibs(
            initialFromSlot({ start: offer.start, timeZoneName: offer.timeZoneName })
          );
        }
      } else {
        await decline.mutateAsync(offer.id);
        toast.success(
          offer.purpose === "instructor_confirm"
            ? "Availability declined. Recovery will not offer this slot to students."
            : "Offer declined"
        );
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Couldn't ${action} this offer`
      );
    }
  };

  // Decline, and never pick me by inference again. Their own standby keeps working.
  const stopSuggesting = async (offer: SlotOffer) => {
    try {
      await setSuggestions.mutateAsync(false);
      await decline.mutateAsync(offer.id);
      toast.success("We won't suggest slots to you. Turn it back on under Standby.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update your setting");
    }
  };

  return (
    <div className="space-y-4">
      {notificationsOff && <SlotOfferNotificationWarning />}
      <FirstDibsDialog
        initial={firstDibs}
        open={firstDibs != null}
        onOpenChange={(open) => !open && setFirstDibs(null)}
      />

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
        <Card className="p-6 text-sm text-muted-foreground">Loading offers...</Card>
      ) : offersQuery.isError ? (
        <Card>
          <ErrorState error={offersQuery.error} onRetry={() => void offersQuery.refetch()} />
        </Card>
      ) : pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No pending offers"
            body="When a matching time opens, your offer will appear here."
            docs="slot-offers"
            compact
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              busy={accept.isPending || decline.isPending || setSuggestions.isPending}
              onAccept={() => void act(offer, "accept")}
              onDecline={() => void act(offer, "decline")}
              onStopSuggesting={() => void stopSuggesting(offer)}
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
  onStopSuggesting,
}: {
  offer: SlotOffer;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onStopSuggesting: () => void;
}) {
  const suggested = isSuggestedOffer(offer);
  const asked = isAskedOffer(offer);
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
          {suggested && <Badge variant="secondary">Suggested for you</Badge>}
          {asked && <Badge variant="secondary">You asked for this</Badge>}
          <Badge variant="outline">
            {typeLabel(offer.reservationType as ReservationType)}
          </Badge>
        </div>
      </CardHeader>
      {suggested || (asked && offer.rankSnapshot?.reason) ? (
        <CardContent className="pt-0">
          <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm" data-testid="suggestion-reason">
            {asked ? (
              <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            )}
            <p>
              {suggested ? <span className="font-medium">Why you: </span> : null}
              {offer.rankSnapshot?.reason ?? "It fits how you usually fly."}
            </p>
          </div>
        </CardContent>
      ) : null}
      <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {expired
            ? "This offer has expired."
            : instructorConfirm
              ? `Confirm within ${formatDistanceToNowStrict(new Date(offer.holdUntil))}.`
              : offer.holdsSlot === false
                ? //Holds nothing since 2026-10-14: open until shortly before the slot, first to book wins.
                  `${(offer.rankSnapshot?.roundSize ?? 0) > 1 ? "Others were told too, and the first to book it gets it. " : ""}Open until ${formatClose(offer)}.`
                : `Accept within ${formatDistanceToNowStrict(new Date(offer.holdUntil))}.`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || expired} onClick={onDecline}>
            <X className="size-4" /> Decline
          </Button>
          <Button disabled={busy || expired} onClick={onAccept}>
            <Check className="size-4" /> {instructorConfirm ? "Confirm" : "Book it"}
          </Button>
        </div>
      </CardContent>
      {suggested ? (
        <CardContent className="pt-0">
          <button
            type="button"
            disabled={busy}
            onClick={onStopSuggesting}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            Not for me? Stop suggesting slots
          </button>
        </CardContent>
      ) : null}
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

function formatClose(offer: SlotOffer): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
  }).format(new Date(offer.holdUntil));
}
