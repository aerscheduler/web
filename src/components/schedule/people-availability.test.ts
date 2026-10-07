import { describe, expect, it } from "vitest";
import type { PendingInvitation, ReservationType } from "@/types/api";
import { deskTypeFor, inviteOptions, invitesForSide, typeUnavailableReason } from "./people-availability";

const DESK: ReservationType[] = ["solo", "dual", "shared", "ground", "guest", "sim", "rental", "maintenance"];
const counts = (instructors: number, students: number, renters: number) => ({ instructors, students, renters });

describe("typeUnavailableReason", () => {
  it("says why a lone founder cannot book a dual or a rental", () => {
    const alone = counts(1, 0, 0);
    expect(typeUnavailableReason("dual", alone)).toMatch(/No student/);
    expect(typeUnavailableReason("rental", alone)).toMatch(/No renter/);
    expect(typeUnavailableReason("solo", alone)).toBeNull();
  });

  it("never blocks types that seat nobody from the roster", () => {
    expect(typeUnavailableReason("guest", counts(0, 0, 0))).toBeNull();
    expect(typeUnavailableReason("maintenance", counts(0, 0, 0))).toBeNull();
  });

  it("needs two pilots for a shared flight", () => {
    expect(typeUnavailableReason("shared", counts(0, 1, 0))).not.toBeNull();
    expect(typeUnavailableReason("shared", counts(0, 1, 1))).toBeNull();
  });
});

describe("deskTypeFor", () => {
  it("opens a lone instructor-founder on solo, not an empty rental", () => {
    expect(deskTypeFor(DESK, counts(1, 0, 0))).toBe("solo");
  });
  it("opens an owner who rents their own aircraft on rental", () => {
    expect(deskTypeFor(DESK, counts(0, 0, 1))).toBe("rental");
  });
  it("teaches when there is a student and an instructor", () => {
    expect(deskTypeFor(DESK, counts(1, 1, 0))).toBe("dual");
  });
  it("falls back to a guest flight when nobody can be seated", () => {
    expect(deskTypeFor(DESK, counts(0, 0, 0))).toBe("guest");
  });
});

describe("pending invitations", () => {
  const invites: PendingInvitation[] = [
    { id: 1, createdAt: "2026-10-07", email: "a@example.com", roles: { student: true } },
    { id: 2, createdAt: "2026-10-07", email: "b@example.com", roles: { renter: true } },
    { id: 3, createdAt: "2026-10-07", email: "c@example.com", user: { id: 9, name: "Cal" }, roles: { student: true } },
  ];

  it("lands each invite on the side its roles will put it", () => {
    expect(invitesForSide(invites, "students").map((i) => i.id)).toEqual([1, 3]);
    expect(invitesForSide(invites, "renters").map((i) => i.id)).toEqual([2]);
    expect(invitesForSide(invites, "instructors")).toEqual([]);
  });

  it("shows them as rows that cannot be picked", () => {
    const rows = inviteOptions(invitesForSide(invites, "students"));
    expect(rows.every((r) => r.disabled)).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(["a@example.com", "Cal"]);
    expect(rows[1].hint).toBe("c@example.com");
  });
});
