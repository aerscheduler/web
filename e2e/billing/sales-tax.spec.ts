import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * SALES TAX on bills raised by hand: the school's rates and rules, the preview the New
 * invoice form shows, the customer exemption, and who may change any of it.
 * Design: _local/maintenance-shop/SALES-TAX-DESIGN.md.
 *
 * Nothing here creates a Stripe invoice (the E2E stack has no Stripe account), so the money
 * assertions are on POST /invoices/preview, which is priced by the same code as the create.
 * The create path, against a stand-in Stripe that rounds differently from the preview, is
 * server/test/integration/sales-tax.itest.ts.
 *
 * Serial and self-restoring: it changes org-wide settings, and puts them back.
 */
test.describe.configure({ mode: "serial" });

const base = () => apiProxyTarget().replace(/\/$/, "");
const NO_SUCH_MEMBER = 999_999_991;

async function tokenFor(request: APIRequestContext, email: string) {
  const res = await request.post(`${base()}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `auth ${email}`).toBeTruthy();
  const token = (await res.json()).auth.accessToken as string;
  return { Authorization: `Bearer ${token}` };
}

const unwrap = async (res: import("@playwright/test").APIResponse) => {
  const body = await res.json();
  return body?.data ?? body;
};

let owner: Record<string, string>;
let renterId: number;
let rateId: number;
let priorRules: Record<string, number>;
let priorExemption: { reason: string | null; note: string | null };

const shopLines = [
  { name: "E2E-Annual inspection labor", qty: 1, unitPrice: 120000, category: "labor" },
  { name: "E2E-Oil filter", qty: 1, unitPrice: 2425, category: "part" },
];

test.beforeAll(async ({ request }) => {
  owner = await tokenFor(request, ACCOUNTS.owner);
  const roster = await unwrap(await request.get(`${base()}/orgUsers?limit=500`, { headers: owner }));
  const renter = (roster as { id: number; user?: { email?: string } }[]).find((m) => m.user?.email === ACCOUNTS.renter);
  expect(renter, "the test renter is on the roster").toBeTruthy();
  renterId = renter!.id;

  const settings = await unwrap(await request.get(`${base()}/organizations/salesTax`, { headers: owner }));
  priorRules = settings.rules ?? {};
  priorExemption = await unwrap(await request.get(`${base()}/orgUsers/${renterId}/taxExemption`, { headers: owner }));

  await request.put(`${base()}/orgUsers/${renterId}/taxExemption`, { headers: owner, data: { reason: null } });
});

test("the owner adds the school's rate through the form, starting from its airport's state", async ({ page, request }) => {
  const before = await unwrap(await request.get(`${base()}/organizations/salesTax`, { headers: owner }));
  const firstRate = !(before.rates as { archivedAt: string | null }[]).some((r) => !r.archivedAt);

  await page.goto("/settings?tab=sales-tax");
  await page.getByRole("button", { name: /Add rate/ }).click();
  // By its title: the cookie banner is a dialog too.
  const dlg = page.getByRole("dialog").filter({ hasText: "Add a sales tax rate" });
  if (firstRate && before.suggestion) {
    // Filled in from what the school already told us: its airport's state and that state's
    // statewide rate. Nothing is saved until the owner clicks Add rate.
    const st = before.suggestion.state as { name: string; ratePpm: number };
    await expect(dlg.getByTestId("sales-tax-prefill")).toContainText(before.suggestion.from);
    await expect(dlg.locator("#sales-tax-name")).toHaveValue(`${st.name} sales tax`);
    await expect(dlg.locator("#sales-tax-percent")).toHaveValue(String(st.ratePpm / 10000));
  }
  // Picking another state carries the name and the statewide rate along with it.
  await dlg.locator("#sales-tax-state").click();
  await page.getByRole("option", { name: "Idaho", exact: true }).click();
  await expect(dlg.locator("#sales-tax-percent")).toHaveValue("6");
  await expect(dlg.getByText(/Idaho's statewide rate is 6%/)).toBeVisible();
  await dlg.locator("#sales-tax-name").fill("E2E Idaho sales tax");
  await dlg.getByRole("button", { name: "Add rate" }).click();
  await expect(dlg).toBeHidden({ timeout: 15_000 });

  const after = await unwrap(await request.get(`${base()}/organizations/salesTax`, { headers: owner }));
  const mine = (after.rates as { id: number; name: string; jurisdiction: string | null; archivedAt: string | null }[]).find(
    (r) => r.name === "E2E Idaho sales tax" && !r.archivedAt
  );
  expect(mine, "the rate was added").toBeTruthy();
  expect(mine!.jurisdiction).toBe("ID");
  rateId = mine!.id;
  if (Object.keys(before.rules ?? {}).length === 0) {
    // The first rate offers "Apply it to Parts and goods", ticked.
    expect(after.rules.part).toBe(rateId);
  }
  const rules = await request.put(`${base()}/organizations/salesTax/rules`, { headers: owner, data: { rules: { part: rateId } } });
  expect(rules.ok(), await rules.text()).toBeTruthy();
});

test("a rate abroad asks for its country, and its region is never read as a US state", async ({ page, request }) => {
  await page.goto("/settings?tab=sales-tax");
  await page.getByRole("button", { name: /Add rate/ }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Add a sales tax rate" });
  await dlg.locator("#sales-tax-state").click();
  await page.getByRole("option", { name: "Outside the US" }).click();
  await dlg.locator("#sales-tax-name").fill("E2E GST");
  await dlg.locator("#sales-tax-percent").fill("10");
  await dlg.getByRole("button", { name: "Add rate" }).click();
  await expect(dlg.getByText("Pick the country the tax is owed in.")).toBeVisible();

  await dlg.locator("#sales-tax-country").click();
  await page.getByRole("option", { name: "Australia", exact: true }).click();
  // Western Australia: the same letters as Washington.
  await dlg.locator("#sales-tax-region").fill("WA");
  await dlg.getByRole("button", { name: "Add rate" }).click();
  await expect(dlg).toBeHidden({ timeout: 15_000 });

  const after = await unwrap(await request.get(`${base()}/organizations/salesTax`, { headers: owner }));
  const gst = (after.rates as { id: number; name: string; country: string; jurisdiction: string | null; archivedAt: string | null }[]).find(
    (r) => r.name === "E2E GST" && !r.archivedAt
  );
  expect(gst, "the rate was added").toBeTruthy();
  try {
    expect(gst).toMatchObject({ country: "AU", jurisdiction: "WA" });
    await expect(page.getByTestId("sales-tax-rate").filter({ hasText: "E2E GST" })).toContainText("WA · Australia");
  } finally {
    await request.post(`${base()}/organizations/salesTax/rates/${gst!.id}/archive`, { headers: owner });
  }
});

test.afterAll(async ({ request }) => {
  const h = owner ?? (await tokenFor(request, ACCOUNTS.owner));
  await request.put(`${base()}/organizations/salesTax/rules`, { headers: h, data: { rules: priorRules ?? {} } });
  if (rateId) await request.post(`${base()}/organizations/salesTax/rates/${rateId}/archive`, { headers: h });
  if (renterId) {
    await request.put(`${base()}/orgUsers/${renterId}/taxExemption`, {
      headers: h,
      data: priorExemption?.reason ? priorExemption : { reason: null },
    });
  }
});

test.describe("pricing a bill", () => {
  test("taxes the part and not the separately stated labor", async ({ request }) => {
    const res = await request.post(`${base()}/invoices/preview`, {
      headers: owner,
      data: { customer: { id: renterId }, items: shopLines },
    });
    expect(res.status(), await res.text()).toBe(200);
    const p = await unwrap(res);
    expect(p.lines.slice(0, 2).map((l: { taxable: boolean }) => l.taxable)).toEqual([false, true]);
    // 6% of $24.25 is 145.5c, rounded half up once for the rate.
    expect(p.byRate).toEqual([expect.objectContaining({ name: "E2E Idaho sales tax", ratePpm: 60000, base: 2425, tax: 146 })]);
    expect(p.tax).toBe(146);
    expect(p.total).toBe(p.subtotal + 146);
  });

  test("never taxes a line that says nothing about itself (older app builds)", async ({ request }) => {
    await request.put(`${base()}/organizations/salesTax/rules`, { headers: owner, data: { rules: { part: rateId, other: rateId } } });
    try {
      const res = await request.post(`${base()}/invoices/preview`, {
        headers: owner,
        data: { customer: { id: renterId }, items: [{ name: "E2E-Headset", qty: 1, unitPrice: 30000 }] },
      });
      const p = await unwrap(res);
      expect(p.tax).toBe(0);
    } finally {
      await request.put(`${base()}/organizations/salesTax/rules`, { headers: owner, data: { rules: { part: rateId } } });
    }
  });

  test("an exempt customer is charged no tax, and the bill says why", async ({ request }) => {
    const set = await request.put(`${base()}/orgUsers/${renterId}/taxExemption`, {
      headers: owner,
      data: { reason: "nonresident", note: "E2E ST-134NR on file" },
    });
    expect(set.ok(), await set.text()).toBeTruthy();
    try {
      const p = await unwrap(
        await request.post(`${base()}/invoices/preview`, { headers: owner, data: { customer: { id: renterId }, items: shopLines } })
      );
      expect(p.tax).toBe(0);
      expect(p.exemption.printed).toBe("Tax exempt: Nonresident aircraft (E2E ST-134NR on file)");
    } finally {
      await request.put(`${base()}/orgUsers/${renterId}/taxExemption`, { headers: owner, data: { reason: null } });
    }
  });

  test("refuses a create whose total moved since it was priced", async ({ request }) => {
    const res = await request.post(`${base()}/invoices`, {
      headers: owner,
      data: { customer: { id: renterId }, items: shopLines, expectedTotal: 1 },
    });
    expect(res.status(), await res.text()).toBe(409);
  });

  test("refuses a quantity that is not a whole number, before anything reaches Stripe", async ({ request }) => {
    const res = await request.post(`${base()}/invoices/preview`, {
      headers: owner,
      data: { customer: { id: renterId }, items: [{ name: "E2E-Labor", qty: 1.5, unitPrice: 9500, category: "labor" }] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toMatch(/whole number/);
  });
});

test.describe("who may change it", () => {
  test("an admin reads the settings but only the owner changes them", async ({ request }) => {
    const admin = await tokenFor(request, ACCOUNTS.admin);
    expect((await request.get(`${base()}/organizations/salesTax`, { headers: admin })).status()).toBe(200);
    const write = await request.put(`${base()}/organizations/salesTax/rules`, { headers: admin, data: { rules: {} } });
    expect(write.status()).toBe(403);
    const add = await request.post(`${base()}/organizations/salesTax/rates`, {
      headers: admin,
      data: { name: "E2E sneaky", ratePpm: 10000 },
    });
    expect(add.status()).toBe(403);
  });

  test("nobody below an admin can read the settings or anybody's exemption", async ({ request }) => {
    for (const role of ["instructor", "dispatcher", "student", "renter", "technician"] as const) {
      const h = await tokenFor(request, ACCOUNTS[role]);
      expect((await request.get(`${base()}/organizations/salesTax`, { headers: h })).status(), role).toBe(403);
      const theirs = await request.get(`${base()}/orgUsers/${renterId}/taxExemption`, { headers: h });
      const nobody = await request.get(`${base()}/orgUsers/${NO_SUCH_MEMBER}/taxExemption`, { headers: h });
      // Refused the same way for a real member and an id nobody has, so the door says nothing.
      expect([theirs.status(), await theirs.text()], role).toEqual([nobody.status(), await nobody.text()]);
      expect(theirs.status(), role).toBe(403);
      const write = await request.put(`${base()}/orgUsers/${renterId}/taxExemption`, { headers: h, data: { reason: "resale" } });
      expect(write.status(), role).toBe(403);
    }
  });

  test("an admin's exemption write on an id nobody has reads like another school's member", async ({ request }) => {
    const res = await request.put(`${base()}/orgUsers/${NO_SUCH_MEMBER}/taxExemption`, { headers: owner, data: { reason: "resale" } });
    expect(res.status()).toBe(404);
  });
});

test.describe("in the console", () => {
  test("the owner sets it up in Settings, Sales tax", async ({ page }) => {
    await page.goto("/settings?tab=sales-tax");
    await expect(page.getByText("Sales tax rates")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("sales-tax-rate").filter({ hasText: "E2E Idaho sales tax" })).toContainText("6%");
    await expect(page.getByRole("button", { name: /Add rate/ })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Tax on parts and goods" })).toContainText("E2E Idaho sales tax 6%");
    await expect(page.getByRole("combobox", { name: "Tax on labor" })).toContainText("Not taxed");
  });

  test("New invoice shows the tax the server will charge, line by line", async ({ page, request }) => {
    await page.goto("/billing");
    await page.getByRole("button", { name: "New invoice" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#invoice-customer").click();
    await page.getByPlaceholder("Search members…").fill("Test Renter");
    await page.getByRole("option", { name: /Test Renter/ }).first().click();

    await dialog.locator("#invoice-item-0").fill("E2E-Oil filter");
    await dialog.locator("#invoice-item-0").locator("xpath=following::input[@placeholder='0.00'][1]").fill("24.25");
    await dialog.locator("#invoice-item-0-category").click();
    await page.getByRole("option", { name: "Parts and goods" }).click();

    await expect(dialog.getByTestId("invoice-totals")).toContainText("E2E Idaho sales tax 6%", { timeout: 15_000 });
    await expect(dialog.getByLabel("Charge sales tax on item 1")).toBeChecked();

    const priced = await unwrap(
      await request.post(`${base()}/invoices/preview`, {
        headers: owner,
        data: { customer: { id: renterId }, items: [{ name: "E2E-Oil filter", qty: 1, unitPrice: 2425, category: "part" }] },
      })
    );
    await expect(dialog.getByTestId("invoice-total")).toHaveText(`$${(priced.total / 100).toFixed(2)}`);

    // Untick it: a warranty part. The tax row goes and the total drops to the subtotal.
    await dialog.getByLabel("Charge sales tax on item 1").click();
    await expect(dialog.getByTestId("invoice-total")).toHaveText(`$${(priced.subtotal / 100).toFixed(2)}`, { timeout: 15_000 });

    // 1.5 is refused out loud, never rewritten: it once became 15, ten times the bill.
    const qty = dialog.getByLabel("Quantity").first();
    await qty.fill("1.5");
    await expect(qty).toHaveValue("1.5");
    await expect(dialog.getByText(/Whole numbers from 1 to 99/)).toBeVisible();

    // And Create refuses: the line is not quietly left off the bill.
    let posted = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/invoices$/.test(new URL(r.url()).pathname)) posted = true;
    });
    await dialog.getByRole("button", { name: /Create invoice|Pricing/ }).click();
    await expect(dialog).toBeVisible();
    await expect(qty).toBeFocused();
    expect(posted).toBe(false);
  });

  test("an admin sees the settings but cannot change them", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/admin.json" });
    const page = await ctx.newPage();
    try {
      await page.goto("/settings?tab=sales-tax");
      await expect(page.getByText("Only the owner can change sales tax.")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: /Add rate/ })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
