import type { SlotOffer } from "@/types/slot-offers";
import type { BookingRequest } from "@/types/booking-requests";

/** A pending offer or public guest request that still soft-holds a resource on the board. */
export type SlotOfferHold = {
  id: number;
  kind?: "slot_offer" | "public_request";
  resourceId: number;
  start: string;
  end: string;
  holdUntil: string;
  offeredToName: string;
  purpose?: SlotOffer["purpose"];
  trigger?: SlotOffer["trigger"];
};

/** Pending offers whose hold has not expired and that pin a resource lane. */
export function liveSlotOfferHolds(
  offers: SlotOffer[] | undefined,
  nowMs: number = Date.now()
): SlotOfferHold[] {
  if (!offers?.length) return [];
  const out: SlotOfferHold[] = [];
  for (const offer of offers) {
    if (offer.status !== "pending") continue;
    if (new Date(offer.holdUntil).getTime() <= nowMs) continue;
    const resourceId = offer.resource?.id;
    if (resourceId == null) continue;
    out.push({
      id: offer.id,
      kind: "slot_offer",
      resourceId,
      start: offer.start,
      end: offer.end,
      holdUntil: offer.holdUntil,
      offeredToName: offer.offeredTo?.user?.name?.trim() || "a member",
      purpose: offer.purpose,
      trigger: offer.trigger,
    });
  }
  return out;
}

/** Confirmed public requests that already pin a tail (pick-aircraft). */
export function livePublicRequestHolds(
  requests: BookingRequest[] | undefined,
  nowMs: number = Date.now()
): SlotOfferHold[] {
  if (!requests?.length) return [];
  const out: SlotOfferHold[] = [];
  for (const request of requests) {
    if (request.source !== "public_embed") continue;
    if (request.status !== "pending" && request.status !== "unverified") continue;
    const resourceId = request.resource?.id;
    if (resourceId == null) continue;
    const endMs = new Date(request.end).getTime();
    if (Number.isNaN(endMs) || endMs <= nowMs) continue;
    const awaitingEmail = request.status === "unverified";
    out.push({
      id: request.id,
      kind: "public_request",
      resourceId,
      start: request.start,
      end: request.end,
      holdUntil: request.end,
      offeredToName: awaitingEmail
        ? "Guest (awaiting email)"
        : request.guestName?.trim() || "Guest",
      purpose: "claim",
      trigger: "system",
    });
  }
  return out;
}

export function holdOverlaps(
  hold: Pick<SlotOfferHold, "start" | "end">,
  startMs: number,
  endMs: number
): boolean {
  const s = new Date(hold.start).getTime();
  const e = new Date(hold.end).getTime();
  return s < endMs && e > startMs;
}

/** Desk chrome: pending work plus inviteable guests, not unverified holds. */
export function deskBookingRequestChromeCount(
  requests: BookingRequest[] | undefined
): number {
  if (!requests?.length) return 0;
  let n = 0;
  for (const request of requests) {
    if (request.status === "pending") {
      n += 1;
      continue;
    }
    if (
      request.status === "approved" &&
      request.source === "public_embed" &&
      !request.convertedAt &&
      !!request.guestEmail
    ) {
      n += 1;
    }
  }
  return n;
}

/** Why a soft-hold block cannot be dragged, in the same voice as locked bookings. */
export function holdDragRefusalReason(hold: SlotOfferHold): string {
  if (hold.kind === "public_request") {
    return `This time is held for ${hold.offeredToName}'s public request. Open Booking requests to approve or decline it.`;
  }
  const who =
    hold.purpose === "instructor_confirm"
      ? `${hold.offeredToName} (instructor confirm)`
      : hold.offeredToName;
  return `This time is offered to ${who}. Open the offer to withdraw it, or wait until it ends.`;
}

export function holdBlockLabel(hold: SlotOfferHold): string {
  if (hold.kind === "public_request") {
    return `Request: ${hold.offeredToName}`;
  }
  return hold.purpose === "instructor_confirm"
    ? `Confirm: ${hold.offeredToName}`
    : `Offer: ${hold.offeredToName}`;
}
