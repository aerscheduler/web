import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import {
  authAs,
  cleanupAdFixtures,
  dismissCookieBanner,
  givenDueAd,
  recordsFor,
} from "../helpers/airworthiness";

/**
 * Working files on an OPEN inspection: attach, list paperclip, copy onto the
 * compliance record at sign-off, then clear so they do not follow the next cycle.
 */

const PREFIX = "E2E-RMF-";

function tinyJpeg(): Buffer {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAACKAAB//9k=",
    "base64"
  );
}

async function uploadPresigned(
  request: APIRequestContext,
  signed: { url: string; fields: Record<string, string> },
  fileName: string,
  buffer: Buffer
) {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
  for (const [k, v] of Object.entries(signed.fields)) multipart[k] = v;
  multipart.file = { name: fileName, mimeType: "image/jpeg", buffer };
  return request.post(signed.url, { multipart });
}

async function login(
  request: APIRequestContext,
  email: string
): Promise<{ base: string; headers: Record<string, string> }> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(auth.ok(), `auth failed for ${email}`).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

async function openReminder(
  request: APIRequestContext,
  base: string,
  headers: Record<string, string>,
  templateName: string
) {
  const list = await request.get(
    `${base}/maintenance/reminders?resolved=false&q=${encodeURIComponent(templateName)}`,
    { headers }
  );
  expect(list.ok(), await list.text()).toBeTruthy();
  const rows = ((await list.json()).data ?? []) as {
    id: number;
    hasAttachments?: boolean;
    fileUrls?: string[];
    template?: { name?: string };
    due?: { name?: string };
  }[];
  const row = rows.find((r) => (r.due?.name ?? r.template?.name) === templateName);
  expect(row, `open reminder missing for ${templateName}`).toBeTruthy();
  return row!;
}

test.describe("inspection files", () => {
  test.afterAll(async ({ request }) => {
    await cleanupAdFixtures(request);
  });

  test("owner can attach a JPEG; list shows paperclip without keys; sign-off copies onto the record", async ({
    request,
  }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const fixture = await givenDueAd(request, owner, { label: `${PREFIX}copy` });
    const reminder = await openReminder(request, owner.base, owner.headers, fixture.name);
    expect(reminder.hasAttachments).toBe(false);
    expect(reminder.fileUrls).toBeUndefined();

    const attached = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}/files`, {
      headers: owner.headers,
      data: { fileNames: ["packing-slip.jpg"] },
    });
    expect(attached.status(), await attached.text()).toBe(201);
    const body = await attached.json();
    expect(body.signedUrlData).toHaveLength(1);
    expect(body.data?.hasAttachments).toBe(true);

    const uploaded = await uploadPresigned(
      request,
      body.signedUrlData[0],
      "packing-slip.jpg",
      tinyJpeg()
    );
    expect(uploaded.status(), await uploaded.text()).toBe(204);

    const listed = await openReminder(request, owner.base, owner.headers, fixture.name);
    expect(listed.hasAttachments).toBe(true);
    expect(listed.fileUrls).toBeUndefined();

    const one = await request.get(`${owner.base}/maintenance/reminders/${reminder.id}`, {
      headers: owner.headers,
    });
    expect(one.ok()).toBeTruthy();
    const detail = (await one.json()).data;
    expect(detail.fileUrls.length).toBeGreaterThan(0);
    expect(detail.fileUrls[0]).toMatch(/^https?:\/\//);

    const file = await request.get(detail.fileUrls[0]);
    expect(file.status()).toBe(200);

    const injected = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}`, {
      headers: owner.headers,
      data: {
        completedAt: new Date().toISOString(),
        completedHours: 11000,
        methodOfCompliance: "Should not accept a client key.",
        mechanicName: "Dale Whitfield",
        fileUrls: ["production/other-org/secret.pdf"],
      },
    });
    expect(injected.status()).toBe(400);

    const signed = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}`, {
      headers: owner.headers,
      data: {
        completedAt: new Date().toISOString(),
        completedHours: 11000,
        methodOfCompliance: "Visual inspection. Packing slip attached.",
        mechanicName: "Dale Whitfield",
        mechanicCertificateNumber: "3421887",
        mechanicCertificateType: "IA",
        tachAtCompliance: 11000,
      },
    });
    expect(signed.status(), await signed.text()).toBe(200);

    const records = await recordsFor(request, owner, fixture.ref);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].fileUrls?.length).toBeGreaterThan(0);
    expect(records[0].fileUrls[0]).toMatch(/^https?:\/\//);

    const next = await openReminder(request, owner.base, owner.headers, fixture.name);
    expect(next.id).not.toBe(reminder.id);
    expect(next.hasAttachments).toBe(false);
  });

  test("refuses client fileUrls, junk types, a sixth file, and student writes", async ({
    request,
  }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const fixture = await givenDueAd(request, owner, { label: `${PREFIX}gate` });
    const reminder = await openReminder(request, owner.base, owner.headers, fixture.name);

    const injected = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}/files`, {
      headers: owner.headers,
      data: { fileUrls: ["production/other-org/secret.pdf"] },
    });
    expect(injected.status()).toBe(400);

    const gif = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}/files`, {
      headers: owner.headers,
      data: { fileNames: ["clip.gif"] },
    });
    expect(gif.status()).toBe(400);

    const five = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}/files`, {
      headers: owner.headers,
      data: { fileNames: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"] },
    });
    expect(five.status(), await five.text()).toBe(201);

    const sixth = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}/files`, {
      headers: owner.headers,
      data: { fileNames: ["f.jpg"] },
    });
    expect(sixth.status()).toBe(400);

    const student = await login(request, ACCOUNTS.student);
    const studentPost = await request.post(
      `${student.base}/maintenance/reminders/${reminder.id}/files`,
      { headers: student.headers, data: { fileNames: ["student.jpg"] } }
    );
    expect(studentPost.status()).toBe(403);

    const dispatcher = await login(request, ACCOUNTS.dispatcher);
    const dispatcherPost = await request.post(
      `${dispatcher.base}/maintenance/reminders/${reminder.id}/files`,
      { headers: dispatcher.headers, data: { fileNames: ["desk.jpg"] } }
    );
    expect(dispatcherPost.status()).toBe(403);

    const tech = await login(request, ACCOUNTS.technician);
    const techFixture = await givenDueAd(request, owner, { label: `${PREFIX}tech` });
    const techReminder = await openReminder(request, owner.base, owner.headers, techFixture.name);
    const techPost = await request.post(
      `${tech.base}/maintenance/reminders/${techReminder.id}/files`,
      { headers: tech.headers, data: { fileNames: ["shop.jpg"] } }
    );
    expect(techPost.status(), await techPost.text()).toBe(201);
  });

  test("Files on the inspection row opens the sheet after an attach", async ({ page, request }) => {
    const owner = await authAs(request, "owner");
    const fixture = await givenDueAd(request, owner, { label: `${PREFIX}ui` });
    const reminder = await openReminder(request, owner.base, owner.headers, fixture.name);

    const attached = await request.post(`${owner.base}/maintenance/reminders/${reminder.id}/files`, {
      headers: owner.headers,
      data: { fileNames: ["rib-photo.jpg"] },
    });
    expect(attached.status(), await attached.text()).toBe(201);
    const body = await attached.json();
    await uploadPresigned(request, body.signedUrlData[0], "rib-photo.jpg", tinyJpeg());

    await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent(fixture.name)}`);
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: "Inspection files" })).toBeVisible();
    await page.getByRole("button", { name: "Inspection files" }).click();
    await expect(page.getByRole("heading", { name: "Inspection files" })).toBeVisible();
    await expect(page.getByRole("link", { name: "rib-photo.jpg" })).toBeVisible();
  });
});
