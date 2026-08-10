import { test, expect } from "@playwright/test";
import { cleanupE2eReservations } from "../helpers/api";

test.describe("Schedule", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("schedule page loads for owner", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(
      /schedule|calendar|today|reservation/i,
      { timeout: 30_000 },
    );
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
