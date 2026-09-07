import { describe, expect, it } from "vitest";
import {
  holdBlockLabel,
  holdDragRefusalReason,
  livePublicRequestHolds,
  deskBookingRequestChromeCount,
} from "./slot-offer-holds";
import type { BookingRequest } from "@/types/booking-requests";

function request(partial: Partial<BookingRequest>): BookingRequest {
  return {
    id: 11,
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    status: "pending",
    source: "public_embed",
    reservationType: "guest",
    start: "2026-09-11T15:00:00.000Z",
    end: "2026-09-11T16:00:00.000Z",
    timeZoneName: "UTC",
    guestName: "Pat Guest",
    resource: { id: 42 } as BookingRequest["resource"],
    ...partial,
  };
}

describe("livePublicRequestHolds", () => {
  it("paints pending pick-aircraft public requests", () => {
    const holds = livePublicRequestHolds([request({})], Date.parse("2026-09-10T00:00:00.000Z"));
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({
      id: 11,
      kind: "public_request",
      resourceId: 42,
      offeredToName: "Pat Guest",
    });
  });

  it("paints unverified pick-aircraft holds without the guest name", () => {
    const holds = livePublicRequestHolds(
      [request({ status: "unverified", guestName: "Pat Guest" })],
      Date.parse("2026-09-10T00:00:00.000Z")
    );
    expect(holds).toHaveLength(1);
    expect(holds[0]?.offeredToName).toBe("Guest (awaiting email)");
  });

  it("skips unlabeled desk-assigns requests", () => {
    expect(
      livePublicRequestHolds(
        [request({ resource: null })],
        Date.parse("2026-09-10T00:00:00.000Z")
      )
    ).toEqual([]);
  });
});

describe("deskBookingRequestChromeCount", () => {
  it("counts pending and inviteable rows, not unverified holds", () => {
    expect(
      deskBookingRequestChromeCount([
        request({ id: 1, status: "unverified" }),
        request({ id: 2, status: "pending" }),
        request({
          id: 3,
          status: "approved",
          convertedAt: null,
          guestEmail: "pat@example.com",
        }),
        request({
          id: 4,
          status: "approved",
          convertedAt: "2026-09-07T00:00:00.000Z",
          guestEmail: "done@example.com",
        }),
      ])
    ).toBe(2);
  });
});

describe("hold copy", () => {
  it("names a public request instead of an offer", () => {
    const hold = livePublicRequestHolds(
      [request({})],
      Date.parse("2026-09-10T00:00:00.000Z")
    )[0]!;
    expect(holdBlockLabel(hold)).toBe("Request: Pat Guest");
    expect(holdDragRefusalReason(hold)).toMatch(/Booking requests/i);
  });
});
