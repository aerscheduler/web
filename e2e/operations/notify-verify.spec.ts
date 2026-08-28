import { test, expect } from "@playwright/test";
const S = "/private/tmp/claude-501/-Users-tony-Documents-Personal-AerScheduler/174b8dfc-57ff-4d19-8477-efb9ab1587f1/scratchpad/w1";

test("the grounding notice opens the aircraft", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto("/notifications");
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: "Decline" }).click({ timeout: 2500 }).catch(() => {});

  const notice = page.getByText("N44TS is off the line").first();
  await expect(notice).toBeVisible();
  await page.screenshot({ path: `${S}/notify-1-inbox.png` });

  await notice.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${S}/notify-2-landed.png` });

  // The whole point: it opens the AIRCRAFT record, not Home and not a list.
  await expect(page).toHaveURL(/\/aircraft\/133/);
  await expect(page.getByText("N44TS").first()).toBeVisible();
});
