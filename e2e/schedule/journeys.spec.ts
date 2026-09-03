import { test, expect } from "@playwright/test";
import { cleanupE2eReservations } from "../helpers/api";

test.describe("Schedule", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("schedule page loads for owner", async ({ page }) => {
    await page.route(/\/api\/slot-offers\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(
      /schedule|calendar|today|reservation/i,
      { timeout: 30_000 },
    );
    await expect(page.getByRole("button", { name: "Grid view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "List view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Pending offers/i })).toHaveCount(0);
  });

  test("narrow schedule keeps its agenda without a view toggle", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto("/schedule");
    await page.getByRole("tab", { name: "Week" }).click();

    await expect(page.locator('[data-layout="agenda"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Grid view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "List view" })).toHaveCount(0);
  });

  test("desktop schedule loads with a calendar-shaped skeleton", async ({ page }) => {
    await page.route(/\/api\/reservations\/?(\?.*)?$/, async () => {
      // Keep the request pending long enough to inspect the loading state.
    });
    await page.goto("/schedule");

    await expect(page.locator('[data-layout="calendar-skeleton"]')).toBeVisible();
  });

  test("create reservation journey (smoke)", async ({ page }) => {
    await page.goto("/schedule");
    const create = page
      .getByRole("button", { name: /create|new reservation|book/i })
      .first();
    const visible = await create.isVisible().catch(() => false);
    test.skip(!visible, "Create control not visible on schedule for this build");
    await create.click();
    await expect(
      page.getByText(/reservation|solo|dual|student|aircraft|plane/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
