import { test, expect } from "@playwright/test";

/**
 * Dashboard checklist track preview.
 *
 * Full signup (email verify → create org) is too heavy for CI smoke. Ordering math is
 * covered in `intent-logic.spec.ts`. This locks the customer-visible caption (and the
 * lead tile when that item is still outstanding on AERTEST01).
 */
test.describe("Setup checklist tracks", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("maintenance track shows its caption", async ({ page }) => {
    await page.goto("/dashboard?track=maintenance&checklist=show");
    await expect(page.getByTestId("setup-checklist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/maintenance/i);

    const maintenance = page.getByTestId("setup-checklist-item-maintenance");
    const aircraft = page.getByTestId("setup-checklist-item-aircraft");
    if ((await maintenance.count()) && (await aircraft.count())) {
      const maintBox = await maintenance.boundingBox();
      const airBox = await aircraft.boundingBox();
      expect(maintBox && airBox && maintBox.y <= airBox.y).toBeTruthy();
    }
  });

  test("training track shows its caption", async ({ page }) => {
    await page.goto("/dashboard?track=training&checklist=show");
    await expect(page.getByTestId("setup-checklist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/training/i);
  });

  test("reports track shows its caption", async ({ page }) => {
    await page.goto("/dashboard?track=reports&checklist=show");
    await expect(page.getByTestId("setup-checklist")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("setup-checklist-caption")).toContainText(/reports/i);
  });
});
