import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin, uiLogin } from "../helpers/api";
import { ACCOUNTS, AIRCRAFT_OWNER_EMAIL, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Murray spec 5's last statuses, driven through the console: an inspection marked NOT APPLICABLE
 * on one aircraft (with its reason), and one a job has booked in reading SCHEDULED, then IN
 * PROGRESS. As the technician on the inspection page and the list, as the outside owner on their
 * aircraft, and as a dispatcher, who is never told about the job.
 *
 * On the test owner's customer aircraft N4417T (seed-test-accounts.sql), with a rule that does
 * not ground, so nothing here takes an aircraft off the line for anybody else's test.
 */

const PREFIX = "E2E-NA-";
const REASON = "VFR only, no VOR receiver";
const api = () => apiProxyTarget().replace(/\/$/, "");
const auth = async (request: APIRequestContext, email: string) => ({ Authorization: `Bearer ${(await apiLogin(request, email)).auth.accessToken as string}` });

test.use({ storageState: ".auth/technician.json" });

test("not applicable with a reason, then Scheduled and In progress from the job, for each role", async ({ page, request }) => {
  const owner = await auth(request, ACCOUNTS.owner);
  // A run that died before its cleanup left its rule behind.
  const before = await (await request.get(`${api()}/maintenance/reminders/templates`, { headers: owner })).json();
  for (const t of before.data ?? []) {
    if (String(t.name ?? "").startsWith(PREFIX)) await request.delete(`${api()}/maintenance/reminders/templates/${t.id}`, { headers: owner, data: {} }).catch(() => undefined);
  }
  const planes = await (await request.get(`${api()}/resources/planes?scope=all`, { headers: owner })).json();
  const plane = (planes.data ?? planes).find((p: { type?: { plane?: { tailNumber?: string } } }) => p.type?.plane?.tailNumber === "N4417T");
  expect(plane, "the test org has the customer aircraft N4417T (seed-test-accounts.sql)").toBeTruthy();

  // A 30-day check last done 40 days ago: 10 days overdue.
  const name = `${PREFIX}VOR check ${Date.now()}`;
  const created = await request.post(`${api()}/maintenance/reminders/templates`, {
    headers: owner,
    data: { name, repeat: true, ground: false, remindDays: 30, remindDaysBefore: 7, templateResources: [{ id: plane.id, startDate: new Date(Date.now() - 40 * 86_400_000).toISOString() }] },
  });
  expect(created.ok()).toBeTruthy();
  const templateId = (await created.json()).data.id as number;
  let jobId: number | null = null;

  try {
    const list = await (await request.get(`${api()}/maintenance/reminders?resourceId=${plane.id}&resolved=false`, { headers: owner })).json();
    const id = (list.data ?? []).find((r: { template?: { id: number } }) => r.template?.id === templateId).id as number;

    // ---- The technician marks it not applicable, with the reason ----
    await page.goto(`/maintenance/inspections/${id}`);
    await dismissCookieBanner(page);
    const card = page.locator('[data-doc-shot="inspection-not-applicable"]');
    await expect(page.locator('[data-doc-shot="inspection-countdown"]')).toContainText("days over");
    await card.getByRole("button", { name: "Mark not applicable" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Why it doesn't apply").fill(REASON);
    const marked = page.waitForResponse((r) => r.url().endsWith(`/maintenance/reminders/${id}`) && r.request().method() === "PATCH");
    await dialog.getByRole("button", { name: "Mark not applicable" }).click();
    const res = await marked;
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toEqual({ notApplicable: true, notApplicableReason: REASON });
    expect((await res.json()).data.due.status).toBe("notApplicable");
    await expect(card).toContainText(REASON);
    await expect(card).toContainText("Marked");
    const countdown = page.locator('[data-doc-shot="inspection-countdown"]');
    await expect(countdown).toContainText("Not applicable");
    await expect(countdown).toContainText(REASON);

    // On the list grouped by status: its own group, with the reason.
    await page.goto(`/maintenance?group=status&q=${encodeURIComponent(name)}`);
    const row = page.getByTestId(`inspection-row-${id}`);
    await expect(row).toContainText("Not applicable");
    await expect(row).toContainText(REASON);

    // ---- A job books it in: Scheduled, then In progress ----
    const job = await request.post(`${api()}/work-orders`, { headers: owner, data: { resourceId: plane.id, status: "scheduled" } });
    expect(job.status()).toBe(201);
    jobId = (await job.json()).data.id as number;
    const label = (await job.json()).data.label as string;
    const item = await request.post(`${api()}/work-orders/${jobId}/items`, { headers: owner, data: { source: "requested", description: "VOR check", maintenanceReminderId: id } });
    expect(item.status()).toBe(201);

    await page.goto(`/maintenance/inspections/${id}`);
    const tag = page.getByTestId("inspection-work-tag").first();
    await expect(tag).toContainText("Scheduled");
    await expect(tag).toContainText(label);
    await request.patch(`${api()}/work-orders/${jobId}`, { headers: owner, data: { status: "received" } });
    await page.reload();
    await expect(page.getByTestId("inspection-work-tag").first()).toContainText("In progress");
    // The tag opens the job.
    await page.getByTestId("inspection-work-tag").first().click();
    await expect(page).toHaveURL(new RegExp(`/maintenance/work-orders/${jobId}`));

    // ---- A dispatcher reads the inspection, never the job ----
    const dispatcher = await auth(request, ACCOUNTS.dispatcher);
    const asDispatcher = (await (await request.get(`${api()}/maintenance/reminders/${id}`, { headers: dispatcher })).json()).data;
    expect(asDispatcher.work).toBeNull();
    expect(asDispatcher.workOrderItems).toBeUndefined();
    expect(asDispatcher.due.status).toBe("notApplicable");
    const dispatcherList = (await (await request.get(`${api()}/maintenance/reminders?resourceId=${plane.id}&resolved=false`, { headers: dispatcher })).json()).data;
    expect(dispatcherList.find((r: { id: number }) => r.id === id).work).toBeNull();
    const techList = (await (await request.get(`${api()}/maintenance/reminders?resourceId=${plane.id}&resolved=false`, { headers: await auth(request, ACCOUNTS.technician) })).json()).data;
    expect(techList.find((r: { id: number }) => r.id === id).work).toMatchObject({ status: "inProgress", job: { id: jobId, label } });

    // ---- The owner sees it on their aircraft: not applicable, the reason, the job ----
    const ownerPage = await page.context().browser()!.newPage({ storageState: { cookies: [], origins: [] } });
    try {
      await uiLogin(ownerPage, AIRCRAFT_OWNER_EMAIL);
      await ownerPage.goto(`/me/aircraft/${plane.id}`);
      const line = ownerPage.getByText(`${name}, not applicable: ${REASON}`);
      await expect(line).toBeVisible();
      await expect(ownerPage.getByTestId("inspection-work-tag").filter({ hasText: label })).toContainText("In progress");
    } finally {
      await ownerPage.close();
    }

    // ---- Put back: it reads overdue again ----
    await page.goto(`/maintenance/inspections/${id}`);
    await card.getByRole("button", { name: "It applies again" }).click();
    const back = page.waitForResponse((r) => r.url().endsWith(`/maintenance/reminders/${id}`) && r.request().method() === "PATCH");
    await page.getByRole("dialog").getByRole("button", { name: "It applies again" }).click();
    const backRes = await back;
    expect(backRes.request().postDataJSON()).toEqual({ notApplicable: false });
    expect((await backRes.json()).data.due.status).toBe("overdue");
    await expect(card.getByRole("button", { name: "Mark not applicable" })).toBeVisible();
  } finally {
    if (jobId) await request.delete(`${api()}/work-orders/${jobId}`, { headers: owner }).catch(() => undefined);
    await request.delete(`${api()}/maintenance/reminders/templates/${templateId}`, { headers: owner, data: {} }).catch(() => undefined);
  }
});
