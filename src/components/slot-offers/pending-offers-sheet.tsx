import { formatDistanceToNowStrict } from "date-fns";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { usePendingSlotOffers, useWithdrawSlotOffer } from "@/features/slot-offers";
import { ApiError } from "@/lib/api";
import type { SlotOffer } from "@/types/slot-offers";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states";

/**
 * Desk list of open slot offers. Uses the same DetailPanel as reservation /
 * invoice / squawk detail so it docks beside the board on wide screens and
 * falls back to the modal sheet below that.
 */
export function PendingOffersSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const offersQuery = usePendingSlotOffers(open);
  const withdraw = useWithdrawSlotOffer();

  const withdrawOffer = async (offer: SlotOffer) => {
    try {
      await withdraw.mutateAsync(offer.id);
      toast.success("Slot offer withdrawn");
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
          Pending slot offers
          <DocsHint topic="pending-slot-offers" />
        </span>
      }
      description="Offers currently held for members. Withdrawing a recovery offer moves to the next eligible member."
    >
      {offersQuery.isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading offers...</p>
      ) : offersQuery.isError ? (
        <ErrorState error={offersQuery.error} onRetry={() => void offersQuery.refetch()} />
      ) : offers.length === 0 ? (
        <div className="py-8 text-center">
          <RefreshCw className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">No pending slot offers</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Offer a canceled reservation to start recovery.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-col gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {offer.offeredTo?.user?.name ?? `Member #${offer.offeredTo?.id}`}
                  </p>
                  <Badge variant="outline">{offer.reservationType}</Badge>
                  {offer.notificationDelivery?.anyChannelEnabled === false && (
                    <Badge variant="outline">Notifications off</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{formatWindow(offer)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hold ends in {formatDistanceToNowStrict(new Date(offer.holdUntil))}
                </p>
              </div>
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
