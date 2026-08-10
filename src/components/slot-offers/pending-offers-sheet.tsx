import { formatDistanceToNowStrict } from "date-fns";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { usePendingSlotOffers, useWithdrawSlotOffer } from "@/features/slot-offers";
import { ApiError } from "@/lib/api";
import type { SlotOffer } from "@/types/slot-offers";
import { resourceLabel, type Resource } from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states";

/**
 * Desk list of open offers. Uses the same DetailPanel as reservation /
 * invoice / squawk detail so it docks beside the board on wide screens and
 * falls back to the modal sheet below that.
 *
 * Row click opens the same SlotOfferDetailSheet as a calendar offer click.
 */
export function PendingOffersSheet({
  open,
  onOpenChange,
  onSelectOffer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectOffer?: (offerId: number) => void;
}) {
  const offersQuery = usePendingSlotOffers(open);
  const withdraw = useWithdrawSlotOffer();

  const withdrawOffer = async (offer: SlotOffer) => {
    try {
      await withdraw.mutateAsync(offer.id);
      toast.success("Offer withdrawn");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't withdraw this offer");
    }
  };

  const offers = offersQuery.data ?? [];

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="inline-flex items-center gap-2">
          Pending offers
          <DocsHint topic="pending-slot-offers" />
        </span>
      }
      description="Offers currently open for members. Instructor confirms come first on duals. Withdraw frees the window and stops the chain."
    >
      {offersQuery.isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading offers...</p>
      ) : offersQuery.isError ? (
        <ErrorState error={offersQuery.error} onRetry={() => void offersQuery.refetch()} />
      ) : offers.length === 0 ? (
        <div className="py-8 text-center">
          <RefreshCw className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">No pending offers</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Offer a canceled reservation to start recovery.
          </p>
        </div>
      ) : (
        <ul className="-mx-4 divide-y divide-border border-t">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
              <button
                type="button"
                className="min-w-0 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectOffer?.(offer.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {offer.offeredTo?.user?.name ?? `Member #${offer.offeredTo?.id}`}
                  </p>
                  {offer.purpose === "instructor_confirm" && (
                    <Badge variant="secondary">Instructor confirm</Badge>
                  )}
                  <Badge variant="outline">{triggerLabel(offer.trigger)}</Badge>
                  <Badge variant="outline">{offer.reservationType}</Badge>
                  {offer.notificationDelivery?.anyChannelEnabled === false && (
                    <Badge variant="outline">Notifications off</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {offer.resource
                    ? `${resourceLabel(offer.resource as Resource).name} · `
                    : ""}
                  {formatWindow(offer)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Offer ends in {formatDistanceToNowStrict(new Date(offer.holdUntil))}
                </p>
              </button>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={withdraw.isPending}
                onClick={() => void withdrawOffer(offer)}
              >
                <X className="size-4" /> Withdraw
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  );
}

function formatWindow(offer: SlotOffer): string {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
  });
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: offer.timeZoneName,
    timeZoneName: "short",
  });
  return `${date.format(new Date(offer.start))} to ${time.format(new Date(offer.end))}`;
}

function triggerLabel(trigger: SlotOffer["trigger"]): string {
  if (trigger === "system") return "AerScheduler AI";
  if (trigger === "desk") return "Desk";
  return "Cancel";
}

