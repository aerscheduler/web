import type { Reservation, ReservationType } from "@/types/api";

/** Human labels for each reservation type. */
export const TYPE_LABEL: Record<ReservationType, string> = {
  dual: "Dual",
  instructor: "Instruction",
  solo: "Solo",
  ground: "Ground",
  sim: "Sim",
  rental: "Rental",
  guest: "Guest",
  maintenance: "Maintenance",
};

/** Order used for the legend and the type Select. */
export const TYPE_ORDER: ReservationType[] = [
  "dual",
  "solo",
  "instructor",
  "rental",
  "guest",
  "ground",
  "sim",
  "maintenance",
];

// Tailwind can only see class names that appear as complete literals, so every
// variant is written out in full below (never string-concatenated).

/** Solid swatch — legend dots, form select rows. */
export const DOT_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual",
  instructor: "bg-res-dual",
  solo: "bg-res-solo",
  ground: "bg-res-ground",
  sim: "bg-res-sim",
  rental: "bg-res-rental",
  guest: "bg-res-guest",
  maintenance: "bg-res-maintenance",
};

/** Filled block used on the desktop lane grid + week chips. */
export const BLOCK_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual/12 border-res-dual/40 text-res-dual",
  instructor: "bg-res-dual/12 border-res-dual/40 text-res-dual",
  solo: "bg-res-solo/12 border-res-solo/40 text-res-solo",
  ground: "bg-res-ground/15 border-res-ground/45 text-res-ground",
  sim: "bg-res-sim/12 border-res-sim/40 text-res-sim",
  rental: "bg-res-rental/12 border-res-rental/40 text-res-rental",
  guest: "bg-res-guest/12 border-res-guest/40 text-res-guest",
  maintenance: "bg-res-maintenance/12 border-res-maintenance/40 text-res-maintenance",
};

/** Left accent border used by the mobile agenda rows. */
export const BORDER_L_CLASS: Record<ReservationType, string> = {
  dual: "border-l-res-dual",
  instructor: "border-l-res-dual",
  solo: "border-l-res-solo",
  ground: "border-l-res-ground",
  sim: "border-l-res-sim",
  rental: "border-l-res-rental",
  guest: "border-l-res-guest",
  maintenance: "border-l-res-maintenance",
};

/** Tinted chip (soft fill + colored text) used by the month grid cells. */
export const CHIP_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual/15 text-res-dual",
  instructor: "bg-res-dual/15 text-res-dual",
  solo: "bg-res-solo/15 text-res-solo",
  ground: "bg-res-ground/15 text-res-ground",
  sim: "bg-res-sim/15 text-res-sim",
  rental: "bg-res-rental/15 text-res-rental",
  guest: "bg-res-guest/15 text-res-guest",
  maintenance: "bg-res-maintenance/15 text-res-maintenance",
};

export function typeLabel(t: ReservationType): string {
  return TYPE_LABEL[t] ?? t;
}

/** Collapse a reservation's personnel + guests into display names. */
export function personnelNames(r: Reservation): string[] {
  const p = r.personnel;
  return [
    ...(p?.instructors ?? []).map((x) => x.user?.name),
    ...(p?.students ?? []).map((x) => x.user?.name),
    ...(p?.renters ?? []).map((x) => x.user?.name),
    ...(p?.guests ?? []).map((g) => g.name),
  ].filter((n): n is string => Boolean(n));
}
