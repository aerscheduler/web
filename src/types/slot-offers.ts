import type {
  OrganizationUser,
  Reservation,
  Resource,
} from "@/types/api";

declare module "@/types/api" {
  interface ChannelNotificationPreferences {
    slotOffers?: boolean;
  }
}

export type NotificationDelivery = {
  email: boolean;
  push: boolean;
  sms: boolean;
  anyChannelEnabled: boolean;
};

export type StandingCriteria = {
  daysOfWeek?: number[];
  /** "HH:mm" compared against the offer window's local start */
  localTimeStart?: string;
  localTimeEnd?: string;
  resourceIds?: number[];
  resourceTypes?: Array<"plane" | "simulator" | "room">;
  instructorOrgUserIds?: number[];
  reservationTypes?: string[];
};

export type StandbyInterest = {
  id: number;
  createdAt: string;
  updatedAt?: string;
  kind: "on_reservation" | "open_window" | "standing";
  status: "active" | "fulfilled" | "withdrawn" | "expired";
  source: "member" | "desk" | "system";
  priority: number;
  expiresAt?: string | null;
  start?: string | null;
  end?: string | null;
  reservationType?: string | null;
  criteria?: StandingCriteria | null;
  orgUser?: Pick<OrganizationUser, "id" | "user">;
  watchedReservation?: Pick<Reservation, "id" | "start" | "end" | "type" | "title"> | null;
  resource?: Resource | null;
  instructorOrgUser?: Pick<OrganizationUser, "id" | "user"> | null;
  notificationDelivery?: NotificationDelivery;
};

export type CreateStandbyInterestInput = {
  kind: StandbyInterest["kind"];
  watchedReservationId?: number | null;
  start?: string | null;
  end?: string | null;
  reservationType?: string | null;
  resourceId?: number | null;
  instructorOrgUserId?: number | null;
  criteria?: StandingCriteria | null;
  orgUserId?: number;
  priority?: number;
  source?: StandbyInterest["source"];
};

export type SlotOffer = {
  id: number;
  /** GET /slot-offers only: org users this hold does not block (they were on, or cancelled, its source booking). */
  reclaimableBy?: number[];
  createdAt: string;
  updatedAt?: string;
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn" | "superseded";
  trigger: "cancel_recovery" | "desk" | "system";
  purpose: "claim" | "instructor_confirm";
  start: string;
  end: string;
  reservationType: string;
  timeZoneName: string;
  title: string | null;
  holdUntil: string;
  respondedAt: string | null;
  offerGroupId: string;
  offeredTo?: Pick<OrganizationUser, "id" | "user">;
  createdBy?: Pick<OrganizationUser, "id" | "user"> | null;
  standbyInterest?: Pick<StandbyInterest, "id" | "kind" | "priority" | "status"> | null;
  resource?: Resource | null;
  instructorOrgUser?: Pick<OrganizationUser, "id" | "user"> | null;
  sourceReservation?: Pick<Reservation, "id" | "cancelledAt"> | null;
  resultingReservation?: Pick<Reservation, "id" | "start" | "end" | "type"> | null;
  notificationDelivery?: NotificationDelivery;
  /**
   * How the recipient was chosen. `source: "inferred"` means they never stood by for it
   * and were suggested from how they fly; `reason` is the one line that says why.
   */
  rankSnapshot?: { source?: string; ranker?: string; reason?: string } | null;
};

export const isSuggestedOffer = (offer: Pick<SlotOffer, "rankSnapshot" | "purpose">) =>
  offer.purpose === "claim" && offer.rankSnapshot?.source === "inferred";

export type CreateDeskSlotOfferInput =
  | { sourceReservationId: number }
  | {
      offeredToOrgUserId: number;
      start: string;
      end: string;
      reservationType: string;
      timeZoneName?: string | null;
      title?: string | null;
      resourceId?: number | null;
      instructorOrgUserId?: number | null;
      locationId?: number | null;
      standbyInterestId?: number | null;
    };
