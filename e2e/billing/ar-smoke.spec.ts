import { test, expect } from "@playwright/test";

test.describe("Billing AR smoke", () => {
  test("billing page shows invoice surface", async ({ page }) => {
    await page.goto("/billing");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/invoice|billing|payment|amount|unpaid|paid/i, {
      timeout: 30_000,
    });
  });

  test("people page lists members", async ({ page }) => {
    await page.goto("/people");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/people|member|student|instructor|invite/i, {
      timeout: 30_000,
    });
  });

  test("aircraft page lists fleet", async ({ page }) => {
    await page.goto("/aircraft");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/aircraft|plane|tail|fleet|N[0-9]/i, {
      timeout: 30_000,
    });
  });

  test("maintenance page loads", async ({ page }) => {
    await page.goto("/maintenance");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/maintenance|squawk|reminder|work/i, {
      timeout: 30_000,
    });
  });
});
