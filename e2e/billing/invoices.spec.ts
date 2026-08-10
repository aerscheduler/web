import { test, expect } from "@playwright/test";

test.describe("Billing", () => {
  test("billing / invoices page is reachable for admin/owner", async ({
    page,
  }) => {
    await page.goto("/billing");
    // May redirect to billing setup if Stripe not connected locally.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(
      /invoice|billing|payment|stripe|connect/i,
      { timeout: 30_000 },
    );
  });
});
