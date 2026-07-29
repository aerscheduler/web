import { redirect } from "@tanstack/react-router";
import type { ReservationType, Role } from "@/types/api";
import { hasActiveOrg, rolesFromSession } from "./auth";

/**
 * Single source of truth for who can see/do what, mirroring the SERVER's real
 * guards (the server is authoritative; this keeps the UI honest and consistent).
 *
 * Role model (server: 7 independent, non-hierarchical relations):
 *   owner ⊃ admin (enforced invariant) — dispatcher, instructor, student,
 *   renter, technician are separate. `isOrgAdmin` on the server = adminRole
 *   (owner passes via the invariant); it is NOT dispatcher.
 *
 * Predicates that need a specific *reservation* to answer (can I cancel this
 * flight? ramp it out? edit it?) live in `components/schedule/close-out.ts`,
 * since they turn on who is assigned to that reservation rather than on roles
 * alone. This module owns everything answerable from roles.
 */
export const isOwner = (r: Role[]) => r.includes("owner");
export const isAdmin = (r: Role[]) => r.includes("admin") || isOwner(r);
export const isDispatcher = (r: Role[]) => r.includes("dispatcher");
export const isInstructor = (r: Role[]) => r.includes("instructor");
export const isStudent = (r: Role[]) => r.includes("student");
export const isRenter = (r: Role[]) => r.includes("renter");
export const isTechnician = (r: Role[]) => r.includes("technician");
/** owner | admin | dispatcher — the "runs the operation" set. */
export const isStaff = (r: Role[]) => isAdmin(r) || isDispatcher(r);

const anyMember = (_r: Role[]) => true;

/**
 * Which roles may ACCESS each top-level route. View-only-mirror model:
 * members may VIEW the org schedule / people / aircraft (the server serves
 * those to any member); billing, reports, facilities, and settings are
 * admin-only; the dashboard/compliance are staff; maintenance is staff or
 * technician. Actions within these pages are gated separately (see the `can*`
 * helpers) — visibility ≠ permission to mutate.
 */
export const ROUTE_ACCESS: Record<string, (roles: Role[]) => boolean> = {
  "/dashboard": isStaff,
  "/schedule": anyMember,
  "/people": anyMember,
  "/aircraft": anyMember,
  "/facilities": isAdmin,
  "/billing": isAdmin,
  "/reports": isAdmin,
  "/operations/cancellations": isStaff,
  "/compliance": isStaff,
  "/maintenance": (r) => isStaff(r) || isTechnician(r),
  "/settings": isAdmin,
};

/** Can these roles reach `path`? Unlisted paths (e.g. /me/*, /notifications) are open. */
export function canAccess(path: string, roles: Role[]): boolean {
  const exact = ROUTE_ACCESS[path];
  if (exact) return exact(roles);
  // Nested pages inherit the nearest registered parent (e.g. /settings/integrations/…).
  const parent = Object.keys(ROUTE_ACCESS)
    .filter((k) => path.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (parent) return ROUTE_ACCESS[parent]!(roles);
  return true;
}

/**
 * TanStack Router `beforeLoad` guard for a staff/admin route. Redirects a
 * member who lacks access to their own home instead of letting them load a
 * page that will only 403 (or leak partial data). Auth itself is handled by
 * the `_authed` parent route.
 */
export function guardRoute(path: string) {
  return () => {
    // Only enforce once we know the caller's org/roles; the onboarding flow
    // handles the no-active-org case.
    if (hasActiveOrg() && !canAccess(path, rolesFromSession())) {
      throw redirect({ to: "/me" });
    }
  };
}

// ── Action capabilities (mirror the server's per-action guards) ──────────────
/** Manage members: roles, invites, ground/remove, join requests. Server: admin. */
export const canManageMembers = isAdmin;
/** Create/edit/ground/approve aircraft & facilities. Server: admin. */
export const canManageResources = isAdmin;
/** Create/void/mark-paid invoices; view the billing console. Server: admin. */
export const canManageBilling = isAdmin;
/** Billing settings + Stripe connect. Server: owner. */
export const canManageBillingSettings = isOwner;
/** Org profile / logo / ratings. Server: admin. */
export const canManageOrg = isAdmin;

/** Open squawks are admin/dispatcher/technician-only on the server. */
export const canViewSquawks = (r: Role[]) => isStaff(r) || isTechnician(r);

// ── Reservation types by role ────────────────────────────────────────────────
/**
 * Display order for reservation types. Also the canonical list of types the
 * server will actually accept — "instructor" is deliberately absent because the
 * server's type union has no such case (offering it would always 400).
 */
export const RESERVATION_TYPE_ORDER: ReservationType[] = [
  "dual",
  "solo",
  "rental",
  "guest",
  "ground",
  "sim",
  "maintenance",
];

const STAFF_TYPES: ReservationType[] = [
  "solo",
  "dual",
  "ground",
  "guest",
  "sim",
  "rental",
  "maintenance",
];

/**
 * Which reservation types each role may CREATE. Mirrors the Flutter app's own
 * matrix (`create_reservation_bottom_sheet.dart` `getButtons()`) and the
 * server's role gate, so all three agree.
 *
 * Roles are additive: a student who is also a renter may book everything a
 * student can *plus* rentals.
 */
const TYPES_BY_ROLE: Record<Role, ReservationType[]> = {
  owner: STAFF_TYPES,
  admin: STAFF_TYPES,
  dispatcher: STAFF_TYPES,
  instructor: ["solo", "dual", "ground", "guest", "sim"],
  student: ["solo", "dual", "ground", "sim"],
  renter: ["rental"],
  technician: ["maintenance"],
};

/** The union of reservation types these roles may create, in display order. */
export function reservationTypesForRoles(roles: Role[]): ReservationType[] {
  const allowed = new Set<ReservationType>();
  for (const role of roles) {
    for (const type of TYPES_BY_ROLE[role] ?? []) allowed.add(type);
  }
  return RESERVATION_TYPE_ORDER.filter((t) => allowed.has(t));
}

/** May these roles create this specific type? */
export const canCreateReservationType = (roles: Role[], type: ReservationType) =>
  reservationTypesForRoles(roles).includes(type);

/**
 * Which type a booking form should preselect. Mirrors Flutter's
 * `setDefaultReservationType()` precedence — importantly, a renter+student
 * defaults to a rental, not a solo.
 */
export function defaultReservationType(roles: Role[]): ReservationType | null {
  const allowed = reservationTypesForRoles(roles);
  if (allowed.length === 0) return null;
  if (isStaff(roles)) return "solo";
  if (isRenter(roles)) return "rental";
  if (isTechnician(roles)) return "maintenance";
  return allowed.includes("solo") ? "solo" : allowed[0];
}

/**
 * Roles that put a person *on* a reservation rather than merely letting them
 * dispatch one. Staff grants (owner/admin/dispatcher) are deliberately excluded:
 * a dispatcher books other people from the board, and shouldn't be seated on a
 * flight as their own student.
 */
const SELF_BOOKABLE: Role[] = ["instructor", "student", "renter", "technician"];

/**
 * Can self-book from /me/book. Technicians count: their "booking" is taking an
 * aircraft off the line for maintenance.
 */
export const canSelfBook = (r: Role[]) => r.some((role) => SELF_BOOKABLE.includes(role));

/**
 * Types offered on the SELF-serve page — derived only from the roles that seat
 * you on a flight. An admin+instructor self-books as an instructor; their admin
 * grant belongs to the dispatch board, not to /me/book.
 */
export const selfBookableTypes = (r: Role[]) =>
  reservationTypesForRoles(r.filter((role) => SELF_BOOKABLE.includes(role)));

/**
 * What the self-serve booking call-to-action should say. A technician isn't
 * booking a flight — they're pulling an aircraft off the line.
 */
export function bookActionLabel(r: Role[]): string {
  const types = selfBookableTypes(r);
  return types.length === 1 && types[0] === "maintenance"
    ? "Schedule maintenance"
    : "Book a flight";
}
/**
 * Anyone who can create a reservation in *some* form — staff create any type on
 * the dispatch board; everyone else self-books their own role's types. Drives
 * the global "+" quick-create button (the menu item differs by role: staff get
 * the full "New reservation" modal, others get "Book a flight").
 */
export const canCreateReservation = (r: Role[]) => reservationTypesForRoles(r).length > 0;

// ── Which resource lanes a role sees on the dispatch board ───────────────────
// Mirrors the Flutter calendar's `canSee*` getters (`calendar_controller.dart`):
// a technician's board is planes-only, a renter's is planes-only on the web
// (Flutter also gives renters a renter *person* lane, which the web board has
// no equivalent of — it groups strictly by resource).
/** Rooms are an instruction resource — hidden from renters and technicians. */
export const canSeeRoomLanes = (r: Role[]) => isStaff(r) || isInstructor(r) || isStudent(r);
/** Simulators likewise. */
export const canSeeSimulatorLanes = (r: Role[]) => isStaff(r) || isInstructor(r) || isStudent(r);
