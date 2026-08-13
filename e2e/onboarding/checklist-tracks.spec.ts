import { test, expect } from "@playwright/test";

/**
 * Dashboard checklist track preview.
 *
 * Use `?checklist=fresh` so AERTEST01 (mostly set up) still shows the track's lead
 * items. Ordering math is also covered in `intent-logic.spec.ts`.
 */
test.describe("Setup checklist tracks", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("maintenance track leads with Start here items", async ({ page }) => {
    await page.goto("/dashboard?track=maintenance&checklist=fresh");
    await expect(page.getByTestId("setup-checklist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/maintenance/i);
    await expect(page.getByTestId("setup-checklist-start-here")).toBeVisible();

    const start = page.getByTestId("setup-checklist-start-here");
    await expect(start.getByTestId("setup-checklist-item-maintenance")).toBeVisible();
    await expect(start.getByTestId("setup-checklist-item-aircraft")).toBeVisible();
  });

  test("clubs and reports lead with different Start here items", async ({ page }) => {
    await page.goto("/dashboard?track=clubs&checklist=fresh");
    await expect(page.getByTestId("setup-checklist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/flying clubs/i);
    const clubsStart = page.getByTestId("setup-checklist-start-here");
    await expect(clubsStart.getByTestId("setup-checklist-item-students")).toBeVisible();
    await expect(clubsStart.getByTestId("setup-checklist-item-rules")).toBeVisible();
    await expect(clubsStart.getByTestId("setup-checklist-item-reservation")).toBeVisible();
    await expect(page.getByTestId("setup-checklist-expand")).toContainText(/Also set up/i);

    await page.goto("/dashboard?track=reports&checklist=fresh");
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/reports/i);
    const reportsStart = page.getByTestId("setup-checklist-start-here");
    await expect(reportsStart.getByTestId("setup-checklist-item-aircraft")).toBeVisible();
    await expect(reportsStart.getByTestId("setup-checklist-item-reservation")).toBeVisible();
    await expect(reportsStart.getByTestId("setup-checklist-item-invoice")).toBeVisible();
    await expect(reportsStart.getByTestId("setup-checklist-item-students")).toHaveCount(0);
  });

  test("training track shows its caption", async ({ page }) => {
    await page.goto("/dashboard?track=training&checklist=fresh");
    await expect(page.getByTestId("setup-checklist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/training/i);
    await expect(
      page.getByTestId("setup-checklist-start-here").getByTestId("setup-checklist-item-training")
    ).toBeVisible();
  });
});
