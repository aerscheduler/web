import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";

/**
 * Console-adjacent API contracts that should page-alert if the schedule/billing
 * backend paths die. Runs through Playwright's request fixture so CI can reuse
 * the same local-only guard as the UI suite.
 */
test.describe("Schedule API lifecycle (owner)", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("create solo, patch, cancel via API", async ({ request }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
    });
    expect(auth.ok()).toBeTruthy();
    const token = (await auth.json()).auth.accessToken as string;
    const headers = { Authorization: `Bearer ${token}` };

    const resources = await request.get(`${base}/resources`, { headers });
    expect(resources.ok()).toBeTruthy();
    const resBody = await resources.json();
    const items = Array.isArray(resBody) ? resBody : (resBody.data ?? []);
    let plane: any = null;
    for (const r of items) {
      if (!r?.type?.plane || r.type.plane.grounded) continue;
      // Prefer a known-good trainer from the test fleet when present.
      if (r.type.plane.tailNumber === "N172TS") { plane = r; break; }
      if (!plane) plane = r;
    }
    expect(plane, "need a bookable plane").toBeTruthy();

    const orgUsers = await request.get(`${base}/orgUsers`, { headers });
    expect(orgUsers.ok()).toBeTruthy();
    const usersBody = await orgUsers.json();
    const users = Array.isArray(usersBody) ? usersBody : (usersBody.data ?? []);
    const student = users.find((u: any) => u?.user?.email === ACCOUNTS.student);
    const renter = users.find((u: any) => u?.user?.email === ACCOUNTS.renter);
    expect(renter || student).toBeTruthy();

    // Prefer renter: the seeded student is often grounded for unpaid invoices locally.
    const useRenter = !!renter;
    // Denver daytime (MDT/MST). Avoid UTC hours that fall outside 6 AM-10 PM local.
    // Probe several days for a free window; soft holds / prior e2e can pack today.
    let created: Awaited<ReturnType<typeof request.post>> | null = null;
    let notes = "";
    for (let dayOffset = 2; dayOffset <= 10; dayOffset++) {
      const probe = new Date(Date.now() + dayOffset * 864e5);
      const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(probe);
      const start = new Date(`${ymd}T10:00:00-06:00`);
      const end = new Date(start.getTime() + 3600_000);
      notes = `E2E-UI-web-${Date.now()}`;
      created = await request.post(`${base}/reservations/`, {
        headers,
        data: {
          title: useRenter ? "E2E Web Rental" : "E2E Web Solo",
          type: useRenter ? "rental" : "solo",
          start: start.toISOString(),
          end: end.toISOString(),
          timeZoneName: "America/Denver",
          notes,
          resource: { id: plane.id },
          personnel: useRenter
            ? { renters: [{ id: renter.id }] }
            : { students: [{ id: student.id }] },
        },
      });
      if (created.status() < 300) break;
    }
    expect(created!.status(), await created!.text()).toBeLessThan(300);
    const createdBody = await created!.json();
    const id = (createdBody.data ?? createdBody).id as number;
    expect(id).toBeTruthy();

    const detailRes = await request.get(`${base}/reservations/${id}`, { headers });
    expect(detailRes.ok()).toBeTruthy();
    const data = ((await detailRes.json()).data ?? {}) as any;
    const patched = await request.patch(`${base}/reservations/${id}`, {
      headers,
      data: {
        title: data.title,
        type: data.type,
        start: data.start,
        end: data.end,
        timeZoneName: data.timeZoneName ?? "America/Denver",
        notes: `${notes}-patched`,
        resource: { id: data.resource?.id ?? plane.id },
        personnel: {
          students: (data.personnel?.students ?? []).map((s: any) => ({ id: s.id })),
          instructors: (data.personnel?.instructors ?? []).map((s: any) => ({ id: s.id })),
          renters: (data.personnel?.renters ?? []).map((s: any) => ({ id: s.id })),
        },
      },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();

    const del = await request.delete(`${base}/reservations/${id}`, {
      headers,
      data: { reason: "E2E web cleanup", category: "booked_in_error" },
    });
    expect([200, 204]).toContain(del.status());
  });
});
