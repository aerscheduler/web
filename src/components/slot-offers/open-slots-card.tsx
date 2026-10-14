import * as React from "react";
import { BellRing, CalendarCheck2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  markSlotOfferViewed,
  useAcceptSlotOffer,
  useDeclineSlotOffer,
  useMySlotOffers,
} from "@/features/slot-offers";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canStandBy } from "@/lib/permissions";
import { orgSlotOffersEnabled } from "@/lib/slot-offers-enabled";
import { resourceLabel, type ReservationType, type Resource } from "@/types/api";
import { isAskedOffer, type SlotOffer } from "@/types/slot-offers";
import { typeLabel } from "@/components/schedule/meta";
import { DocsHint } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * "Open slots for you": times that just opened, waiting for the member to take one.
 *
 * Shown where people already are when they think about flying (Home and Book), instead of
 * only as a push. Production, 2026-09-30 to 10-07: of 39 offers pushed to students, 2 were
 * opened and none accepted. Jev's suggestions are no longer pushed at all and wait here;
 * slots a member asked for are pushed AND wait here.
 *
 * Nothing on this card holds anything: everyone told about a slot sees the same one, and the
 * first to book it gets it. Showing an offer here counts as the member having seen it.
 */
export function OpenSlotsCard({ className }: { className?: string }) {
  const { organization, roles } = useAuth();
  const enabled = orgSlotOffersEnabled(organization) && canStandBy(roles);
  const offersQuery = useMySlotOffers();
  const accept = useAcceptSlotOffer();
  const decline = useDeclineSlotOffer();

  const open = React.useMemo(
    () =>
      (offersQuery.data ?? [])
        .filter(
          (o) =>
            o.purpose === "claim" &&
            o.status === "pending" &&
            new Date(o.holdUntil).getTime() > Date.now()
        )
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [offersQuery.data]
  );

  React.useEffect(() => {
    for (const offer of open) markSlotOfferViewed(offer.id);
  }, [open]);

  if (!enabled || open.length === 0) return null;

  const book = async (offer: SlotOffer) => {
    try {
      const result = await accept.mutateAsync(offer.id);
      //A member whose bookings need approval gets a request, as when booking by hand.
      toast.success(
        result?.bookingRequestId
          ? "Sent to the desk for approval. You'll hear when they decide."
          : "Booked. It's on your schedule."
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't book this slot");
    }
  };
  const pass = async (offer: SlotOffer) => {
    try {
      await decline.mutateAsync(offer.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't remove this slot");
    }
  };

  return (
    <Card className={className} data-testid="open-slots-card">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck2 className="size-4 text-primary" />
          Open slots for you
          <DocsHint topic="slot-offers" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Times that just opened up. Nothing is held: the first person to book one gets it.
        </p>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {open.map((offer) => (
          <OpenSlotRow
            key={offer.id}
            offer={offer}
            busy={accept.isPending || decline.isPending}
            onBook={() => void book(offer)}
            onPass={() => void pass(offer)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function OpenSlotRow({
  offer,
  busy,
  onBook,
  onPass,
}: {
  offer: SlotOffer;
  busy: boolean;
  onBook: () => void;
  onPass: () => void;
}) {
  const asked = isAskedOffer(offer);
  const resource = offer.resource ? resourceLabel(offer.resource as Resource).name : null;
  const reason = offer.rankSnapshot?.reason;
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {resource ? `${resource} · ` : ""}
          {typeLabel(offer.reservationType as ReservationType)}
        </p>
        <p className="text-sm text-muted-foreground">{formatSlot(offer)}</p>
        {reason ? (
          <p className="flex items-start gap-1.5 text-sm">
            {asked ? (
              <BellRing className="mt-0.5 size-3.5 shrink-0 text-primary" />
            ) : (
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
            )}
            <span>{reason}</span>
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onPass}>
          Not for me
        </Button>
        <Button size="sm" disabled={busy} onClick={onBook}>
          Book it
        </Button>
      </div>
    </div>
  );
}

function formatSlot(offer: SlotOffer): string {
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
  });
  const end = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
    timeZoneName: "short",
  });
  return `${day.format(new Date(offer.start))} to ${end.format(new Date(offer.end))}`;
}
