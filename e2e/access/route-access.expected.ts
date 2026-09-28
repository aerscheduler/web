/**
 * What each of the seven seeded AERTEST01 accounts may open in the console.
 *
 * THIS USED TO LIVE INSIDE `route-matrix.spec.ts` AS A HAND-COPIED MIRROR of
 * `web/src/lib/permissions.ts`, and it drifted, which is the whole reason it is a file of
 * its own now. When the training grants landed, `/training` moved from "staff or
 * instructor" to "admin or instructor, widened by a grant"; the server, the console and
 * the phone all moved together and this table did not, so the suite spent weeks failing on
 * a rule that had been deliberately changed.
 *
 * It is here, importing nothing, so that TWO callers can read it:
 *
 *   1. `route-matrix.spec.ts`, which drives a real browser as each role.
 *   2. `src/lib/route-matrix-agrees.test.ts`, a unit test that asks the REAL `canAccess`
 *      the same questions and fails in about a second when the two disagree.
 *
 * Playwright runs this file through its own transform, with no Vite and no `@/` aliases,
 * so it must stay dependency-free. That is why the role predicates below are spelled out
 * again rather than imported: the unit test is what keeps them honest, not an import.
 */

export type MatrixRole = "owner" | "admin" | "dispatcher" | "instructor" | "student" | "renter" | "technician";

const isOwner = (r: MatrixRole[]) => r.includes("owner");
const isAdmin = (r: MatrixRole[]) => r.includes("admin") || isOwner(r);
const isDispatcher = (r: MatrixRole[]) => r.includes("dispatcher");
const isInstructor = (r: MatrixRole[]) => r.includes("instructor");
const isTechnician = (r: MatrixRole[]) => r.includes("technician");
const isStaff = (r: MatrixRole[]) => isAdmin(r) || isDispatcher(r);
const anyMember = (_r: MatrixRole[]) => true;

/** Session roles for each seeded AERTEST01 account. One role each, on purpose. */
export const ROLE_ROLES: Record<MatrixRole, MatrixRole[]> = {
  owner: ["owner"],
  admin: ["admin"],
  dispatcher: ["dispatcher"],
  instructor: ["instructor"],
  student: ["student"],
  renter: ["renter"],
  technician: ["technician"],
};

/**
 * The routes this suite actually opens in a browser.
 *
 * NONE of the seeded accounts hold a training grant (`seed-test-accounts.sql` seeds no
 * `grant` rows at all), so every answer here is the ROLE answer, which is what
 * `canAccess` falls back to when a session carries no grants.
 */
export const EXPECTED: Record<string, (roles: MatrixRole[]) => boolean> = {
  "/dashboard": isStaff,
  "/schedule": anyMember,
  "/people": anyMember,
  "/aircraft": anyMember,
  "/facilities": isAdmin,
  "/billing": isAdmin,
  "/reports": (r) => isStaff(r) || isTechnician(r),
  "/operations/cancellations": isStaff,
  "/compliance": isStaff,
  // ADMIN, not staff, and this is the row that drifted. A dispatcher with no training
  // grant cannot enrol or grade, so the page was a dead end for them; the phone's
  // `canSeeTrainingNav` says the same thing in the same words ("Dispatcher and technician
  // are out on purpose"), and the server is `hasTrainingGrant("configureTraining")` with
  // an admin bypass. `e2e/training/journeys.spec.ts` has asserted the bounce all along,
  // from the other side, which is how this table came to be the only place still saying
  // staff. A grant WIDENS it for an auditor, a chief instructor or anyone handed
  // `manageEnrollment`; no seeded account holds one, so it never applies here.
  "/training": (r) => isAdmin(r) || isInstructor(r),
  "/maintenance": (r) => isStaff(r) || isTechnician(r),
  "/audit-logs": isAdmin,
  "/settings": isAdmin,
  "/offerings": isAdmin,
};

/**
 * Guarded routes this suite deliberately does NOT drive, and why.
 *
 * Every key in the real `ROUTE_ACCESS` must appear in `EXPECTED` or here, and the unit
 * test fails if a new one appears in neither. That is the half that catches the route
 * somebody adds next year and never role-tests: a missing row is now a failure rather
 * than silence.
 */
export const NOT_DRIVEN: Record<string, string> = {
  "/training/enrollments":
    "Not a real index route. TanStack matches /training/$courseId with courseId=\"enrollments\" and applies the /training guard, so opening it here would test /training twice. The detail route (/training/enrollments/:id) is anyMember and is covered by the person detail page's link.",
  "/maintenance/squawks":
    "Write-up only, and not an index route either: the key exists so that /maintenance/squawks/:id matches it rather than /maintenance, which is what lets a student follow a link to a squawk record. There is nothing at the bare path to open.",
};
