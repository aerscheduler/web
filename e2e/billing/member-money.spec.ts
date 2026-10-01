import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { authAs, dismissCookieBanner } from "../helpers/airworthiness";
import { orgUserIdForEmail } from "../helpers/booking-adversarial";

/**
 * A member's own money screens, read against the API.
 *
 * Two bugs found on 2026-09-30: My Day counted VOIDED bills as owed (the unpaid list includes
 * them unless told otherwise, so the test student read "33 unpaid invoices" for 4 real ones),
 * and the member's invoice panel never showed its lines (it read them from the list row, which
 * carries none), so a taxed bill showed a Tax figure with nothing to explain it.
 */

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

type Row = { id: number; total: number | null; voidedAt: string | null };

test.describe("as a student", () => {
  test.use({ storageState: ".auth/student.json" });

  test("My Day counts only the bills that are owed, never voided ones", async ({ page, request }) => {
    const owner = await authAs(request, "owner");
    const me = await authAs(request, "student");
    const orgUserId = await orgUserIdForEmail(request, owner.headers.Authorization.replace("Bearer ", ""), ACCOUNTS.student);
    const owed = (await (await request.get(`${me.base}/invoices/orgUsers/${orgUserId}?paid=false&voided=false&limit=500`, { headers: me.headers })).json()).data as Row[];
    expect(owed.every((r) => r.voidedAt == null)).toBe(true);

    await page.goto("/me");
    await dismissCookieBanner(page);
    const tile = page.locator('a[href^="/me/invoices"]').filter({ hasText: /Outstanding balance|Account balance/ }).first();
    await expect(tile).toBeVisible({ timeout: 20_000 });
    if (owed.length) {
      await expect(tile).toContainText(`${owed.length} unpaid ${owed.length === 1 ? "invoice" : "invoices"}`);
      await expect(tile).toContainText(money(owed.reduce((sum, r) => sum + (r.total ?? 0), 0)));
    }
  });
});

test.describe("as a renter", () => {
  test.use({ storageState: ".auth/renter.json" });

  test("an invoice opened from My invoices lists its lines", async ({ page, request }) => {
    const owner = await authAs(request, "owner");
    const me = await authAs(request, "renter");
    const orgUserId = await orgUserIdForEmail(request, owner.headers.Authorization.replace("Bearer ", ""), ACCOUNTS.renter);
    const rows = (await (await request.get(`${me.base}/invoices/orgUsers/${orgUserId}?limit=50`, { headers: me.headers })).json()).data as Row[];
    // The first of the renter's bills that has lines, read the way the panel now reads it.
    let withLines: { id: number; items: { name: string }[] } | null = null;
    for (const r of rows) {
      const full = (await (await request.get(`${me.base}/invoices/${r.id}`, { headers: me.headers })).json()).data as { id: number; items?: { name: string }[] };
      if (full.items?.length) {
        withLines = { id: full.id, items: full.items };
        break;
      }
    }
    test.skip(!withLines, "the renter has no invoice with lines in this database");

    await page.goto(`/me/invoices?invoice=${withLines!.id}`);
    await dismissCookieBanner(page);
    const panel = page.getByRole("dialog").or(page.locator("aside")).filter({ hasText: `Invoice #${withLines!.id}` }).first();
    await expect(panel.getByText(withLines!.items[0].name, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("No line items on this invoice.")).toHaveCount(0);
  });
});
