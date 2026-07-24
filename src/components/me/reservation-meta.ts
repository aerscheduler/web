import type { Reservation, ReservationType } from "@/types/api";

// Tailwind only sees class names written as complete literals, so every
// reservation-type variant is spelled out in full below (never concatenated).

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

/** Left accent border, tinted by the reservation hue token. */
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

/** Filled badge, tinted by the reservation hue token. */
export const TYPE_BADGE_CLASS: Record<ReservationType, string> = {
  dual: "bg-res-dual/12 border-res-dual/40 text-res-dual",
  instructor: "bg-res-dual/12 border-res-dual/40 text-res-dual",
  solo: "bg-res-solo/12 border-res-solo/40 text-res-solo",
  ground: "bg-res-ground/15 border-res-ground/45 text-res-ground",
  sim: "bg-res-sim/12 border-res-sim/40 text-res-sim",
  rental: "bg-res-rental/12 border-res-rental/40 text-res-rental",
  guest: "bg-res-guest/12 border-res-guest/40 text-res-guest",
  maintenance: "bg-res-maintenance/12 border-res-maintenance/40 text-res-maintenance",
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

/** A short "Alice, Bob +2" style personnel summary, or null when empty. */
export function personnelSummary(r: Reservation, max = 2): string | null {
  const names = personnelNames(r);
  if (names.length === 0) return null;
  const head = names.slice(0, max).join(", ");
  const extra = names.length - max;
  return extra > 0 ? `${head} +${extra}` : head;
}
