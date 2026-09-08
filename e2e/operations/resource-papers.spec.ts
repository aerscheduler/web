import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner, pickByPlaceholder } from "../helpers/reservation-form";

/**
 * Aircraft papers locker: POH / W&B on a tail, visibility, role gates, book flow.
 */

const PREFIX = "E2E-PAP-";

test.describe.configure({ mode: "serial" });

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
  buffer: Buffer,
  mimeType = "image/jpeg"
) {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
  for (const [k, v] of Object.entries(signed.fields)) multipart[k] = v;
  multipart.file = { name: fileName, mimeType, buffer };
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

type PlaneRow = {
  id: number;
  type?: { plane?: { tailNumber?: string | null } | null; simulator?: { name?: string | null } | null };
};

async function firstPlane(request: APIRequestContext, base: string, headers: Record<string, string>) {
  const resources = await request.get(`${base}/resources`, { headers });
  const list = ((await resources.json()).data ?? []) as PlaneRow[];
  const planes = list.filter((r) => r.type?.plane);
  expect(planes.length, "no aircraft seeded").toBeGreaterThan(0);
  return (planes.find((r) => r.type?.plane?.tailNumber === "N172TS") ?? planes[0]) as PlaneRow;
}

function tailOf(plane: PlaneRow): string {
  return plane.type?.plane?.tailNumber || "N172TS";
}

async function firstSimulator(request: APIRequestContext, base: string, headers: Record<string, string>) {
  const resources = await request.get(`${base}/resources`, { headers });
  const list = ((await resources.json()).data ?? []) as PlaneRow[];
  const sim = list.find((r) => r.type?.simulator);
  expect(sim, "no simulator seeded").toBeTruthy();
  return sim as PlaneRow;
}

test.describe("aircraft papers", () => {
  test("owner can upload a booker POH; student can read it; student cannot upload", async ({
    request,
  }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const label = `${PREFIX}${Date.now()}`;

    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "poh", fileNames: ["poh.jpg"], label },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    expect(body.data).toHaveLength(1);
    expect(body.signedUrlData).toHaveLength(1);
    const uploaded = await uploadPresigned(request, body.signedUrlData[0], "poh.jpg", tinyJpeg());
    expect(uploaded.status(), await uploaded.text()).toBe(204);

    const fileId = body.data[0].id as number;

    const student = await login(request, ACCOUNTS.student);
    const listed = await request.get(`${student.base}/resources/${plane.id}/files`, {
      headers: student.headers,
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const studentRows = (await listed.json()).data as { id: number; label: string; fileUrls: string[] }[];
    const found = studentRows.find((r) => r.id === fileId);
    expect(found, "student should see booker POH").toBeTruthy();
    expect(found!.fileUrls.length).toBeGreaterThan(0);

    const forbidden = await request.post(`${student.base}/resources/${plane.id}/files`, {
      headers: student.headers,
      data: { category: "poh", fileNames: ["nope.jpg"] },
    });
    expect(forbidden.status()).toBe(403);

    const instructor = await login(request, ACCOUNTS.instructor);
    const instructorPost = await request.post(`${instructor.base}/resources/${plane.id}/files`, {
      headers: instructor.headers,
      data: { category: "poh", fileNames: ["nope.jpg"] },
    });
    expect(instructorPost.status()).toBe(403);

    const one = await request.get(`${student.base}/resources/${plane.id}`, { headers: student.headers });
    const papers = (await one.json()).data?.papers as { id: number }[] | undefined;
    expect(papers?.some((p) => p.id === fileId)).toBeTruthy();

    const del = await request.delete(`${owner.base}/resources/${plane.id}/files/${fileId}`, {
      headers: owner.headers,
    });
    expect(del.status()).toBe(204);
  });

  test("staff insurance is hidden from a student", async ({ request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const label = `${PREFIX}ins-${Date.now()}`;
    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "insurance", visibility: "staff", fileNames: ["ins.jpg"], label },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    const fileId = body.data[0].id as number;
    await uploadPresigned(request, body.signedUrlData[0], "ins.jpg", tinyJpeg());

    const student = await login(request, ACCOUNTS.student);
    const listed = await request.get(`${student.base}/resources/${plane.id}/files`, {
      headers: student.headers,
    });
    const rows = (await listed.json()).data as { id: number }[];
    expect(rows.some((r) => r.id === fileId)).toBeFalsy();

    const one = await request.get(`${student.base}/resources/${plane.id}`, { headers: student.headers });
    const papers = (await one.json()).data?.papers as { id: number }[] | undefined;
    expect(papers?.some((p) => p.id === fileId)).toBeFalsy();

    await request.delete(`${owner.base}/resources/${plane.id}/files/${fileId}`, {
      headers: owner.headers,
    });
  });

  test("client fileUrls is refused", async ({ request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: {
        category: "poh",
        fileNames: ["poh.jpg"],
        fileUrls: ["production/other-org/secret.pdf"],
      },
    });
    expect(created.status()).toBe(400);
  });

  test("dispatcher can upload", async ({ request }) => {
    const dispatcher = await login(request, ACCOUNTS.dispatcher);
    const plane = await firstPlane(request, dispatcher.base, dispatcher.headers);
    const created = await request.post(`${dispatcher.base}/resources/${plane.id}/files`, {
      headers: dispatcher.headers,
      data: { category: "weight_and_balance", fileNames: ["wb.jpg"], label: `${PREFIX}disp` },
    });
    expect(created.status(), await created.text()).toBe(201);
    const fileId = (await created.json()).data[0].id as number;
    await request.delete(`${dispatcher.base}/resources/${plane.id}/files/${fileId}`, {
      headers: dispatcher.headers,
    });
  });

  test("technician can upload", async ({ request }) => {
    const technician = await login(request, ACCOUNTS.technician);
    const plane = await firstPlane(request, technician.base, technician.headers);
    const created = await request.post(`${technician.base}/resources/${plane.id}/files`, {
      headers: technician.headers,
      data: { category: "other", fileNames: ["note.jpg"], label: `${PREFIX}tech` },
    });
    expect(created.status(), await created.text()).toBe(201);
    const fileId = (await created.json()).data[0].id as number;
    await request.delete(`${technician.base}/resources/${plane.id}/files/${fileId}`, {
      headers: technician.headers,
    });
  });

  test("sixth file in a category is refused", async ({ request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
        headers: owner.headers,
        data: { category: "other", fileNames: [`cap-${i}.jpg`], label: `${PREFIX}cap-${i}` },
      });
      expect(created.status(), await created.text()).toBe(201);
      ids.push((await created.json()).data[0].id as number);
    }
    const sixth = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "other", fileNames: ["cap-5.jpg"], label: `${PREFIX}cap-5` },
    });
    expect(sixth.status()).toBe(400);
    for (const id of ids) {
      await request.delete(`${owner.base}/resources/${plane.id}/files/${id}`, {
        headers: owner.headers,
      });
    }
  });

  test("owner sees Papers on the aircraft page and can add", async ({ page, request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);

    await page.goto(`/aircraft/${plane.id}?tab=papers`);
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("You can replace a stale file later.")).toBeVisible();
    await expect(page.getByText("cannot be deleted afterwards")).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles({
      name: "IMG_1234.HEIC",
      mimeType: "image/heic",
      buffer: tinyJpeg(),
    });
    await expect(page.getByText("IMG_1234.jpg")).toBeVisible();
  });

  test("Chrome skips a real HEIC it cannot decode", async ({ page, request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const fakeHeic = Buffer.alloc(16);
    fakeHeic.write("ftypheic", 4);

    await page.goto(`/aircraft/${plane.id}?tab=papers`);
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: "Add" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "sheet.HEIC",
      mimeType: "image/heic",
      buffer: fakeHeic,
    });
    await expect(
      page.getByText("Couldn't read that iPhone photo. Use the phone app, or export a JPEG from Photos.")
    ).toBeVisible();
    await expect(page.getByText("sheet.HEIC")).toHaveCount(0);
    await expect(page.getByText("sheet.jpg")).toHaveCount(0);
  });

  test("API accepts an iPhone HEIC name", async ({ request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const label = `${PREFIX}heic-${Date.now()}`;
    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "poh", fileNames: ["IMG_1234.HEIC"], label },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    expect(body.signedUrlData[0].fields["Content-Type"]).toBe("image/heic");
    const fileId = body.data[0].id as number;
    try {
      const uploaded = await uploadPresigned(
        request,
        body.signedUrlData[0],
        "IMG_1234.heic",
        tinyJpeg(),
        "image/heic"
      );
      expect(uploaded.status(), await uploaded.text()).toBe(204);
    } finally {
      await request.delete(`${owner.base}/resources/${plane.id}/files/${fileId}`, {
        headers: owner.headers,
      });
    }
  });

  test("renter cannot upload", async ({ request }) => {
    const renter = await login(request, ACCOUNTS.renter);
    const plane = await firstPlane(request, renter.base, renter.headers);
    const forbidden = await request.post(`${renter.base}/resources/${plane.id}/files`, {
      headers: renter.headers,
      data: { category: "poh", fileNames: ["nope.jpg"] },
    });
    expect(forbidden.status()).toBe(403);
  });

  test("simulator has no Papers tab", async ({ page, request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const sim = await firstSimulator(request, owner.base, owner.headers);
    await page.goto(`/aircraft/${sim.id}`);
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("navigation", { name: "Aircraft" }).getByRole("button", { name: "Papers" })
    ).toHaveCount(0);
  });
});

test.describe("aircraft papers as student", () => {
  test.use({ storageState: ".auth/student.json" });

  test("student Papers tab appears after a booker file exists", async ({ page, request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const label = `${PREFIX}ui-${Date.now()}`;
    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "poh", fileNames: ["poh.jpg"], label },
    });
    const body = await created.json();
    await uploadPresigned(request, body.signedUrlData[0], "poh.jpg", tinyJpeg());
    const fileId = body.data[0].id as number;
    try {
      await page.goto(`/aircraft/${plane.id}?tab=papers`);
      await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Add" })).toHaveCount(0);
    } finally {
      await request.delete(`${owner.base}/resources/${plane.id}/files/${fileId}`, {
        headers: owner.headers,
      });
    }
  });

  test("student sees Papers on /me/book for a tail with a booker file", async ({
    page,
    request,
  }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const label = `${PREFIX}book-${Date.now()}`;
    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "poh", fileNames: ["poh.jpg"], label },
    });
    const body = await created.json();
    await uploadPresigned(request, body.signedUrlData[0], "poh.jpg", tinyJpeg());
    const fileId = body.data[0].id as number;
    try {
      await page.goto("/me/book");
      await dismissCookieBanner(page);
      await pickByPlaceholder(page, /Select resource/i, new RegExp(tailOf(plane)), /Search fleet/i);
      await expect(page.getByRole("button", { name: /Papers/i })).toBeVisible({ timeout: 15_000 });
    } finally {
      await request.delete(`${owner.base}/resources/${plane.id}/files/${fileId}`, {
        headers: owner.headers,
      });
    }
  });

  test("staff-only file does not appear on student book", async ({ page, request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const plane = await firstPlane(request, owner.base, owner.headers);
    const label = `${PREFIX}staffbook-${Date.now()}`;
    const created = await request.post(`${owner.base}/resources/${plane.id}/files`, {
      headers: owner.headers,
      data: { category: "insurance", visibility: "staff", fileNames: ["ins.jpg"], label },
    });
    const body = await created.json();
    await uploadPresigned(request, body.signedUrlData[0], "ins.jpg", tinyJpeg());
    const fileId = body.data[0].id as number;

    try {
      await page.goto("/me/book");
      await dismissCookieBanner(page);
      const filesGot = page.waitForResponse(
        (r) =>
          r.request().method() === "GET" &&
          r.url().includes(`/resources/${plane.id}/files`) &&
          r.ok(),
        { timeout: 15_000 }
      );
      await pickByPlaceholder(page, /Select resource/i, new RegExp(tailOf(plane)), /Search fleet/i);
      await filesGot;
      await expect(page.getByRole("button", { name: /Papers/i })).toHaveCount(0);
    } finally {
      await request.delete(`${owner.base}/resources/${plane.id}/files/${fileId}`, {
        headers: owner.headers,
      });
    }
  });
});
