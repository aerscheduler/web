import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

const PREFIX = "E2E-HIDE-";

async function ownerHeaders(request: APIRequestContext) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

async function cleanupE2eAnnouncements(request: APIRequestContext) {
  const { base, headers } = await ownerHeaders(request);
  const list = await request.get(`${base}/announcements?q=${PREFIX}`, { headers });
  if (!list.ok()) return;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  for (const item of items) {
    const title = String(item.title ?? "").trim();
    if (!title.startsWith(PREFIX) || item.id == null) continue;
    await request.delete(`${base}/announcements/${item.id}`, { headers, data: {} });
  }
}

test.describe("Hide announcement from Home", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eAnnouncements(request);
  });

  test("Got it removes a notice from Home and keeps it on the board", async ({
    page,
    request,
  }) => {
    await cleanupE2eAnnouncements(request);
    const { base, headers } = await ownerHeaders(request);
    const title = `${PREFIX}${Date.now()}`;
    const created = await request.post(`${base}/announcements`, {
      headers,
      data: { title, message: "E2E hide from Home" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const id = (await created.json()).data.id as number;

    await page.goto("/me");
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`announcement-got-it-${id}`).click();
    await expect(page.getByText(title)).toHaveCount(0);

    await page.goto("/operations/announcements");
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`announcement-got-it-${id}`)).toHaveCount(0);
    await expect(
      page.locator("div").filter({ hasText: title }).getByText("Seen", { exact: true }).first(),
    ).toBeVisible();
  });
});
