import { Box, DoorOpen, MonitorPlay, Plane, type LucideIcon } from "lucide-react";
import {
  resourceLabel,
  type OrganizationUser,
  type Reservation,
  type ReservationType,
  type Resource,
} from "@/types/api";
import { RESERVATION_TYPE_ORDER } from "@/lib/permissions";

/** The icon for a resource, by kind, aircraft get the plane, sims/rooms don't. */
export function resourceIcon(r: Resource): LucideIcon {
  switch (resourceLabel(r).kind) {
    case "Aircraft":
      return Plane;
    case "Simulator":
      return MonitorPlay;
    case "Room":
      return DoorOpen;
    default:
      return Box;
  }
}

/** Human labels for each reservation type. */
export const TYPE_LABEL: Record<ReservationType, string> = {
  dual: "Dual",
  instructor: "Instruction",
  solo: "Solo",
  shared: "Shared flight",
  ground: "Ground",
  sim: "Sim",
  rental: "Rental",
  guest: "Guest",
  maintenance: "Maintenance",
};

/**
 * Order used for the legend and the type Select. Re-exported from the
 * permissions module so the display order and the role→type matrix can never
 * drift apart.
 */
export const TYPE_ORDER = RESERVATION_TYPE_ORDER;

// Tailwind can only see class names that appear as complete literals, so every
// variant is written out in full below (never string-concatenated).

/** Solid swatch, legend dots, form select rows. */
export const DOT_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual",
  instructor: "bg-res-dual",
  solo: "bg-res-solo",
  shared: "bg-res-rental",
  ground: "bg-res-ground",
  sim: "bg-res-sim",
  rental: "bg-res-rental",
  guest: "bg-res-guest",
  maintenance: "bg-res-maintenance",
};

/**
 * Filled block used on the desktop lane grid + week chips.
 *
 * The hover step is spelled out per type rather than shared as one `hover:bg-current/…` on
 * the block itself. That shorter version generated no CSS in this build, so the class sat in
 * the DOM and did nothing, the sort of failure that only shows up if you go looking for the
 * rule. Written out, each tint is a literal Tailwind already emits for the base state.
 */
export const BLOCK_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual/12 border-res-dual/40 text-res-dual hover:bg-res-dual/22",
  instructor: "bg-res-dual/12 border-res-dual/40 text-res-dual hover:bg-res-dual/22",
  solo: "bg-res-solo/12 border-res-solo/40 text-res-solo hover:bg-res-solo/22",
  shared: "bg-res-rental/12 border-res-rental/40 text-res-rental hover:bg-res-rental/22",
  ground: "bg-res-ground/15 border-res-ground/45 text-res-ground hover:bg-res-ground/25",
  sim: "bg-res-sim/12 border-res-sim/40 text-res-sim hover:bg-res-sim/22",
  rental: "bg-res-rental/12 border-res-rental/40 text-res-rental hover:bg-res-rental/22",
  guest: "bg-res-guest/12 border-res-guest/40 text-res-guest hover:bg-res-guest/22",
  maintenance: "bg-res-maintenance/12 border-res-maintenance/40 text-res-maintenance hover:bg-res-maintenance/22",
};

/** Left accent border used by the mobile agenda rows. */
export const BORDER_L_CLASS: Record<ReservationType, string> = {
  dual: "border-l-res-dual",
  instructor: "border-l-res-dual",
  solo: "border-l-res-solo",
  shared: "border-l-res-rental",
  ground: "border-l-res-ground",
  sim: "border-l-res-sim",
  rental: "border-l-res-rental",
  guest: "border-l-res-guest",
  maintenance: "border-l-res-maintenance",
};

/** Tinted chip (soft fill + colored text) used by the month grid cells. */
export const CHIP_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual/15 text-res-dual hover:bg-res-dual/25",
  instructor: "bg-res-dual/15 text-res-dual hover:bg-res-dual/25",
  solo: "bg-res-solo/15 text-res-solo hover:bg-res-solo/25",
  shared: "bg-res-rental/15 text-res-rental hover:bg-res-rental/25",
  ground: "bg-res-ground/15 text-res-ground hover:bg-res-ground/25",
  sim: "bg-res-sim/15 text-res-sim hover:bg-res-sim/25",
  rental: "bg-res-rental/15 text-res-rental hover:bg-res-rental/25",
  guest: "bg-res-guest/15 text-res-guest hover:bg-res-guest/25",
  maintenance: "bg-res-maintenance/15 text-res-maintenance hover:bg-res-maintenance/25",
};

export function typeLabel(t: ReservationType): string {
  return TYPE_LABEL[t] ?? t;
}

/**
 * One person on a booking, with enough to open their record.
 *
 * `orgUserId` is null for a GUEST, who is a name captured on the reservation and not a
 * member of the school, so there is no `/people/:id` behind them. Anything rendering a
 * personnel row has to handle that: a guest is text, everyone else is a link.
 */
export type PersonnelEntry = {
  name: string;
  orgUserId: number | null;
  /** The seat on this booking ("Instructor"), not the person's roles in the school. */
  seat: string;
};

/** Everyone on a booking, in the order the detail surfaces read them out. */
export function personnelEntries(r: Reservation): PersonnelEntry[] {
  const p = r.personnel;
  const from = (list: OrganizationUser[] | undefined, seat: string): PersonnelEntry[] =>
    (list ?? []).flatMap((x) =>
      x.user?.name ? [{ name: x.user.name, orgUserId: x.id, seat }] : []
    );

  return [
    ...from(p?.instructors, "Instructor"),
    ...from(p?.students, "Student"),
    ...from(p?.renters, "Renter"),
    ...(p?.guests ?? []).flatMap((g) =>
      g.name ? [{ name: g.name, orgUserId: null, seat: "Guest" }] : []
    ),
  ];
}

/** Collapse a reservation's personnel + guests into display names. */
export function personnelNames(r: Reservation): string[] {
  return personnelEntries(r).map((e) => e.name);
}
