import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "../helpers/env";
import { uiLogin } from "../helpers/api";

test.describe("Auth (UI login)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("owner can sign in", async ({ page }) => {
    await uiLogin(page, ACCOUNTS.owner, TEST_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("bad password stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.owner);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Signup on a short phone", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 667 },
  });

  test("Create account is fully on screen after scroll", async ({ page }) => {
    await page.goto("/signup");
    const accept = page.getByRole("button", { name: /^Accept$/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();
    const btn = page.getByRole("button", { name: "Create account" });
    await btn.scrollIntoViewIfNeeded();
    const box = await btn.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThan(40);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);
  });

  test("Create account can scroll above the cookie banner", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "aer_country", value: "GB", url: baseURL! }]);
    await page.goto("/signup");
    const banner = page.getByRole("dialog", { name: /Cookie preferences/i });
    await expect(banner).toBeVisible();
    const btn = page.getByRole("button", { name: "Create account" });
    await btn.scrollIntoViewIfNeeded();
    const btnBox = await btn.boundingBox();
    const bannerBox = await banner.boundingBox();
    expect(btnBox).toBeTruthy();
    expect(bannerBox).toBeTruthy();
    expect(btnBox!.height).toBeGreaterThan(40);
    expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(bannerBox!.y + 1);
    await btn.click({ trial: true });
  });

  test("Google outline is not the dark-mode hairline", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/signup");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const google = page.getByRole("button", { name: /^Google$/i });
    await expect(google).toBeVisible();
    const border = await google.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(border).not.toBe("rgb(44, 45, 48)");
  });
});
