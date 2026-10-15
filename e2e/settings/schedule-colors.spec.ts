import { test, expect } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Settings, Schedule colors: an admin picks a color per reservation type, and the whole
 * console (board, legend, dots) is redrawn in it through the --res-* variables.
 */
test.describe("Schedule colors", () => {
  test.describe.configure({ mode: "serial" });

  const resetColors = async (request: import("@playwright/test").APIRequestContext) => {
    const token = (await apiLogin(request, ACCOUNTS.owner)).auth.accessToken as string;
    await request.patch(`${apiProxyTarget().replace(/\/$/, "")}/organizations/`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reservationTypeColors: null },
    });
  };

  test.beforeAll(async ({ request }) => resetColors(request));
  test.afterAll(async ({ request }) => resetColors(request));

  test.describe("as the owner", () => {
    test.use({ storageState: ".auth/owner.json" });

    test("picks a color for Ground from its menu, it saves at once, and Undo puts it back", async ({ page }) => {
      await page.goto("/settings?tab=schedule-colors");
      await dismissCookieBanner(page);
      const ground = page.getByRole("button", { name: /^Ground color: / });
      await expect(ground).toHaveAccessibleName("Ground color: Graphite", { timeout: 20_000 });

      await ground.click();
      const patched = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/organizations\/?$/.test(new URL(r.url()).pathname));
      await page.getByRole("menuitem", { name: /^Teal/ }).click();
      const res = await patched;
      expect(res.ok(), await res.text()).toBeTruthy();
      const sent = res.request().postDataJSON() as { reservationTypeColors: Record<string, string | null> };
      expect(sent.reservationTypeColors.ground).toBe("#0B7A75");
      expect(sent.reservationTypeColors.dual).toBeNull();
      await expect(ground).toHaveAccessibleName("Ground color: Teal");
      await expect(page.getByText("Ground is now Teal")).toBeVisible();

      // Applied app-wide: the variable the board reads is now the organization's color.
      await expect
        .poll(() => page.evaluate(() => document.querySelector("style[data-reservation-type-colors]")?.textContent ?? ""))
        .toContain("--res-ground: #0B7A75");

      // Undo.
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(ground).toHaveAccessibleName("Ground color: Graphite");
      await expect
        .poll(() => page.evaluate(() => document.querySelector("style[data-reservation-type-colors]") === null))
        .toBe(true);
    });

    test("picking a type's own default stores nothing for it", async ({ page }) => {
      await page.goto("/settings?tab=schedule-colors");
      const solo = page.getByRole("button", { name: /^Solo color: / });
      await expect(solo).toHaveAccessibleName("Solo color: Blue", { timeout: 20_000 });
      await solo.click();
      await page.getByRole("menuitem", { name: /^Amber/ }).click();
      await expect(solo).toHaveAccessibleName("Solo color: Amber");
      await solo.click();
      const patched = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/organizations\/?$/.test(new URL(r.url()).pathname));
      await page.getByRole("menuitem", { name: /^Blue/ }).click();
      expect(((await (await patched).json()).data as { reservationTypeColors: unknown }).reservationTypeColors).toBeNull();
    });
  });

  test.describe("as a student", () => {
    test.use({ storageState: ".auth/student.json" });

    test("has no Schedule colors setting", async ({ page }) => {
      await page.goto("/settings?tab=schedule-colors");
      await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await expect(page.getByRole("button", { name: /^Ground color: / })).toHaveCount(0);
    });
  });
});
