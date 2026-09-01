import { describe, expect, it } from "vitest";
import { auditEvents } from "./reservation-audit";
import type { Reservation } from "@/types/api";

/**
 * THE TIMELINE SURVIVES A RESERVATION IT WAS NOT GIVEN IN FULL.
 *
 * The report view builds a stub `{ id } as Reservation` so the keyboard can step between
 * rows before the real record has loaded. `auditEvents` pushed a "Booked" entry from
 * `createdAt` regardless, which on a stub is `undefined`, and the relative-time formatter
 * throws `RangeError: Invalid time value` on that rather than returning null. There is no
 * error boundary around this panel, so the throw took out the entire console with
 * "Something went wrong!" the moment anybody clicked a row of the flight log.
 *
 * That matters more now than it did: the new "Awaiting sign-off" tile leads to exactly that
 * report, so the one follow-through the tile has was a crash.
 */
describe("auditEvents", () => {
  it("emits nothing for a stub carrying only an id", () => {
    expect(auditEvents({ id: 1 } as Reservation)).toEqual([]);
  });

  it("still emits the booking entry when there is a real timestamp", () => {
    const events = auditEvents({ id: 1, createdAt: "2026-08-28T15:00:00.000Z" } as Reservation);
    expect(events).toHaveLength(1);
    expect(events[0].label).toBe("Booked");
  });

  //Every entry it emits has to carry a timestamp, because the two things downstream of this
  //(an absolute date and a relative one) both throw on an invalid one.
  it("never emits an entry without a timestamp", () => {
    const events = auditEvents({
      id: 1,
      createdAt: "2026-08-28T15:00:00.000Z",
      review: { rampedOutAt: null, rampedInAt: undefined },
    } as unknown as Reservation);

    expect(events.every((e) => !!e.at)).toBe(true);
  });
});
