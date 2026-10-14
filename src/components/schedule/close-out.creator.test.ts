import { describe, expect, it } from "vitest";
import type { Reservation, Role } from "@/types/api";
import { canRampReservation } from "./close-out";

/**
 * WHOEVER BOOKED IT CAN RAMP IT.
 *
 * The console used to allow only staff and assigned personnel, on the belief that the
 * response strip hid `createdBy`. It does not: the strip removes `FK_*` scalars, and
 * `createdBy` is a nested relation the server sends on every reservation read.
 *
 * The cost of that belief was maintenance. That type carries NO personnel by design, and a
 * technician is not staff, so the person who books an aircraft off the line could not ramp
 * it out or back in, while the server (`orgUserCanRampOut`, which checks the creator first)
 * would have accepted it. Reported from the field.
 */
function maintenanceBookedBy(orgUserId: number): Reservation {
  return {
    id: 1,
    type: "maintenance",
    cancelledAt: null,
    createdBy: { id: orgUserId },
    personnel: { instructors: [], students: [], renters: [] },
    resource: { id: 1, type: { plane: { id: 1, tailNumber: "N182TS" } } },
  } as unknown as Reservation;
}

const TECHNICIAN: Role[] = ["technician"];
const ADMIN: Role[] = ["admin"];

describe("canRampReservation", () => {
  it("lets the technician who booked the maintenance ramp it", () => {
    expect(canRampReservation(maintenanceBookedBy(7), TECHNICIAN, 7)).toBe(true);
  });

  it("does not let an unrelated technician ramp somebody else's maintenance", () => {
    expect(canRampReservation(maintenanceBookedBy(7), TECHNICIAN, 99)).toBe(false);
  });

  it("still lets staff ramp a booking they had nothing to do with", () => {
    expect(canRampReservation(maintenanceBookedBy(7), ADMIN, 99)).toBe(true);
  });

  it("refuses a cancelled booking even to its creator", () => {
    const r = { ...maintenanceBookedBy(7), cancelledAt: "2026-08-18T00:00:00.000Z" } as Reservation;
    expect(canRampReservation(r, TECHNICIAN, 7)).toBe(false);
  });
});

/**
 * "Ramp any flight out and in" (`dispatchAnyFlight`): a member given it ramps bookings they
 * are not on, as the server allows since 2026-10-14. NexwingAero's CFIs could not.
 */
describe("the ramp grant", () => {
  const INSTRUCTOR = ["instructor"] as Role[];
  const renterBooking = { id: 1, personnel: { renters: [{ id: 7 }] }, createdBy: { id: 5 } } as unknown as Reservation;

  it("an instructor not on the booking cannot ramp it without the grant", () => {
    expect(canRampReservation(renterBooking, INSTRUCTOR, 99)).toBe(false);
    expect(canRampReservation(renterBooking, INSTRUCTOR, 99, new Set())).toBe(false);
  });

  it("can with it", () => {
    expect(canRampReservation(renterBooking, INSTRUCTOR, 99, new Set(["dispatchAnyFlight"]))).toBe(true);
  });

  it("still never ramps a cancelled booking", () => {
    const cancelled = { ...renterBooking, cancelledAt: "2026-10-14T00:00:00Z" } as unknown as Reservation;
    expect(canRampReservation(cancelled, INSTRUCTOR, 99, new Set(["dispatchAnyFlight"]))).toBe(false);
  });
});
