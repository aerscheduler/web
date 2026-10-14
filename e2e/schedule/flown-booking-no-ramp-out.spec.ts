import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/airworthiness";

/**
 * A flight that has come back must never be ramped out again.
 *
 * NexwingAero, 2026-10-12: a solo was flown, ramped in and signed off. The admin opened it
 * from the Flight log report, whose panel built the booking from a bare `{ id }` stub and so
 * offered Ramp out. Pressing it marked the aircraft out with no booking that could bring it
 * back, every later ramp-out was refused, and "Post to ledger" failed with no reason.
 *
 * Covers both halves: the server refuses the second ramp-out, and the report's panel shows
 * the real, billed booking with no Ramp out button.
 */

async function login(request: APIRequestContext, email: string) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.post(`${base}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return { base, headers: { Authorization: `Bearer ${(await res.json()).auth.accessToken}` } };
}

test.describe("A flown booking", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("is not ramped out again, from the API or the Flight log panel", async ({ page, request }) => {
    const owner = await login(request, ACCOUNTS.owner);
    const student = await login(request, ACCOUNTS.student);

    const resources = (await (await request.get(`${owner.base}/resources`, { headers: owner.headers })).json()) as any;
    const planes = ((resources.data ?? resources) as any[]).filter(
      (r) => r?.type?.plane && !r.type.plane.grounded && r.type.plane.rampedIn
    );
    const users = (await (await request.get(`${owner.base}/orgUsers`, { headers: owner.headers })).json()) as any;
    const me = ((users.data ?? users) as any[]).find((u) => u?.user?.email === ACCOUNTS.student);
    expect(me, "need the test student").toBeTruthy();

    // A flight in the past two weeks. A flown booking can't be cancelled, so the cleanup
    // never frees the time an earlier run used, and it is the STUDENT's time that runs out
    // (one test student, bookable only inside opening hours). Hourly slots back two weeks
    // leave room for hundreds of runs. The report below is filtered to this booking's day.
    const hoursAgoSlots = Array.from({ length: 14 * 24 }, (_, i) => 3 + i);
    let id: number | null = null;
    let plane: any = null;
    let startedAt: Date | null = null;
    for (const p of planes) {
      for (const hoursAgo of hoursAgoSlots) {
        const start = new Date(Date.now() - hoursAgo * 3600_000);
        const res = await request.post(`${owner.base}/reservations/`, {
          headers: owner.headers,
          data: {
            title: "E2E-Flown solo",
            type: "solo",
            start: start.toISOString(),
            end: new Date(start.getTime() + 50 * 60_000).toISOString(),
            timeZoneName: "America/Chicago",
            notes: `E2E-flown-${Date.now()}`,
            resource: { id: p.id },
            personnel: { students: [{ id: me.id }] },
          },
        });
        if (res.status() < 300) {
          const body = (await res.json()) as any;
          id = (body.data ?? body).id;
          plane = p;
          startedAt = start;
          break;
        }
      }
      if (id) break;
    }
    test.skip(!id, "no free slot for the test student in the past two weeks");

    // Readings of this run's own, so its Flight log row can be told apart from earlier
    // runs' identical "Test Student, N46132, 1.0 h" rows on the same day.
    const bump = 1 + Math.floor(Math.random() * 1500);
    const h = (plane.type.plane.hobbsTime as number) + bump;
    const t = (plane.type.plane.tachTime as number) + bump;
    const post = (who: typeof owner, path: string, data: unknown) =>
      request.post(`${who.base}${path}`, { headers: who.headers, data });
    expect((await post(student, `/reservations/${id}/rampOut`, { hobbsTimeOut: h, tachTimeOut: t })).ok()).toBeTruthy();
    expect((await post(student, `/reservations/${id}/rampIn`, { hobbsTimeIn: h + 10, tachTimeIn: t + 10 })).ok()).toBeTruthy();

    // The stray second ramp-out is refused, and the aircraft stays in.
    const stray = await post(owner, `/reservations/${id}/rampOut`, { hobbsTimeOut: h + 10, tachTimeOut: t + 10 });
    expect(stray.status()).toBe(400);
    expect(((await stray.json()) as any).code).toBe("RESERVATION_ALREADY_RAMPED_IN");
    const after = (await (await request.get(`${owner.base}/resources`, { headers: owner.headers })).json()) as any;
    const again = ((after.data ?? after) as any[]).find((r) => r.id === plane.id);
    expect(again.type.plane.rampedIn).toBe(true);

    // The Flight log panel shows the real booking, with no Ramp out. The page widens the
    // window to whole days, so the row is picked by this run's Hobbs out cell, not "1.0 h":
    // the first 1.0 h row was often an earlier run's booking.
    const from = new Date(startedAt!.getTime() - 60_000).toISOString();
    const to = new Date(startedAt!.getTime() + 60_000).toISOString();
    await page.goto(`/reports?report=flights&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const hobbsOutCell = page.getByText(`${(h / 10).toFixed(1)} h`, { exact: true }).first();
    await expect(hobbsOutCell).toBeVisible({ timeout: 15_000 });
    // A fresh browser shows the cookie banner. Headless, the row click then opened no panel
    // (a real browser opens it either way), so dismiss it the way the airworthiness specs do.
    await dismissCookieBanner(page);
    await hobbsOutCell.click();
    await expect(page.getByText("E2E-Flown solo").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Ramp out$/ })).toHaveCount(0);
  });
});
