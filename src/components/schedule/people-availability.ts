import type { ComboOption } from "@/components/combobox";
import type { PendingInvitation, ReservationType } from "@/types/api";

/**
 * Who the organization can actually put on a booking, and what to say when it can't.
 *
 * Built after a founder's first booking failed on 2026-10-07: an aircraft owner alone in his
 * new organization switched to Solo, found an Instructor picker that said only "No
 * instructors.", saved, got a red field, and left. Three people hit that same refusal in two
 * weeks. The rules below are the server's own (`TYPE_REQUIREMENTS`), read against the roster
 * the form already loads, so a type that cannot be completed says why before anyone fills it in.
 */

export type PeopleSide = "instructors" | "students" | "renters";
export type SideCounts = Record<PeopleSide, number>;

const NOUN: Record<PeopleSide, { one: string; a: string; role: "instructor" | "student" | "renter" }> = {
  instructors: { one: "instructor", a: "an instructor", role: "instructor" },
  students: { one: "student", a: "a student", role: "student" },
  renters: { one: "renter", a: "a renter", role: "renter" },
};

export const sideNoun = (side: PeopleSide) => NOUN[side];

/** The role a person needs to sit on this side. */
export const sideRole = (side: PeopleSide) => NOUN[side].role;

/**
 * Why this type cannot be booked with the people the organization has, or null when it can.
 *
 * People only: a missing room or simulator is already said by the resource picker. Guest and
 * maintenance seat nobody from the roster, so they are never blocked here.
 */
export function typeUnavailableReason(type: ReservationType, n: SideCounts): string | null {
  switch (type) {
    case "dual": {
      if (n.instructors === 0 && n.students === 0) return "No instructor or student yet. Pick it to add them.";
      if (n.students === 0) return "No student yet. Pick it to add one.";
      if (n.instructors === 0) return "No instructor yet. Pick it to add one.";
      return null;
    }
    case "solo":
    case "ground":
    case "sim":
      return n.instructors + n.students === 0 ? "No instructor or student yet. Pick it to add one." : null;
    case "shared":
      return n.students + n.renters < 2 ? "Needs two pilots who are students or renters." : null;
    case "rental":
      return n.renters === 0 ? "No renter yet. Pick it to add one." : null;
    default:
      return null;
  }
}

/**
 * The desk's opening type: the first one in this order the organization can actually fill.
 * Teaching first when there is a student to teach, then a rental, then a solo, then a
 * guest flight, which needs nobody from the roster at all.
 */
export function deskTypeFor(allowed: ReservationType[], n: SideCounts): ReservationType | null {
  const order: ReservationType[] = ["dual", "rental", "solo", "guest", ...allowed];
  return order.find((t) => allowed.includes(t) && typeUnavailableReason(t, n) == null) ?? null;
}

/** Pending invitations that will land on this side once accepted. */
export function invitesForSide(invites: PendingInvitation[] | undefined, side: PeopleSide): PendingInvitation[] {
  const role = sideRole(side);
  return (invites ?? []).filter((inv) => inv.roles?.[role] === true);
}

export const inviteName = (inv: PendingInvitation) => inv.user?.name?.trim() || inv.email;

/**
 * Invited people as rows that cannot be picked: present so the person booking knows they
 * exist, disabled so nobody books someone the server cannot seat yet.
 */
export function inviteOptions(invites: PendingInvitation[]): ComboOption[] {
  return invites.map((inv) => ({
    value: `invite-${inv.id}`,
    label: inviteName(inv),
    // The heading already says they are invited; the hint is the address when a name leads.
    hint: inv.user?.name?.trim() ? inv.email : undefined,
    group: "Invited, hasn't joined yet",
    disabled: true,
  }));
}

/** What the open list says when nobody can be chosen on this side. */
export function emptySideText(side: PeopleSide): string {
  return `Nobody in your organization is ${NOUN[side].a} yet.`;
}
