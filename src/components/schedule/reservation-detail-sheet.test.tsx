// @vitest-environment jsdom
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Reservation } from "@/types/api";

/**
 * The detail panel must REPLACE its body when you pick another booking, not re-render it.
 *
 * Everything inside holds typed state seeded from the reservation: hours in the close-out,
 * a grade and lesson notes in the training record. React keeps a component's state across a
 * prop change, so without a key on the body, opening a booking, typing a grade, and clicking
 * the next row in the list left the previous student's grade and notes sitting in the form
 * under someone else's name, ready to submit.
 *
 * The sections themselves are stubbed here: what is under test is the panel's identity
 * contract, not what those sections draw. `Probe` stands in for any of them, and counts
 * mounts so a re-render and a remount can be told apart, which is the whole distinction.
 */

let mounts = 0;

function Probe({ reservation }: { reservation: Reservation }) {
  //Mirrors the real sections: state seeded ONCE from the booking, then owned by the form.
  const [typed] = React.useState(() => `draft for ${reservation.id}`);
  React.useEffect(() => {
    mounts += 1;
  }, []);
  return <div data-testid="probe">{typed}</div>;
}

vi.mock("./close-out-section", () => ({
  CloseOutSection: ({ reservation }: { reservation: Reservation }) => (
    <Probe reservation={reservation} />
  ),
}));
vi.mock("./reservation-audit", () => ({ ReservationAudit: () => null }));
vi.mock("@/components/slot-offers/reservation-standby", () => ({
  ReservationStandby: () => null,
}));
vi.mock("@/components/weather-badge", () => ({ WeatherBadge: () => null }));

//The dock is a portal behind a media query; here it is just a wrapper, so the test is
//about the body's identity rather than about where the body is mounted.
vi.mock("@/components/detail-panel", () => ({
  DetailPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

//The panel links out to the record page, the aircraft and the people on the booking. The
//router isn't mounted here, so `Link` is a plain anchor: what is under test is the body's
//identity, not routing.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params: _params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params?: unknown;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ roles: ["admin"], orgUserId: 1 }),
}));
vi.mock("@/lib/use-timezone", () => ({
  useTimeZone: () => ({
    time: () => "9:00 AM",
    date: () => "Tue, Aug 16",
    spansDays: () => false,
    differs: () => false,
    label: () => "MDT",
    viewerZone: "America/Denver",
  }),
}));
vi.mock("./close-out", () => ({
  canCancelReservation: () => false,
  canEditReservation: () => false,
}));

const { ReservationDetailSheet } = await import("./reservation-detail-sheet");

const booking = (id: number): Reservation =>
  ({
    id,
    title: `Booking ${id}`,
    type: "dual",
    start: "2026-08-16T15:00:00.000Z",
    end: "2026-08-16T17:00:00.000Z",
    personnel: { instructors: [], students: [] },
  }) as unknown as Reservation;

afterEach(() => {
  mounts = 0;
});

describe("picking another booking", () => {
  it("replaces the body rather than re-rendering it with new props", () => {
    const { rerender } = render(
      <ReservationDetailSheet
        reservation={booking(101)}
        open
        onOpenChange={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("probe").textContent).toBe("draft for 101");
    expect(mounts).toBe(1);

    rerender(
      <ReservationDetailSheet
        reservation={booking(202)}
        open
        onOpenChange={() => {}}
        onCancel={() => {}}
      />,
    );

    // Before the key, this still read "draft for 101": the seeded state survived,
    // so the previous booking's typed hours and grade were offered against this one.
    expect(screen.getByTestId("probe").textContent).toBe("draft for 202");
    expect(mounts).toBe(2);
  });

  it("keeps the body alive while the same booking re-renders", () => {
    const same = booking(101);
    const { rerender } = render(
      <ReservationDetailSheet
        reservation={same}
        open
        onOpenChange={() => {}}
        onCancel={() => {}}
      />,
    );
    // A fresh object for the same booking, which is what a refetch hands us. Remounting
    // here would wipe half-typed hours every time the list polls.
    rerender(
      <ReservationDetailSheet
        reservation={booking(101)}
        open
        onOpenChange={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(mounts).toBe(1);
  });
});
