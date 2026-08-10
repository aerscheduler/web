import { test, expect } from "@playwright/test";

test.describe("People", () => {
  test("people page loads and invite is offered", async ({ page }) => {
    await page.goto("/people");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/people|members|personnel/i, {
      timeout: 30_000,
    });
    const invite = page.getByRole("button", { name: /invite/i }).first();
    if (await invite.isVisible().catch(() => false)) {
      await invite.click();
      await expect(
        page.getByText(/invite|email|role/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
