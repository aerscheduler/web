import { describe, expect, it } from "vitest";
import type { Reservation, Resource } from "@/types/api";
import type { SlotOfferHold } from "@/lib/slot-offer-holds";
import { validateDrop } from "./drag-rules";

/**
 * A slot-offer hold on the board, against the server's reclaim rule
 * (server/src/utils/slotOfferReclaim.ts): the people on the cancelled booking the offer came
 * from may take the slot back, so the board must not refuse a move the server allows.
 */
const plane = { id: 7, type: { plane: { id: 7, tailNumber: "N172TS" } } } as unknown as Resource;

const lesson = (crew: number[]): Reservation =>
  ({
    id: 1,
    type: "dual",
    title: "Lesson",
    start: "2031-05-05T14:00:00.000Z",
    end: "2031-05-05T15:00:00.000Z",
    resource: plane,
    personnel: { instructors: [{ id: crew[0] }], students: [{ id: crew[1] }], renters: [] },
    review: null,
  }) as unknown as Reservation;

const hold: SlotOfferHold = {
  id: 99,
  kind: "slot_offer",
  resourceId: 7,
  start: "2031-05-05T16:00:00.000Z",
  end: "2031-05-05T17:00:00.000Z",
  holdUntil: "2031-05-05T13:00:00.000Z",
  offeredToName: "Maya Chen",
  reclaimableBy: [3, 4],
};

const dropOntoHold = (r: Reservation, viewerOrgUserId: number | null) =>
  validateDrop({
    r,
    next: { start: new Date("2031-05-05T16:00:00.000Z"), end: new Date("2031-05-05T17:00:00.000Z") },
    targetResource: plane,
    targetResourceId: 7,
    others: [],
    slotOfferHolds: [hold],
    viewerOrgUserId,
    zone: "America/Denver",
  });

describe("validateDrop and slot-offer holds", () => {
  it("refuses a booking with nobody from the cancelled lesson on it", () => {
    expect(dropOntoHold(lesson([10, 20]), 1).ok).toBe(false);
  });

  it("lets the cancelled lesson's crew take the slot back", () => {
    expect(dropOntoHold(lesson([3, 20]), 1).ok).toBe(true);
  });

  it("lets whoever gave the slot up move a booking into it", () => {
    expect(dropOntoHold(lesson([10, 20]), 4).ok).toBe(true);
  });
});
