import { test, expect } from "@playwright/test";
import type { AccountRole } from "../helpers/env";

/**
 * Mirrors web/src/lib/permissions.ts ROUTE_ACCESS for the 7 test roles.
 * Keep in sync when adding top-level routes.
 */
type Role =
  | "owner"
  | "admin"
  | "dispatcher"
  | "instructor"
  | "student"
  | "renter"
  | "technician";

const isOwner = (r: Role[]) => r.includes("owner");
const isAdmin = (r: Role[]) => r.includes("admin") || isOwner(r);
const isDispatcher = (r: Role[]) => r.includes("dispatcher");
const isInstructor = (r: Role[]) => r.includes("instructor");
const isTechnician = (r: Role[]) => r.includes("technician");
const isStaff = (r: Role[]) => isAdmin(r) || isDispatcher(r);
const anyMember = (_r: Role[]) => true;

const ROUTE_ACCESS: Record<string, (roles: Role[]) => boolean> = {
  "/dashboard": isStaff,
  "/schedule": anyMember,
  "/people": anyMember,
  "/aircraft": anyMember,
  "/facilities": isAdmin,
  "/billing": isAdmin,
  "/reports": (r) => isStaff(r) || isTechnician(r),
  "/operations/cancellations": isStaff,
  "/compliance": isStaff,
  "/training": (r) => isStaff(r) || isInstructor(r),
  // Note: bare /training/enrollments is NOT a real index route. TanStack matches
  // /training/$courseId with courseId="enrollments" and applies the /training guard.
  // Enrollment detail (/training/enrollments/:id) is anyMember; covered indirectly.
  "/maintenance": (r) => isStaff(r) || isTechnician(r),
  "/audit-logs": isAdmin,
  "/settings": isAdmin,
};

/** Session roles for each seeded AERTEST01 account. */
const ROLE_ROLES: Record<AccountRole, Role[]> = {
  owner: ["owner"],
  admin: ["admin"],
  dispatcher: ["dispatcher"],
  instructor: ["instructor"],
  student: ["student"],
  renter: ["renter"],
  technician: ["technician"],
};

const ROUTES = Object.keys(ROUTE_ACCESS);

for (const role of Object.keys(ROLE_ROLES) as AccountRole[]) {
  test.describe(`Route access (${role})`, () => {
    test.use({ storageState: `.auth/${role}.json` });

    for (const route of ROUTES) {
      const allowed = ROUTE_ACCESS[route]!(ROLE_ROLES[role]);
      test(`${role} ${allowed ? "can" : "cannot"} open ${route}`, async ({
        page,
      }) => {
        await page.goto(route);
        if (allowed) {
          await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
          // Allowed routes must stay on (or under) the requested path, not bounce to /me.
          await expect(page).toHaveURL(
            new RegExp(`${route.replace(/\//g, "\\/")}(/|$|\\?)`),
            { timeout: 15_000 },
          );
        } else {
          // guardRoute redirects denied users to /me.
          await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
        }
      });
    }
  });
}
