// THE E2E ROUTE MATRIX AND THE REAL RULE HAVE TO GIVE THE SAME ANSWER.
//
// `e2e/access/route-matrix.spec.ts` opens every guarded route in a real browser as each of
// the seven seeded roles. Its expectations were a hand-copied mirror of `ROUTE_ACCESS`, and
// a copy of a rule is a rule that will disagree with itself eventually. It did: when the
// four training grants landed, `/training` deliberately moved from "staff or instructor" to
// "admin or instructor, widened by a grant". The server moved (`hasTrainingGrant` with an
// admin bypass), the console moved, the phone moved (`canSeeTrainingNav` says dispatchers
// are out "on purpose"), and the matrix did not. The suite then failed on a rule that had
// been changed deliberately, which is the worst kind of red: it trains people to ignore it.
//
// So the matrix's expectations moved into a dependency-free file that Playwright and this
// test both read, and this test asks the REAL `canAccess` the same questions. Drift now
// fails here, in a second, instead of in a browser suite ten minutes later.
//
// Why this can live in vitest when the Playwright spec cannot: vitest runs through Vite, so
// `@/` aliases and the React module `auth.tsx` behind `permissions.ts` resolve. Playwright
// uses its own transform and neither would.
import { describe, expect, it } from "vitest";

import { EXPECTED, NOT_DRIVEN, ROLE_ROLES, type MatrixRole } from "../../e2e/access/route-access.expected";
import { ROUTE_ACCESS, canAccess } from "./permissions";

const ROLES = Object.keys(ROLE_ROLES) as MatrixRole[];
const ROUTES = Object.keys(EXPECTED);

/**
 * None of the seeded accounts hold a grant (`seed-test-accounts.sql` inserts no `grant`
 * rows), and `canAccess` falls back to roles when a session carries none. Passing null
 * models those sessions exactly, including the `/training` widening being skipped.
 */
const NO_GRANTS = null;

describe("the e2e route matrix agrees with the rule it is testing", () => {
  const cases = ROUTES.flatMap((route) => ROLES.map((role) => ({ route, role })));

  it("has something to check", () => {
    expect(cases.length).toBe(ROUTES.length * ROLES.length);
    expect(cases.length).toBeGreaterThan(80);
  });

  // Named with the expectation in it, so a red line reads as a sentence: "the matrix says
  // dispatcher can open /training". You should not have to open the file to know what broke.
  it.each(
    cases.map((c) => {
      const allowed = EXPECTED[c.route]!(ROLE_ROLES[c.role]);
      return [`${c.role} ${allowed ? "can" : "cannot"} open ${c.route}`, c.role, c.route, allowed] as const;
    })
  )("the matrix says %s, and the rule agrees", (_name, role, route, expected) => {
    expect(canAccess(route, ROLE_ROLES[role], NO_GRANTS)).toBe(expected);
  });
});

// The other half, and the one that catches the route nobody thought about: a key added to
// `ROUTE_ACCESS` with no row in the matrix is silence today, and silence reads as covered.
describe("every guarded route is accounted for", () => {
  it.each(Object.keys(ROUTE_ACCESS))("%s is either driven in a browser or explained", (key) => {
    const driven = key in EXPECTED;
    const explained = key in NOT_DRIVEN;

    expect(
      driven || explained,
      `${key} is guarded by ROUTE_ACCESS but the e2e matrix neither opens it nor says why not. Add it to EXPECTED in e2e/access/route-access.expected.ts, or to NOT_DRIVEN with the reason.`
    ).toBe(true);
  });

  it("does not drive a route that is no longer guarded", () => {
    const stale = [...Object.keys(EXPECTED), ...Object.keys(NOT_DRIVEN)].filter((k) => !(k in ROUTE_ACCESS));

    expect(stale, "the matrix names routes that ROUTE_ACCESS no longer has").toEqual([]);
  });

  // A reason of "" or "TODO" is not a reason.
  it.each(Object.entries(NOT_DRIVEN))("%s explains itself properly", (_key, why) => {
    expect(why.length).toBeGreaterThan(40);
  });
});

// The specific drift that prompted all of this, pinned from the other side so that flipping
// it back reads as a deliberate act rather than a tidy-up.
describe("the training rule the matrix got wrong", () => {
  it("a dispatcher with no training grant cannot open it", () => {
    expect(canAccess("/training", ["dispatcher"], NO_GRANTS)).toBe(false);
  });

  it("an instructor can, and so can an admin", () => {
    expect(canAccess("/training", ["instructor"], NO_GRANTS)).toBe(true);
    expect(canAccess("/training", ["admin"], NO_GRANTS)).toBe(true);
  });

  // This is the feature the rule was changed FOR, and nothing else tests it through
  // `canAccess`: the grant is what lets a chief instructor or an auditor in.
  it.each([["configureTraining"], ["manageEnrollment"], ["auditor"]] as const)(
    "a dispatcher holding %s can",
    (grant) => {
      expect(canAccess("/training", ["dispatcher"], new Set([grant]))).toBe(true);
    }
  );

  it("a grant nobody handed out does not let them in", () => {
    expect(canAccess("/training", ["dispatcher"], new Set())).toBe(false);
  });
});
