import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * Photos and PDFs on a squawk: create, notes, list paperclip, role gates.
 *
 * Squawks are append-only, so fixtures stay in the test org under an E2E-SQF- title.
 */

const PREFIX = "E2E-SQF-";

/** Tiny JPEG the local store will accept. Magic bytes so an <img> can decode it. */
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

async function firstPlane(request: APIRequestContext, base: string, headers: Record<string, string>) {
  const resources = await request.get(`${base}/resources`, { headers });
  const list = (await resources.json()).data ?? [];
  const plane = list.find((r: { type?: { plane?: unknown } }) => r.type?.plane);
  expect(plane, "no aircraft seeded").toBeTruthy();
  return plane as { id: number };
}

async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.count()) await decline.first().click().catch(() => undefined);
}

test.describe("squawk files", () => {
  test("create with fileNames returns signedUrlData and list hasAttachments", async ({
    request,
  }) => {
    const { base, headers } = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, base, headers);
    const title = `${PREFIX}${Date.now()}`;

    const created = await request.post(`${base}/maintenance/squawks`, {
      headers,
      data: {
        title,
        description: "Left brake photo from the ramp.",
        resourceId: plane.id,
        fileNames: ["crack.jpg"],
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    expect(body.data?.title).toBe(title);
    expect(body.signedUrlData).toHaveLength(1);
    expect(body.signedUrlData[0].url).toMatch(/\/local-s3$/);
    expect(body.signedUrlData[0].fields.key).toBeTruthy();
    expect(body.data?.hasAttachments).toBe(true);

    const uploaded = await uploadPresigned(
      request,
      body.signedUrlData[0],
      "crack.jpg",
      tinyJpeg()
    );
    expect(uploaded.status(), await uploaded.text()).toBe(204);

    const list = await request.get(`${base}/maintenance/squawks?q=${encodeURIComponent(title)}`, {
      headers,
    });
    expect(list.ok()).toBeTruthy();
    const rows = (await list.json()).data ?? [];
    const row = rows.find((r: { title?: string }) => r.title === title);
    expect(row, "created squawk missing from list").toBeTruthy();
    expect(row.hasAttachments).toBe(true);
    expect(row.fileUrls).toBeUndefined();
    expect(row.comments).toBeUndefined();

    const one = await request.get(`${base}/maintenance/squawks/${body.data.id}`, { headers });
    expect(one.ok()).toBeTruthy();
    const detail = (await one.json()).data;
    expect(detail.fileUrls.length).toBeGreaterThan(0);
    expect(detail.fileUrls[0]).toMatch(/^https?:\/\//);
    expect(detail.fileUrls[0]).toContain("/local-s3/");

    const file = await request.get(detail.fileUrls[0]);
    expect(file.status(), await file.text()).toBe(200);
    expect(file.headers()["content-type"]).toMatch(/image\/jpeg/);
    expect((await file.body()).length).toBeGreaterThan(0);
  });

  test("refuses client fileUrls, junk types, and a sixth file", async ({ request }) => {
    const { base, headers } = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, base, headers);

    const injected = await request.post(`${base}/maintenance/squawks`, {
      headers,
      data: {
        title: `${PREFIX}inj`,
        description: "should not store a foreign key",
        resourceId: plane.id,
        fileUrls: ["production/other-org/secret.pdf"],
      },
    });
    expect(injected.status()).toBe(400);
    expect((await injected.json()).message).toMatch(/fileNames/);

    const gif = await request.post(`${base}/maintenance/squawks`, {
      headers,
      data: {
        title: `${PREFIX}gif`,
        description: "gif is not allowed",
        resourceId: plane.id,
        fileNames: ["clip.gif"],
      },
    });
    expect(gif.status()).toBe(400);

    const six = await request.post(`${base}/maintenance/squawks`, {
      headers,
      data: {
        title: `${PREFIX}six`,
        description: "too many files",
        resourceId: plane.id,
        fileNames: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"],
      },
    });
    expect(six.status()).toBe(400);
  });

  test("a student can attach on create and cannot add a note", async ({ request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const student = await login(request, ACCOUNTS.student);

    const created = await request.post(`${student.base}/maintenance/squawks`, {
      headers: student.headers,
      data: {
        title: `${PREFIX}stu`,
        description: "Student photo of the defect.",
        resourceId: plane.id,
        fileNames: ["student.jpg"],
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).data.id;

    const note = await request.post(`${student.base}/maintenance/squawks/${id}/comments`, {
      headers: student.headers,
      data: { body: "trying to comment", fileNames: ["note.jpg"] },
    });
    expect(note.status()).toBe(403);

    const one = await request.get(`${student.base}/maintenance/squawks/${id}`, {
      headers: student.headers,
    });
    expect(one.ok(), await one.text()).toBeTruthy();
    expect((await one.json()).data?.id).toBe(id);

    const board = await request.get(`${student.base}/maintenance/squawks`, {
      headers: student.headers,
    });
    expect(board.status()).toBe(403);
  });

  test("a technician can add a photo-only note, and empty still fails", async ({ request }) => {
    const { base, headers } = await login(request, ACCOUNTS.technician);
    const plane = await firstPlane(request, base, headers);
    const created = await request.post(`${base}/maintenance/squawks`, {
      headers,
      data: {
        title: `${PREFIX}tech`,
        description: "Needs a parts photo on the thread.",
        resourceId: plane.id,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).data.id;

    const empty = await request.post(`${base}/maintenance/squawks/${id}/comments`, {
      headers,
      data: { body: "   " },
    });
    expect(empty.status()).toBe(400);

    const photo = await request.post(`${base}/maintenance/squawks/${id}/comments`, {
      headers,
      data: { body: "", fileNames: ["part.jpg"] },
    });
    expect(photo.status(), await photo.text()).toBe(201);
    const comment = await photo.json();
    expect(comment.signedUrlData).toHaveLength(1);
    expect(comment.data.body).toBe("");

    const list = await request.get(`${base}/maintenance/squawks?q=${encodeURIComponent(`${PREFIX}tech`)}`, {
      headers,
    });
    const rows = (await list.json()).data ?? [];
    const row = rows.find((r: { id: number }) => r.id === id);
    expect(row?.hasAttachments).toBe(true);
  });

  test("Log a squawk offers Attach, and a file-bearing row shows a paperclip", async ({
    page,
    request,
  }) => {
    const { base, headers } = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, base, headers);
    const title = `${PREFIX}ui-${Date.now()}`;
    const created = await request.post(`${base}/maintenance/squawks`, {
      headers,
      data: {
        title,
        description: "UI paperclip fixture.",
        resourceId: plane.id,
        fileNames: ["ui.jpg"],
      },
    });
    expect(created.status()).toBe(201);

    await page.goto("/maintenance?view=open");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /Log a squawk/i }).click();
    await expect(page.getByRole("button", { name: /^Attach$/ })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByPlaceholder(/Search squawks/i).fill(title);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Has attachments").first()).toBeVisible();
  });

  test("picking a sixth file tells you the cap, and logging with a photo stores it", async ({
    page,
    request,
  }) => {
    const { base, headers } = await login(request, ACCOUNTS.owner);
    await firstPlane(request, base, headers);
    const title = `${PREFIX}ui-upload-${Date.now()}`;

    await page.goto("/maintenance?view=open");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /Log a squawk/i }).click();
    await expect(page.getByRole("button", { name: /^Attach$/ })).toBeVisible();

    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `p${i}.jpg`,
      mimeType: "image/jpeg",
      buffer: tinyJpeg(),
    }));
    await page.locator('input[type="file"]').setInputFiles(six);
    await expect(page.getByText("You can attach up to 5 files.")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Log a squawk" })).toHaveCount(0);

    await page.getByRole("button", { name: /Log a squawk/i }).click();
    await expect(page.getByRole("button", { name: /^Attach$/ })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "crack.jpg",
      mimeType: "image/jpeg",
      buffer: tinyJpeg(),
    });
    await page.locator("#squawk-title").fill(title);
    await page.locator("#squawk-description").fill("Photo from the ramp, local store.");
    await page.getByRole("combobox").filter({ hasText: "Select an aircraft" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /^Log squawk$/ }).click();
    await expect(page.getByText("Squawk logged.")).toBeVisible({ timeout: 20_000 });

    const list = await request.get(`${base}/maintenance/squawks?q=${encodeURIComponent(title)}`, {
      headers,
    });
    expect(list.ok()).toBeTruthy();
    const rows = (await list.json()).data ?? [];
    const row = rows.find((r: { title?: string }) => r.title === title);
    expect(row, "UI-created squawk missing from list").toBeTruthy();
    expect(row.hasAttachments).toBe(true);

    const one = await request.get(`${base}/maintenance/squawks/${row.id}`, { headers });
    const detail = (await one.json()).data;
    expect(detail.fileUrls?.[0]).toContain("/local-s3/");
    const file = await request.get(detail.fileUrls[0]);
    expect(file.status()).toBe(200);
  });

  test.describe("member can read a write-up", () => {
    test.use({ storageState: ".auth/student.json" });

    test("student stays on the squawk page and sees it on the aircraft", async ({
      page,
      request,
    }) => {
      const owner = await login(request, ACCOUNTS.owner);
      const plane = await firstPlane(request, owner.base, owner.headers);
      const title = `${PREFIX}member-${Date.now()}`;
      const created = await request.post(`${owner.base}/maintenance/squawks`, {
        headers: owner.headers,
        data: {
          title,
          description: "Student should be able to read this write-up.",
          resourceId: plane.id,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const id = (await created.json()).data.id as number;

      await page.goto(`/maintenance/squawks/${id}`);
      await dismissCookieBanner(page);
      await expect(page).toHaveURL(new RegExp(`/maintenance/squawks/${id}`));
      await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /^Resolve$/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Verify$/ })).toHaveCount(0);

      await page.goto(`/aircraft/${plane.id}?tab=squawks`);
      await dismissCookieBanner(page);
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    });
  });
});
