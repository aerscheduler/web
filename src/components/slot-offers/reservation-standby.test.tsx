// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Reservation } from "@/types/api";
import { ReservationStandby } from "./reservation-standby";

/**
 * Standby is a queue for a seat you do not have.
 *
 * The renter who booked the flight was being offered "Stand by for this booking" on
 * their own booking, which reads as though the console does not know they are on it,
 * and taking it would queue them behind themselves. The app already suppressed this
 * (`Reservation.includesOrgUser`); the console did not, and neither did the API.
 */

const VIEWER = 42;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ roles: ["renter"], organization: {}, orgUserId: VIEWER }),
}));
vi.mock("@/lib/slot-offers-enabled", () => ({ orgSlotOffersEnabled: () => true }));
vi.mock("@/features/queries", () => ({
  useOrgUserPreferences: () => ({
    isPending: false,
    data: {
      notificationPreferences: {
        emailEnabled: true,
        emailNotificationPreferences: { slotOffers: true },
      },
    },
  }),
}));

const myInterests: unknown[] = [];
vi.mock("@/features/slot-offers", () => ({
  useMyStandbyInterest: () => ({ isPending: false, data: myInterests }),
  useReservationStandby: () => ({ isPending: false, data: [] }),
  useCreateStandbyInterest: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useWithdrawStandbyInterest: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateSlotOffer: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

function booking(personnel: Reservation["personnel"]): Reservation {
  return {
    id: 7,
    title: "N12345",
    type: "rental",
    start: new Date(Date.now() + 3_600_000).toISOString(),
    end: new Date(Date.now() + 7_200_000).toISOString(),
    cancelledAt: null,
    personnel,
  } as unknown as Reservation;
}

describe("ReservationStandby", () => {
  it("offers standby on someone else's booking", () => {
    const view = render(
      <ReservationStandby
        reservation={booking({ id: 1, renters: [{ id: 99 }] } as Reservation["personnel"])}
      />
    );
    expect(within(view.container).queryByText(/Stand by for this booking/i)).toBeTruthy();
    view.unmount();
  });

  it("does not offer standby on the viewer's own booking", () => {
    for (const personnel of [
      { id: 1, renters: [{ id: VIEWER }] },
      { id: 1, students: [{ id: VIEWER }] },
      { id: 1, instructors: [{ id: VIEWER }] },
    ]) {
      const view = render(
        <ReservationStandby reservation={booking(personnel as Reservation["personnel"])} />
      );
      expect(within(view.container).queryByText(/Stand by for this booking/i)).toBeNull();
      view.unmount();
    }
  });
});
