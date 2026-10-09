import { test, expect, type Page } from "@playwright/test";

/**
 * A school that SUBSCRIBED and whose renewal was then declined (Stripe `past_due`).
 *
 * The admin used to be told "Your free trial has ended, subscribe", which was false: the
 * first live case (VA Office of Emergency Services, 2026-10-08) had subscribed two weeks
 * earlier and its first charge bounced. They now get the payment-failed wall, whose one
 * button opens the billing portal and never Checkout (a second subscription beside the
 * unpaid one). Everyone else still gets "Access paused".
 *
 * A real past_due subscription needs a Stripe test clock, so `/subscription` answers the
 * way the server does for one: the real body with Stripe's verdict laid over it.
 */
async function answerAsPastDue(page: Page) {
  await page.route("**/api/subscription", async (route) => {
    const res = await route.fetch().catch(() => null);
    if (!res) return;
    const body = await res.json();
    const real = body?.data ?? body;
    await route
      .fulfill({
        response: res,
        json: {
          data: {
            ...real,
            hasSubscription: true,
            status: "past_due",
            state: "expired",
            blocked: true,
            unitCount: 1,
            billableUnits: 1,
            monthlyCents: 2000,
          },
        },
      })
      .catch(() => undefined);
  });
}

test.describe("admin", () => {
  test.use({ storageState: ".auth/admin.json" });

  test("sees the payment-failed wall, and its button opens the portal, not Checkout", async ({ page }) => {
    await answerAsPastDue(page);

    const checkout: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/subscription/checkout")) checkout.push(req.url());
    });
    await page.route("**/api/subscription/portal", (route) =>
      route.fulfill({ json: { data: { url: "/?portal=stub" } } })
    );

    await page.goto("/");
    const wall = page.getByTestId("payment-failed-wall");
    await expect(wall).toBeVisible({ timeout: 20_000 });
    await expect(wall.getByRole("heading", { name: "Your payment didn't go through" })).toBeVisible();
    await expect(wall.getByText(/We couldn't charge the card on file for .+'s \$20\/mo plan/)).toBeVisible();
    await expect(wall.getByText(/Nothing is deleted/)).toBeVisible();
    await expect(page.getByText("Your free trial has ended")).toHaveCount(0);
    await expect(wall.getByRole("button", { name: /Subscribe/ })).toHaveCount(0);

    const portal = page.waitForRequest(
      (req) => req.url().includes("/api/subscription/portal") && req.method() === "POST"
    );
    await wall.getByRole("button", { name: "Update payment method" }).click();
    await portal;
    await expect(page).toHaveURL(/portal=stub/);
    expect(checkout, "a past_due school must never be sent to Checkout").toEqual([]);
  });
});

test.describe("instructor", () => {
  test.use({ storageState: ".auth/instructor.json" });

  test("sees Access paused, with no payment details", async ({ page }) => {
    await answerAsPastDue(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Access paused" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("payment-failed-wall")).toHaveCount(0);
    await expect(page.getByText(/\$20/)).toHaveCount(0);
  });
});
