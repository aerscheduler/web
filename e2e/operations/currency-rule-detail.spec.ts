import { test, expect, type Page } from "@playwright/test";

function detailPayload(dispatcherCanRenew = false, documentGated = true) {
  return {
    data: {
      type: {
        id: 7,
        name: "Medical",
        description: "Keep a current medical certificate on file.",
        active: true,
        expiresInMonths: 12,
        expiresInDays: null,
        expiresOn: null,
        warningPeriodInDays: 30,
        canFlyWithInstructor: false,
        canRenewSelf: false,
        dispatcherCanRenew,
        instructorCanRenew: false,
        orgUserGroups: [{ id: 11, name: "Pilots" }],
        resourceGroups: [{ id: 12, name: "Training fleet" }],
        documentTypes: documentGated
          ? [{ id: 13, name: "Medical certificate", expires: true }]
          : [],
      },
      summary: {
        total: 1,
        current: 0,
        expiring: 0,
        expired: 1,
        notSignedOff: 0,
        missingDocuments: documentGated ? 1 : 0,
      },
      members: [
        {
          currencyId: 14,
          orgUser: {
            id: 15,
            createdAt: "2026-01-01T00:00:00.000Z",
            identifier: null,
            grounded: false,
            profileImage: null,
            user: { id: 16, name: "Jamie Pilot", email: "jamie@example.test" },
          },
          status: "expired",
          startedAt: "2025-01-01T00:00:00.000Z",
          warnedAt: null,
          expiredAt: "2026-01-01T00:00:00.000Z",
          expiresOn: "2026-01-01T00:00:00.000Z",
          notes: null,
          renewedBy: {
            id: 17,
            user: { id: 18, name: "Chief Pilot", email: "chief@example.test" },
          },
          documents: [],
          missingDocumentTypeIds: documentGated ? [13] : [],
        },
      ],
      pagination: {
        total: 1,
        limit: 25,
        offset: 0,
        returned: 1,
        hasMore: false,
      },
    },
  };
}

async function mockDetail(
  page: Page,
  options: { dispatcherCanRenew?: boolean; documentGated?: boolean } = {},
) {
  await page.route(/\/api\/currencies\/types\/7\/detail(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        detailPayload(options.dispatcherCanRenew, options.documentGated),
      ),
    });
  });
}

test.describe("Currency rule detail", () => {
  test("is reachable from the Settings rule catalog", async ({ page }) => {
    await page.route(/\/api\/currencies\/types\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [detailPayload().data.type],
          pagination: {
            total: 1,
            limit: 1000,
            offset: 0,
            returned: 1,
            hasMore: false,
          },
        }),
      });
    });
    await page.goto("/settings?tab=currencies");

    await expect(page.getByRole("link", { name: "Medical" })).toHaveAttribute(
      "href",
      "/compliance/rules/7",
    );
  });

  test("shows rule scope, standing, missing evidence, and member drill-in", async ({ page }) => {
    await mockDetail(page);
    await page.goto("/compliance/rules/7");

    await expect(page.getByRole("heading", { name: "Medical" })).toBeVisible();
    await expect(page.getByText("Training fleet")).toBeVisible();
    await expect(page.getByText("Missing Medical certificate")).toBeVisible();
    await expect(page.getByRole("link", { name: "Jamie Pilot" })).toHaveAttribute(
      "href",
      "/people/15?tab=compliance",
    );
    await expect(page.getByRole("button", { name: "Edit rule" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review documents" })).toHaveAttribute(
      "href",
      "/people/15?tab=compliance",
    );
  });

  test("renders a useful not-found state for a stale rule link", async ({ page }) => {
    await page.route(/\/api\/currencies\/types\/404\/detail(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Currency type not found" }),
      });
    });
    await page.goto("/compliance/rules/404");
    await expect(page.getByText("Currency rule not found", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Go / No-Go" })).toBeVisible();
  });

  test("keeps the rule and roster usable at a narrow width", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await mockDetail(page);
    await page.goto("/compliance/rules/7");

    await expect(page.getByRole("heading", { name: "Medical" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Jamie Pilot" })).toBeVisible();
  });

  test.describe("as a dispatcher", () => {
    test.use({ storageState: ".auth/dispatcher.json" });

    test("can open the roster and renew only when the rule permits it", async ({ page }) => {
      await mockDetail(page, { dispatcherCanRenew: true, documentGated: false });
      await page.goto("/compliance/rules/7");

      await expect(page.getByRole("heading", { name: "Medical" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit rule" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Renew" })).toBeVisible();
      await page.getByRole("button", { name: "Renew" }).click();
      await expect(page.getByRole("dialog")).toContainText("Renew currency");
    });
  });
});
