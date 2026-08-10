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

export type AccountRole = keyof typeof ACCOUNTS;
