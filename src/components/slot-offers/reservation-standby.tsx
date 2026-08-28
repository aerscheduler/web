import { RefreshCw, UserRoundPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateSlotOffer,
  useCreateStandbyInterest,
  useMyStandbyInterest,
  useReservationStandby,
  useWithdrawStandbyInterest,
} from "@/features/slot-offers";
import { useOrgUserPreferences } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canStandBy, isStaff } from "@/lib/permissions";
import { orgSlotOffersEnabled } from "@/lib/slot-offers-enabled";
import { isOnReservation } from "@/components/schedule/reservation-shared";
import type { Reservation } from "@/types/api";
import type { StandbyInterest } from "@/types/slot-offers";
import { SlotOfferNotificationWarning } from "./notification-warning";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ReservationStandby({ reservation }: { reservation: Reservation }) {
  const { roles, organization, orgUserId } = useAuth();
  const desk = isStaff(roles);
  const slotOffersOn = orgSlotOffersEnabled(organization);
  const mineQuery = useMyStandbyInterest();
  const watchersQuery = useReservationStandby(reservation.id, desk && slotOffersOn);
  const createStandby = useCreateStandbyInterest();
  const withdrawStandby = useWithdrawStandbyInterest();
  const createOffer = useCreateSlotOffer();
  const preferencesQuery = useOrgUserPreferences();

  if (!slotOffersOn) return null;

  const myInterest = (mineQuery.data ?? []).find(
    (interest) =>
      interest.status === "active" &&
      interest.kind === "on_reservation" &&
      interest.watchedReservation?.id === reservation.id
  );
  const watchers = (watchersQuery.data ?? []).filter(
    (interest) => interest.status === "active"
  );
  const notificationPreferences = preferencesQuery.data?.notificationPreferences;
  const notificationsOff =
    !preferencesQuery.isPending &&
    !(
      notificationPreferences?.emailEnabled &&
      notificationPreferences.emailNotificationPreferences?.slotOffers
    ) &&
    !(
      notificationPreferences?.pushEnabled &&
      notificationPreferences.pushNotificationPreferences?.slotOffers
    );
  // You cannot queue for a seat you are already in. Without this the renter who
  // booked the flight was invited to "Stand by for this booking", their own.
  const onBooking = isOnReservation(reservation, orgUserId);
  const standbyOpen =
    !reservation.cancelledAt && new Date(reservation.end).getTime() > Date.now();
  // Standby ends with you seated on the flight, so only the roles that can be
  // seated are invited, the same way self-booking is withheld. An owner or admin
  // with no pilot role was being offered a slot they could never take.
  const seatable = canStandBy(roles);
  // A pre-existing interest still gets its withdraw affordance (the desk can add
  // someone to the booking after they joined standby, and a role can be removed
  // after the fact); only the invitation goes.
  const showStandbyCard = standbyOpen && (!!myInterest || (seatable && !onBooking));

  const join = async () => {
    try {
      const interest = await createStandby.mutateAsync({
        kind: "on_reservation",
        watchedReservationId: reservation.id,
      });
      toast.success("You're standing by for this booking");
      if (interest.notificationDelivery?.anyChannelEnabled === false) {
        toast.warning("Turn on offer notifications so you do not miss an opening.");
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't join standby for this booking"
      );
    }
  };

  const leave = async (interest: StandbyInterest) => {
    try {
      await withdrawStandby.mutateAsync(interest.id);
      toast.success("Standby withdrawn");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't withdraw standby");
    }
  };

  const offerSlot = async () => {
    try {
      const offer = await createOffer.mutateAsync({
        sourceReservationId: reservation.id,
      });
      toast.success(
        offer?.offeredTo?.user?.name
          ? `Offered to ${offer.offeredTo.user.name}`
          : offer
            ? "Offer sent"
            : "No eligible standby members matched this slot"
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't offer this slot");
    }
  };

  return (
    <div className="space-y-3">
      {(myInterest?.notificationDelivery?.anyChannelEnabled === false ||
        (showStandbyCard && !myInterest && notificationsOff)) && (
        <SlotOfferNotificationWarning />
      )}

      {showStandbyCard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserRoundPlus className="size-4 text-muted-foreground" />
              Standby
              <DocsHint topic="standby-for-booking" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {myInterest ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">You are standing by</p>
                  <p className="text-xs text-muted-foreground">
                    You may receive a time-limited offer if this booking opens.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={withdrawStandby.isPending}
                  onClick={() => void leave(myInterest)}
                >
                  Withdraw
                </Button>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Get an offer if this booking is canceled and you are eligible.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={mineQuery.isPending || createStandby.isPending}
                  onClick={() => void join()}
                >
                  <UserRoundPlus className="size-4" /> Stand by for this booking
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {desk && standbyOpen && (
        <WatcherList watchers={watchers} loading={watchersQuery.isPending} />
      )}

      {desk && reservation.cancelledAt && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Fill this canceled slot</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start or resume recovery with eligible members who joined standby.
            </p>
            <Button
              className="mt-3 w-full"
              disabled={createOffer.isPending}
              onClick={() => void offerSlot()}
            >
              <RefreshCw className="size-4" /> Offer this slot
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WatcherList({
  watchers,
  loading,
}: {
  watchers: StandbyInterest[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <Users className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm">Standby watchers</CardTitle>
        {!loading && <Badge variant="secondary">{watchers.length}</Badge>}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading watchers...</p>
        ) : watchers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members are watching this booking.</p>
        ) : (
          <ul className="space-y-2">
            {watchers.map((interest) => (
              <li key={interest.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{interest.orgUser?.user?.name ?? `Member #${interest.orgUser?.id}`}</span>
                {interest.notificationDelivery?.anyChannelEnabled === false && (
                  <Badge variant="outline">Notifications off</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
