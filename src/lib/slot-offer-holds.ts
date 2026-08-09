import type { SlotOffer } from "@/types/slot-offers";

/** A pending offer that still soft-holds a resource on the board. */
export type SlotOfferHold = {
  id: number;
  resourceId: number;
  start: string;
  end: string;
  holdUntil: string;
  offeredToName: string;
  purpose: SlotOffer["purpose"];
  trigger: SlotOffer["trigger"];
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

export function holdOverlaps(
  hold: Pick<SlotOfferHold, "start" | "end">,
  startMs: number,
  endMs: number
): boolean {
  const s = new Date(hold.start).getTime();
  const e = new Date(hold.end).getTime();
  return s < endMs && e > startMs;
}
