import type { OrganizationUser, RolesUpdate } from "@/types/api";

export type RoleKey = keyof RolesUpdate;

/** Role options for the full role editor, in display order (owner ⇒ admin). */
export const ROLE_OPTIONS: { key: RoleKey; label: string; hint?: string }[] = [
  { key: "owner", label: "Owner", hint: "Full control — implies Admin" },
  { key: "admin", label: "Admin", hint: "Manage members, aircraft & billing" },
  { key: "instructor", label: "Instructor", hint: "Teach and sign off flights" },
  { key: "student", label: "Student", hint: "Book training flights" },
  { key: "renter", label: "Renter", hint: "Rent aircraft solo" },
  { key: "dispatcher", label: "Dispatcher", hint: "Schedule the board" },
  { key: "technician", label: "Technician", hint: "Log maintenance & squawks" },
];

/** Roles that can be assigned at invite time (the API has no `owner` invite flag). */
export const INVITE_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => r.key !== "owner");

export function memberName(ou: OrganizationUser): string {
  return ou.user?.name?.trim() || `Member #${ou.id}`;
}

/** Build a full `RolesUpdate` payload from a membership's active role relations. */
export function rolesUpdateFrom(ou: OrganizationUser): RolesUpdate {
  return {
    owner: !!ou.ownerRole,
    admin: !!ou.adminRole,
    instructor: !!ou.instructorRole,
    student: !!ou.studentRole,
    renter: !!ou.renterRole,
    dispatcher: !!ou.dispatcherRole,
    technician: !!ou.technicianRole,
  };
}
