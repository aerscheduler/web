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
