import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import {
  apiBase,
  authAs,
  ensureOfferPolicyForE2e,
  restoreOfferPolicy,
} from "../helpers/slot-offers";

/**
 * Standby preferences as a student sees them: the "first dibs" callout on My schedule,
 * the Standby modal on Profile > Standby, the rows it produces, Withdraw, and the
 * "Suggest open slots to me" switch. Asserts what the console SENDS, not just what it shows.
 */
test.describe("Standby preferences (student)", () => {
  test.use({ storageState: ".auth/student.json" });

  let priorPolicy: Record<string, unknown> | null = null;

  async function withdrawAll(request: APIRequestContext) {
    const student = await authAs(request, ACCOUNTS.student);
    const res = await request.get(`${apiBase()}/standby/me`, { headers: student.headers });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const rows = (body.data ?? body) as { id: number; status: string; kind: string }[];
    for (const row of rows) {
      if (row.status === "active" && (row.kind === "standing" || row.kind === "open_window")) {
        await request.delete(`${apiBase()}/standby/${row.id}`, { headers: student.headers });
      }
    }
    return student;
  }

  test.beforeAll(async ({ request }) => {
    const owner = await authAs(request, ACCOUNTS.owner);
    priorPolicy = await ensureOfferPolicyForE2e(request, owner.headers);
    await withdrawAll(request);
  });

  test.afterAll(async ({ request }) => {
    try {
      const student = await withdrawAll(request);
      await request.put(`${apiBase()}/standby/suggestions`, {
        headers: student.headers,
        data: { enabled: true },
      });
      if (priorPolicy) {
        const owner = await authAs(request, ACCOUNTS.owner);
        await restoreOfferPolicy(request, owner.headers, priorPolicy);
      }
    } catch (err) {
      console.warn("standby-preferences afterAll cleanup:", err);
    }
  });

  async function addPreference(
    page: Page,
    day: string,
    time: string,
    custom?: { from: string; to: string }
  ) {
    await page.getByRole("button", { name: "Add preference" }).click();
    const dialog = page.getByRole("dialog", { name: "Standby" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: day, exact: true }).click();
    await dialog.locator("#standby-time").click();
    await page.getByRole("option", { name: time }).click();
    if (custom) {
      await dialog.locator("#standby-from").click();
      await page.getByRole("option", { name: custom.from, exact: true }).click();
      await dialog.locator("#standby-to").click();
      await page.getByRole("option", { name: custom.to, exact: true }).click();
    }
    const posted = page.waitForResponse(
      (r) => r.url().endsWith("/standby") && r.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const res = await posted;
    expect(res.status(), await res.text()).toBe(201);
    await expect(dialog).toBeHidden();
    return (res.request().postDataJSON() as { kind: string; criteria: Record<string, unknown> });
  }

  test("callout links to Standby, the modal saves exact criteria, rows sort and withdraw", async ({
    page,
  }) => {
    // The callout shows while the student has no preference, and links to the editor.
    await page.goto("/me/schedule");
    const callout = page.getByTestId("first-dibs-callout");
    await expect(callout).toBeVisible();
    await callout.getByRole("link").click();
    await expect(page).toHaveURL(/\/me\/profile\?tab=standby/);
    await expect(page.getByText("No preferences yet")).toBeVisible();

    // Saving with no day is refused before anything is sent.
    await page.getByRole("button", { name: "Add preference" }).click();
    let posts = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/standby") && r.method() === "POST") posts += 1;
    });
    const empty = page.getByRole("dialog", { name: "Standby" });
    await empty.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Choose at least one day.")).toBeVisible();
    expect(posts).toBe(0);
    await empty.getByRole("button", { name: "Cancel" }).click();
    await expect(empty).toBeHidden();

    // Saturday afternoons, then Tuesday 2 to 5 PM: two preferences, exact criteria.
    const sat = await addPreference(page, "Saturday", "Afternoons, noon to 5 PM");
    expect(sat).toEqual({
      kind: "standing",
      criteria: { daysOfWeek: [6], localTimeStart: "12:00", localTimeEnd: "17:00" },
    });
    const tue = await addPreference(page, "Tuesday", "Custom hours", { from: "2:00 PM", to: "5:00 PM" });
    expect(tue).toEqual({
      kind: "standing",
      criteria: { daysOfWeek: [2], localTimeStart: "14:00", localTimeEnd: "17:00" },
    });

    // Rows read in the 12-hour clock and sort Monday first, whatever order they were added.
    const rows = page.getByTestId("standby-preferences").locator("li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Tue · 2:00 PM to 5:00 PM");
    await expect(rows.nth(1)).toContainText("Sat · 12:00 PM to 5:00 PM");

    // With a preference in place the callout is gone.
    await page.goto("/me/schedule");
    await expect(page.getByLabel("Search calendar")).toBeVisible();
    await expect(page.getByTestId("first-dibs-callout")).toHaveCount(0);

    // Withdraw both from the rows.
    await page.goto("/me/profile?tab=standby");
    const list = page.getByTestId("standby-preferences");
    await expect(list.locator("li")).toHaveCount(2);
    const deleted = page.waitForResponse(
      (r) => /\/standby\/\d+$/.test(r.url()) && r.request().method() === "DELETE"
    );
    await list.locator("li").first().getByRole("button", { name: "Withdraw" }).click();
    expect((await deleted).ok()).toBeTruthy();
    await expect(list.locator("li")).toHaveCount(1);
    await expect(list.locator("li").first()).toContainText("Sat");
    const deletedLast = page.waitForResponse(
      (r) => /\/standby\/\d+$/.test(r.url()) && r.request().method() === "DELETE"
    );
    await list.locator("li").first().getByRole("button", { name: "Withdraw" }).click();
    expect((await deletedLast).ok()).toBeTruthy();
    await expect(page.getByText("No preferences yet")).toBeVisible();
  });

  test("the suggestions switch writes both ways", async ({ page }) => {
    await page.goto("/me/profile?tab=standby");
    const toggle = page.getByRole("switch", { name: "Suggest open slots to me" });
    await expect(toggle).toBeChecked();

    for (const enabled of [false, true]) {
      const put = page.waitForResponse(
        (r) => r.url().endsWith("/standby/suggestions") && r.request().method() === "PUT"
      );
      await toggle.click();
      const res = await put;
      expect(res.ok(), await res.text()).toBeTruthy();
      expect(res.request().postDataJSON()).toEqual({ enabled });
      await expect(toggle).toBeChecked({ checked: enabled });
    }
  });

  test("the X hides the callout on this browser", async ({ page }) => {
    await page.goto("/me/schedule");
    const callout = page.getByTestId("first-dibs-callout");
    await expect(callout).toBeVisible();
    await callout.getByRole("button", { name: "Dismiss" }).click();
    await expect(callout).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Search calendar")).toBeVisible();
    await expect(page.getByTestId("first-dibs-callout")).toHaveCount(0);
  });
});
