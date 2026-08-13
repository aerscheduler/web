import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "./env";

export async function uiLogin(
  page: Page,
  email: string,
  password = TEST_PASSWORD,
) {
  await page.goto("/login");
  const accept = page.getByRole("button", { name: /^Accept$/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password = TEST_PASSWORD,
) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.post(`${base}/auth/`, {
    data: { email, password },
  });
  expect(res.ok(), `auth failed for ${email}: ${res.status()}`).toBeTruthy();
  return res.json();
}

/** Cancel E2E-tagged bookings in the current org (same markers as Flutter). */
export async function cleanupE2eReservations(
  request: APIRequestContext,
  email = ACCOUNTS.owner,
) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await apiLogin(request, email);
  const token = auth.auth?.accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };

  const now = new Date();
  const start = new Date(now.getTime() - 14 * 864e5).toISOString();
  // Far-future seeds (ledger verify in 2032) still count toward "upcoming" caps.
  const end = new Date(Date.UTC(2035, 0, 1)).toISOString();
  const list = await request.get(
    `${base}/reservations?startDate=${start}&endDate=${end}&includeCanceled=false`,
    { headers },
  );
  if (!list.ok()) return 0;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  let cancelled = 0;
  for (const item of items) {
    const title = (item.title ?? "").trim();
    const notes = item.notes ?? "";
    const isE2e =
      title === "E2E Ramp" ||
      title.startsWith("E2E L3") ||
      title.startsWith("E2E L4") ||
      title.startsWith("E2E L5") ||
      title.startsWith("L3-C") ||
      title.startsWith("UI-walk L3") ||
      notes.includes("E2E-UI-") ||
      notes.includes("Seeded for integration_test") ||
      notes.startsWith("E2E");
    if (!isE2e || item.cancelledAt) continue;
    const del = await request.delete(`${base}/reservations/${item.id}`, {
      headers,
      data: { reason: "E2E test cleanup", category: "booked_in_error" },
    });
    if (del.status() === 204 || del.ok()) cancelled += 1;
  }
  return cancelled;
}
