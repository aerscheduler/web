import { test, expect } from "@playwright/test";
import { apiLogin, uiLogin } from "../helpers/api";
import { ACCOUNTS, AIRCRAFT_OWNER_EMAIL, apiProxyTarget } from "../helpers/env";

/**
 * An outside aircraft owner asks for work with everything the request can say (Murray spec 7):
 * that it is grounded, where it is, its Hobbs and tach now, and a photo. The request opens a
 * Requested job, the times go on the aircraft's meter log, and the shop and the owner both see
 * what was said. Needs seed-test-accounts.sql (test-aircraft-owner owns N4417T).
 */

test.use({ storageState: { cookies: [], origins: [] } });

const api = () => apiProxyTarget().replace(/\/$/, "");

test("an owner asks for work: grounded, where it is, its times and a photo", async ({ page, request }) => {
  const owner = await apiLogin(request, AIRCRAFT_OWNER_EMAIL);
  const ownerAuth = { Authorization: `Bearer ${owner.auth.accessToken}` };
  const list = await (await request.get(`${api()}/owner/aircraft`, { headers: ownerAuth })).json();
  const aircraft = list.data.find((a: { tailNumber: string }) => a.tailNumber === "N4417T");
  expect(aircraft, "the test owner owns N4417T (seed-test-accounts.sql)").toBeTruthy();
  // A little more than on record, so the reading moves the aircraft without a question.
  const hobbs = ((aircraft.hobbsTime as number) + 4) / 10;
  const tach = ((aircraft.tachTime as number) + 3) / 10;

  await uiLogin(page, AIRCRAFT_OWNER_EMAIL);
  await page.goto("/me");
  await page.getByRole("button", { name: "Request work" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Annual is due next month/).fill("E2E-request: oil change and look at the left mag.");
  await dialog.getByRole("button", { name: /^Is it grounded\?/ }).click();
  await page.getByRole("menuitemradio", { name: /^Grounded/ }).click();
  await dialog.getByLabel("Where is it now?").fill("KBOI, hangar 12");
  await dialog.getByLabel("Hobbs now").fill(hobbs.toFixed(1));
  await dialog.getByLabel("Tach now").fill(tach.toFixed(1));
  await dialog.getByTestId("work-order-file-input").setInputFiles({ name: "left-mag.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await expect(dialog.getByRole("list", { name: "Files to send" })).toContainText("left-mag.jpg");

  const sent = page.waitForResponse((r) => r.url().includes(`/owner/aircraft/${aircraft.id}/requests`) && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Send request" }).click();
  const res = await sent;
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.data.aircraftTimes).toBe("updated");
  expect(body.signedUrlData).toHaveLength(1);
  const jobId: number = body.data.id;

  try {
    await expect(page.getByText(`${body.data.label} sent to the shop`)).toBeVisible();

    // The owner reads back what they said on their job.
    await page.goto(`/me/jobs/${jobId}`);
    const facts = page.getByTestId("request-facts");
    await expect(facts).toContainText("Grounded");
    await expect(facts).toContainText("KBOI, hangar 12");
    await expect(facts).toContainText(`Hobbs ${hobbs.toLocaleString("en-US", { minimumFractionDigits: 1 })}`);

    // The shop sees it on the job, and the aircraft's times moved to the reading.
    const tech = await apiLogin(request, ACCOUNTS.technician);
    const techAuth = { Authorization: `Bearer ${tech.auth.accessToken}` };
    const job = (await (await request.get(`${api()}/work-orders/${jobId}`, { headers: techAuth })).json()).data;
    expect(job.ownerRequest).toMatchObject({ grounded: true, location: "KBOI, hangar 12" });
    expect(job.requestReading).toMatchObject({ hobbsTime: Math.round(hobbs * 10), tachTime: Math.round(tach * 10) });
    const log = (await (await request.get(`${api()}/resources/${aircraft.id}/meters`, { headers: techAuth })).json()).data;
    expect(log.current).toMatchObject({ hobbsTime: Math.round(hobbs * 10), tachTime: Math.round(tach * 10) });
    expect(log.entries[0]).toMatchObject({ note: "With the request", workOrder: { id: jobId } });
  } finally {
    // Never invoiced, so the owner of the organization can remove it.
    const admin = await apiLogin(request, ACCOUNTS.owner);
    await request.delete(`${api()}/work-orders/${jobId}`, { headers: { Authorization: `Bearer ${admin.auth.accessToken}` } });
  }
});
