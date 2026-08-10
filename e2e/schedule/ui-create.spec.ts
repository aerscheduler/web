import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";

/** Click a closed Combobox trigger that still shows its placeholder text. */
async function pickByPlaceholder(
  page: import("@playwright/test").Page,
  placeholder: RegExp,
  option: RegExp,
  searchPlaceholder?: RegExp,
) {
  const trigger = page.getByRole("combobox").filter({ hasText: placeholder }).first();
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeVisible({ timeout: 25_000 });
  await trigger.click();
  if (searchPlaceholder) {
    const search = page.getByPlaceholder(searchPlaceholder).last();
    if (await search.isVisible().catch(() => false)) {
      const fill = option.source?.replace(/[\\^$.*+?()[\]{}|]/g, "") ?? "";
      if (fill) await search.fill(fill);
    }
  }
  const item = page
    .locator("[cmdk-item], [role='option']")
    .filter({ hasText: option })
    .first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
}

test.describe("Schedule UI create", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("owner books via lane click + reservation form", async ({ page, request }) => {
    const marker = `E2E-UI-web-${Date.now()}`;
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);

    const accept = page.getByRole("button", { name: /^Accept$/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();

    // Lane click seeds Out on / Start / Back at from the grid (avoids empty time pickers).
    const lane = page.getByLabel(/Book time on N172TS/i).first();
    if (await lane.isVisible().catch(() => false)) {
      await lane.click({ position: { x: 120, y: 28 } });
    } else {
      // Fallback: New reservation CTA, then pick resource.
      const pageCta = page.getByRole("button", { name: /\+?\s*New reservation/i });
      await pageCta.click();
      await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    }

    await expect(page.getByText("New reservation").first()).toBeVisible({
      timeout: 15_000,
    });

    // Ensure resource is N172TS when lane missed the plane row.
    const resourceEmpty = page
      .getByRole("combobox")
      .filter({ hasText: /Select resource/i })
      .first();
    if (await resourceEmpty.isVisible().catch(() => false)) {
      await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    }

    const studentTrigger = page
      .getByRole("combobox")
      .filter({ hasText: /Assign student/i })
      .first();
    if (await studentTrigger.isVisible().catch(() => false)) {
      await pickByPlaceholder(page, /Assign student/i, /Test Student/, /Search student/i);
    }

    const instructorTrigger = page
      .getByRole("combobox")
      .filter({ hasText: /Assign instructor/i })
      .first();
    if (await instructorTrigger.isVisible().catch(() => false)) {
      await pickByPlaceholder(
        page,
        /Assign instructor/i,
        /Test Instructor/,
        /Search instructor/i,
      );
    }

    // If Start is still unset, pick the first available option.
    const startCombo = page
      .locator("div")
      .filter({ has: page.getByText(/^Start$/, { exact: true }) })
      .getByRole("combobox")
      .first();
    const startText = ((await startCombo.textContent().catch(() => "")) ?? "").trim();
    if (/^Select$/i.test(startText) || startText.length === 0) {
      await startCombo.click();
      const opt = page.getByRole("option").first();
      await expect(opt).toBeVisible({ timeout: 25_000 });
      await opt.click();
    }

    await page.locator("#res-title").fill(marker);
    await page.locator("#res-notes").fill(marker);

    const postPromise = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/(api\/)?reservations\/?$/.test(new URL(r.url()).pathname),
      { timeout: 45_000 },
    );
    await page.getByRole("button", { name: /^Book reservation$/i }).click();

    const alert = page.getByRole("alert");
    const raced = await Promise.race([
      postPromise.then((r) => ({ kind: "post" as const, r })),
      alert
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(async () => ({
          kind: "alert" as const,
          text: (await alert.textContent()) ?? "",
        }))
        .catch(() => null),
    ]);
    if (!raced || raced.kind === "alert") {
      throw new Error(
        `Book blocked before POST. Alert: ${
          raced && raced.kind === "alert" ? raced.text : "(none)"
        }`,
      );
    }
    expect(
      raced.r.ok(),
      `POST /reservations failed ${raced.r.status()}: ${(await raced.r.text()).slice(0, 400)}`,
    ).toBeTruthy();

    await expect(page.locator("#res-notes")).toBeHidden({ timeout: 15_000 });

    const base = apiProxyTarget().replace(/\/$/, "");
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
    });
    const token = (await auth.json()).auth.accessToken as string;
    const start = new Date(Date.now() - 2 * 864e5).toISOString();
    const end = new Date(Date.now() + 45 * 864e5).toISOString();
    const list = await request.get(
      `${base}/reservations?startDate=${start}&endDate=${end}&includeCanceled=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const items = Array.isArray(body) ? body : (body.data ?? []);
    const found = items.some(
      (r: { notes?: string; title?: string }) =>
        String(r.notes ?? "").includes(marker) ||
        String(r.title ?? "").includes(marker),
    );
    expect(found, `Booked but not listed for marker=${marker}`).toBeTruthy();
  });
});
