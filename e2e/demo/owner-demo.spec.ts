import { test, expect } from "@playwright/test";
import { dismissCookieBanner } from "../helpers/airworthiness";

/**
 * The public demo as the shop's customer: an aircraft owner from outside the organization.
 *
 * A visitor picks "Aircraft owner" on /demo and lands on that person's home, /me, with what the
 * shop is waiting on them for. They open a job holding a finding to answer, and an unpaid
 * invoice, where Pay is off: the demo runs against live Stripe, so the console says so and never
 * asks /stripe for a payment.
 *
 * Needs the local API with the demo pool seeded (server/prisma/seed-demo-org.sql), whose demo
 * lists one claimed outside owner last among its identities.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("a demo visitor tries it as the aircraft owner", async ({ page }) => {
  // A payment starts with GET /stripe/invoice/:id (the PaymentIntent). The demo must never ask.
  const stripeCalls: string[] = [];
  page.on("request", (req) => {
    if (/\/stripe\/invoice\//.test(new URL(req.url()).pathname)) stripeCalls.push(`${req.method()} ${req.url()}`);
  });

  await page.goto("/demo");
  await dismissCookieBanner(page);

  // The card is matched to the server's outside owner, and the switch lands as that person.
  const switched = page.waitForResponse((r) => r.url().includes("/demo/switch") && r.request().method() === "POST");
  await page.getByTestId("demo-role-aircraft-owner").click();
  const envelope = await (await switched).json();
  expect(envelope.demo, "the switch answered without a demo block").toBeTruthy();
  const owner = (envelope.demo.identities as { orgUserId: number; roles: string[]; external?: boolean }[]).find((i) => i.external);
  expect(owner, "the demo lists no outside aircraft owner").toBeTruthy();
  expect(owner!.roles).toEqual([]);
  expect(envelope.demo.orgUserId).toBe(owner!.orgUserId);

  await expect(page).toHaveURL(/\/me$/, { timeout: 30_000 });
  await expect(page.getByTestId("demo-banner")).toContainText("Aircraft owner");

  // Needs you: a finding to answer and a bill to pay.
  const needs = page.locator('[data-doc-shot="owner-needs-you"]');
  await expect(needs).toContainText("Needs you", { timeout: 30_000 });
  await expect(needs).toContainText(/waiting on your answer/);

  // The job waiting on an answer: the findings, each with Approve.
  await needs.getByRole("link", { name: "Review" }).first().click();
  await expect(page).toHaveURL(/\/me\/jobs\/\d+/);
  const waiting = page.locator('[data-doc-shot="owner-waiting-on-you"]');
  await expect(waiting).toBeVisible();
  await expect(waiting.getByRole("button", { name: /^Approve: / }).first()).toBeVisible();
  // The demo refuses uploads, so the owner is not offered one.
  await expect(page.getByRole("button", { name: "Attach" })).toHaveCount(0);

  // An unpaid invoice: Pay is there, and off, with the one line saying why.
  await page.goto("/me");
  await needs.getByRole("link", { name: "View and pay" }).first().click();
  await expect(page).toHaveURL(/\/me\/invoices\?invoice=\d+/);
  const pay = page.getByRole("button", { name: /^Pay \$/ });
  await expect(pay).toBeVisible();
  await expect(pay).toBeDisabled();
  await expect(page.getByTestId("invoice-pay-note")).toHaveText("Paying is turned off in the demo.");
  await expect(page.getByText(/may not have online payments/)).toHaveCount(0);
  expect(stripeCalls, "the demo asked Stripe for a payment").toEqual([]);

  // Hand the sandbox back to the pool rather than leave it leased until it lapses.
  await page.getByTestId("demo-banner").getByRole("button", { name: "Exit" }).click();
  await expect(page).toHaveURL(/\/login/);
});
