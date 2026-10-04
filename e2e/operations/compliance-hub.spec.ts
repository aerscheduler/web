import { test, expect, type Page } from "@playwright/test";

async function mockGroundedBoard(page: Page) {
  await page.route(/\/api\/resources\/planes\?.*grounded=true/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 901,
            createdAt: "2026-09-02T00:00:00.000Z",
            featuredImage: null,
            type: {
              id: 902,
              plane: {
                id: 903,
                tailNumber: "N901GO",
                make: "Cessna",
                model: "172S",
                grounded: true,
                groundedReason: "Annual inspection",
              },
            },
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/orgUsers\?.*grounded=true/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 904,
            createdAt: "2026-09-02T00:00:00.000Z",
            identifier: null,
            grounded: true,
            groundedReason: "Medical expired",
            profileImage: null,
            user: { id: 905, name: "Grounded Pilot", email: "pilot@example.test" },
            studentRole: { id: 906 },
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/currencies\/types\/?(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: 7, name: "Medical", active: true }],
      }),
    });
  });
}

test.describe("Go / No-Go hub", () => {
  test("links counts and grounded records to their working surfaces", async ({ page }) => {
    await mockGroundedBoard(page);

    await page.goto("/compliance");

    await expect(page.getByRole("link", { name: "Grounded aircraft" })).toHaveAttribute(
      "href",
      "/aircraft?grounded=true",
    );
    await expect(page.getByRole("link", { name: "Grounded members" })).toHaveAttribute(
      "href",
      "/people?grounded=true",
    );
    await expect(page.getByRole("link", { name: "Open N901GO" })).toHaveAttribute(
      "href",
      "/aircraft/901",
    );
    await expect(page.getByRole("link", { name: "Open Grounded Pilot" })).toHaveAttribute(
      "href",
      "/people/904",
    );
    await expect(page.getByText("Annual inspection")).toBeVisible();
    await expect(page.getByText("Medical expired")).toBeVisible();

    const currencyRules = page.getByRole("link", { name: /Manage currency rules/i }).first();
    await expect(currencyRules).toHaveAttribute("href", "/settings?tab=currencies");
    await expect(page.getByRole("link", { name: "Open Medical currency rule" })).toHaveAttribute(
      "href",
      "/compliance/rules/7",
    );
  });

  // The stat tiles only sometimes carry a hint line, so they rendered at mixed heights side
  // by side. (The grounded aircraft and members were cards of mismatched height too; since
  // 2026-09-30 they are rows of one list, which share a height by construction.)
  test("renders every stat tile at one height", async ({ page }) => {
    await mockGroundedBoard(page);
    await page.goto("/compliance");
    await expect(page.getByRole("link", { name: "Open N901GO" })).toBeVisible();

    // Measure the card, not the grid item: a grid item stretches to the row on its
    // own, which is exactly why the short inner card went unnoticed.
    const tileHeights = await page
      .locator("[data-stat-grid] > *")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const card = node.tagName === "A" ? node.firstElementChild : node;
          return card!.getBoundingClientRect().height;
        }),
      );

    expect(tileHeights.length).toBe(4);
    for (const height of tileHeights) {
      expect(height).toBeCloseTo(tileHeights[0], 0);
    }
  });

  test.describe("as a dispatcher", () => {
    test.use({ storageState: ".auth/dispatcher.json" });

    test("does not offer an inaccessible Settings action", async ({ page }) => {
      await page.goto("/compliance");
      await expect(page).toHaveURL(/\/compliance/);
      await expect(page.getByRole("link", { name: /Manage currency rules/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Set up currency rules/i })).toHaveCount(0);
    });
  });
});
