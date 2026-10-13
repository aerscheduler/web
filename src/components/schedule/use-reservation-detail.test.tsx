// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Reservation } from "@/types/api";
import { closeOutStep } from "./close-out";

/**
 * The reports page lists bookings as bare `{ id }` stubs. The panel must never treat a stub
 * as a booking: with no `review` it read as "not flown yet" and offered Ramp out on a flight
 * that had already landed (NexwingAero, 2026-10-12), which stranded the aircraft as out.
 */

const full = vi.hoisted(() => ({ data: undefined as Reservation | undefined }));
vi.mock("@/features/queries", () => ({ useReservation: () => ({ data: full.data }) }));
vi.mock("./use-reservation-actions", () => ({ useReservationActions: () => ({}) }));

const { useReservationDetail } = await import("./use-reservation-detail");

const flown = {
  id: 7,
  start: "2026-10-12T19:15:00.000Z",
  end: "2026-10-12T20:15:00.000Z",
  type: "solo",
  personnel: { students: [{ id: 3 }], instructors: [], renters: [], guests: [] },
  resource: { id: 1, type: { plane: { meterMode: "hobbs_and_tach", hobbsTime: 2159, tachTime: 2159 } } },
  review: { hobbsTimeOut: 2145, tachTimeOut: 2145, hobbsTimeIn: 2159, tachTimeIn: 2159, confirmations: [] },
  invoices: [],
  payers: [],
} as unknown as Reservation;

describe("useReservationDetail with stub rows (reports page)", () => {
  it("shows nothing until the full booking arrives, never a stub", () => {
    full.data = undefined;
    const { result } = renderHook(() =>
      useReservationDetail([{ id: 7 } as Reservation], { selectedId: 7, setSelectedId: () => {} })
    );
    expect(result.current.detail).toBeNull();
  });

  it("uses the full booking once loaded, so a flown flight is not offered Ramp out", () => {
    full.data = flown;
    const { result } = renderHook(() =>
      useReservationDetail([{ id: 7 } as Reservation], { selectedId: 7, setSelectedId: () => {} })
    );
    expect(result.current.detail?.review).toBeTruthy();
    expect(closeOutStep(result.current.detail!)).not.toBe("rampOut");
  });

  it("still overlays the detail onto a real list row (the board's behaviour)", () => {
    full.data = { ...flown, paymentOverrides: null } as Reservation;
    const row = { ...flown, resource: null } as unknown as Reservation;
    const { result } = renderHook(() =>
      useReservationDetail([row], { selectedId: 7, setSelectedId: () => {} })
    );
    expect(result.current.detail?.resource).toEqual(flown.resource);
  });
});
