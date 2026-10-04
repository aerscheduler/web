/** Local / CI only. Refuse production API hosts. */

const PROD_HINTS = ["aerscheduler.com", "amazonaws.com"];

export function apiProxyTarget(): string {
  return (
    process.env.VITE_API_PROXY ??
    process.env.E2E_API_HOST ??
    "http://127.0.0.1:5001"
  );
}

export function assertLocalApiTarget(): void {
  if (process.env.ALLOW_PROD_E2E === "1") return;
  const target = apiProxyTarget().toLowerCase();
  for (const hint of PROD_HINTS) {
    if (target.includes(hint)) {
      throw new Error(
        `Playwright E2E refuses production API (${target}). ` +
          `Set VITE_API_PROXY=http://127.0.0.1:5001 (and run the local server), ` +
          `or ALLOW_PROD_E2E=1 only if you mean it.`,
      );
    }
  }
}

export async function assertApiHealthy(): Promise<void> {
  assertLocalApiTarget();
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await fetch(`${base}/health`).catch((e: unknown) => {
    throw new Error(
      `Local API not reachable at ${base} (${String(e)}). Start: cd server && npm run dev`,
    );
  });
  if (!res.ok) {
    throw new Error(`Local API /health returned ${res.status} at ${base}`);
  }
}

export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "AerTest2026!";

export const ACCOUNTS = {
  owner: process.env.E2E_OWNER_EMAIL ?? "test-owner@aerscheduler.com",
  admin: process.env.E2E_ADMIN_EMAIL ?? "test-admin@aerscheduler.com",
  dispatcher:
    process.env.E2E_DISPATCHER_EMAIL ?? "test-dispatcher@aerscheduler.com",
  instructor:
    process.env.E2E_INSTRUCTOR_EMAIL ?? "test-instructor@aerscheduler.com",
  student: process.env.E2E_STUDENT_EMAIL ?? "test-student@aerscheduler.com",
  renter: process.env.E2E_RENTER_EMAIL ?? "test-renter@aerscheduler.com",
  technician:
    process.env.E2E_TECHNICIAN_EMAIL ?? "test-technician@aerscheduler.com",
} as const;

/**
 * A SECOND RENTER, deliberately NOT in `ACCOUNTS`.
 *
 * Slot-offer recovery needs a candidate who can be seated on the booking's TYPE and is not
 * already on it; for a `rental` only a renter qualifies, so one renter in the school makes
 * the flow untestable. But `auth.setup.ts` performs one UI login per entry in `ACCOUNTS`,
 * serially, and that is the slowest thing in the suite: adding an eighth made EVERY run pay
 * for an account one spec needs, and pushed the setup past its budget.
 *
 * So it lives here, and the one spec that needs a browser session for it logs in itself.
 */
export const RENTER2_EMAIL = process.env.E2E_RENTER2_EMAIL ?? "test-renter2@aerscheduler.com";

/**
 * An OUTSIDE AIRCRAFT OWNER, also kept out of `ACCOUNTS` for the same setup-time reason, and
 * because it is not a role: an external, claimed membership with no role rows, who owns the
 * customer aircraft N4417T and has a finding to answer on it. seed-test-accounts.sql puts that
 * job back to "waiting for the owner" on every run.
 */
export const AIRCRAFT_OWNER_EMAIL = process.env.E2E_AIRCRAFT_OWNER_EMAIL ?? "test-aircraft-owner@aerscheduler.com";

export type AccountRole = keyof typeof ACCOUNTS;
