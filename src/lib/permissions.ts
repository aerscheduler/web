import { redirect } from "@tanstack/react-router";
import type { Role } from "@/types/api";
import { hasActiveOrg, rolesFromSession } from "./auth";

/**
 * Single source of truth for who can see/do what, mirroring the SERVER's real
 * guards (the server is authoritative; this keeps the UI honest and consistent).
 *
 * Role model (server: 7 independent, non-hierarchical relations):
 *   owner ⊃ admin (enforced invariant) — dispatcher, instructor, student,
 *   renter, technician are separate. `isOrgAdmin` on the server = adminRole
 *   (owner passes via the invariant); it is NOT dispatcher.
 */
export const isOwner = (r: Role[]) => r.includes("owner");
export const isAdmin = (r: Role[]) => r.includes("admin") || isOwner(r);
export const isDispatcher = (r: Role[]) => r.includes("dispatcher");
export const isInstructor = (r: Role[]) => r.includes("instructor");
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
  "/compliance": isStaff,
  "/maintenance": (r) => isStaff(r) || isTechnician(r),
  "/settings": isAdmin,
};

/** Can these roles reach `path`? Unlisted paths (e.g. /me/*, /notifications) are open. */
export function canAccess(path: string, roles: Role[]): boolean {
  const check = ROUTE_ACCESS[path];
  return check ? check(roles) : true;
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
