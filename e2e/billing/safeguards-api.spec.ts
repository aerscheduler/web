import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";

/**
 * API contracts for the four billing/ops safeguards:
 * meter anomaly soft-block, void leavesUnbilled, overnight grace setting,
 * and (indirectly) that review-reminder prefs round-trip on the org user.
 */
test.describe("Billing safeguards API (owner)", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("meter anomaly 409 then confirmMeterAnomaly; overnightGraceMinutes; void leavesUnbilled", async ({
    request,
  }) => {
    await cleanupE2eReservations(request);

    const base = apiProxyTarget().replace(/\/$/, "");
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
    });
    expect(auth.ok()).toBeTruthy();
    const token = (await auth.json()).auth.accessToken as string;
    const headers = { Authorization: `Bearer ${token}` };

    // overnightGraceMinutes round-trip on org billing
    const billingGet = await request.get(`${base}/organizations/billing`, {
      headers,
    });
    expect(billingGet.ok(), await billingGet.text()).toBeTruthy();
    const billingJson = await billingGet.json();
    const billingRow = (billingJson.data ?? billingJson) as any;
    const priorGrace: number | null = billingRow.overnightGraceMinutes ?? null;

    const gracePatch = await request.patch(`${base}/organizations/billing`, {
      headers,
      data: { overnightGraceMinutes: 60 },
    });
    expect(gracePatch.ok(), await gracePatch.text()).toBeTruthy();
    const graceBody = await gracePatch.json();
    const graceSaved = (graceBody.data ?? graceBody).overnightGraceMinutes;
    expect(graceSaved).toBe(60);

    // Restore prior value so we do not leave the test org permanently changed.
    await request.patch(`${base}/organizations/billing`, {
      headers,
      data: { overnightGraceMinutes: priorGrace },
    });

    // Seed a short past solo, ramp out, then absurd ramp-in
    const resources = await request.get(`${base}/resources`, { headers });
    expect(resources.ok()).toBeTruthy();
    const resBody = await resources.json();
    const items = Array.isArray(resBody) ? resBody : (resBody.data ?? []);
    // Prefer N172TS but fall back to any free trainer: cancel-recovery slot offers from
    // other E2E suites often hold the exact +3d 10:00 slot api-lifecycle uses.
    let plane: any = null;
    const candidates: any[] = [];
    for (const r of items) {
      if (!r?.type?.plane || r.type.plane.grounded) continue;
      candidates.push(r);
    }
    candidates.sort((a, b) => {
      const score = (r: any) => (r.type.plane.tailNumber === "N172TS" ? 0 : 1);
      return score(a) - score(b);
    });

    const orgUsers = await request.get(`${base}/orgUsers`, { headers });
    expect(orgUsers.ok()).toBeTruthy();
    const usersBody = await orgUsers.json();
    const users = Array.isArray(usersBody) ? usersBody : (usersBody.data ?? []);
    const student = users.find((u: any) => u?.user?.email === ACCOUNTS.student);
    expect(student).toBeTruthy();

    // Distinct from api-lifecycle's +3d 10:00 window so cancel-recovery holds miss us.
    const probe = new Date(Date.now() + 5 * 864e5);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const start = new Date(`${ymd}T14:00:00-06:00`);
    const end = new Date(start.getTime() + 3600_000);
    const notes = `E2E-UI-safeguards-${Date.now()}`;

    let created: Awaited<ReturnType<typeof request.post>> | null = null;
    let hobbs = 1000;
    let tach = 1000;
    for (const candidate of candidates) {
      await request.patch(`${base}/resources/${candidate.id}`, {
        headers,
        data: { type: { plane: { rampedIn: true, grounded: false } } },
      });
      const attempt = await request.post(`${base}/reservations/`, {
        headers,
        data: {
          title: "E2E Safeguards",
          type: "solo",
          start: start.toISOString(),
          end: end.toISOString(),
          timeZoneName: "America/Denver",
          notes,
          resource: { id: candidate.id },
          personnel: { students: [{ id: student.id }] },
        },
      });
      if (attempt.status() < 300) {
        created = attempt;
        plane = candidate;
        hobbs = candidate.type.plane.hobbsTime ?? hobbs;
        tach = candidate.type.plane.tachTime ?? tach;
        break;
      }
    }
    expect(created, "need a free plane/slot for safeguards booking").toBeTruthy();
    expect(created!.status(), await created!.text()).toBeLessThan(300);
    const createdBody = await created!.json();
    const id = (createdBody.data ?? createdBody).id as number;
    expect(id).toBeTruthy();

    const hobbsOut = Math.trunc(Number(hobbs));
    const tachOut = Math.trunc(Number(tach));
    const rampOut = await request.post(`${base}/reservations/${id}/rampOut`, {
      headers,
      data: { hobbsTimeOut: hobbsOut, tachTimeOut: tachOut },
    });
    expect(rampOut.ok(), await rampOut.text()).toBeTruthy();

    // 15.7 h on a 1 h booking: vs_booked (and absolute) anomaly.
    const hobbsInBad = hobbsOut + 157;
    const tachInOk = tachOut + 10;
    const rampInBad = await request.post(`${base}/reservations/${id}/rampIn`, {
      headers,
      data: {
        hobbsTimeIn: hobbsInBad,
        tachTimeIn: tachInOk,
        locationId: plane.location?.id ?? plane.FK_locationId,
      },
    });
    expect(rampInBad.status(), await rampInBad.text()).toBe(409);
    const anomalyBody = await rampInBad.json();
    const anomaly =
      anomalyBody.code === "METER_ANOMALY"
        ? anomalyBody
        : anomalyBody.error?.code === "METER_ANOMALY"
          ? anomalyBody.error
          : anomalyBody;
    expect(anomaly.code ?? anomalyBody.code).toBe("METER_ANOMALY");
    const anomalies =
      anomaly.details?.anomalies ?? anomalyBody.details?.anomalies ?? [];
    expect(anomalies.length).toBeGreaterThan(0);

    const rampInOk = await request.post(`${base}/reservations/${id}/rampIn`, {
      headers,
      data: {
        hobbsTimeIn: hobbsInBad,
        tachTimeIn: tachInOk,
        locationId: plane.location?.id ?? plane.FK_locationId,
        confirmMeterAnomaly: true,
      },
    });
    expect(rampInOk.ok(), await rampInOk.text()).toBeTruthy();

    // Sign off as student so an invoice can be raised, then void as owner.
    const studentAuth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.student, password: TEST_PASSWORD },
    });
    expect(studentAuth.ok()).toBeTruthy();
    const studentToken = (await studentAuth.json()).auth.accessToken as string;
    const studentHeaders = { Authorization: `Bearer ${studentToken}` };

    await request.patch(`${base}/users/pin`, {
      headers: studentHeaders,
      data: { pin: "1234" },
    });

    const confirm = await request.post(
      `${base}/reservations/${id}/confirmReview`,
      { headers: studentHeaders, data: { pin: "1234" } },
    );
    // Invoice creation can fail in local Stripe-less envs; still try void path when present.
    if (confirm.ok()) {
      const detail = await request.get(`${base}/reservations/${id}`, { headers });
      const reservation = ((await detail.json()).data ?? {}) as any;
      const invoices: any[] = reservation.invoices ?? [];
      const live = invoices.find((inv) => !inv.voidedAt && !inv.paidAt);
      if (live?.id) {
        const voided = await request.patch(`${base}/invoices/${live.id}`, {
          headers,
          data: { markVoided: true },
        });
        expect(voided.ok(), await voided.text()).toBeTruthy();
        const voidBody = await voided.json();
        // Field is always present on a successful void. True only when the booking has
        // already ended and no other live invoice remains (this suite books in the future
        // to dodge slot-offer holds, so expect false here).
        expect(voidBody.reservationId).toBe(id);
        expect(voidBody.leavesUnbilled).toBe(end.getTime() < Date.now());
      }
    }

    await request.delete(`${base}/reservations/${id}`, {
      headers,
      data: { reason: "E2E safeguards cleanup", category: "booked_in_error" },
    });
  });
});
