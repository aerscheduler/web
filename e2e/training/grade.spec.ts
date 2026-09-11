import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import { dismissCookieBanner } from "../helpers/reservation-form";
import {
  createDualReservation,
  dataOf,
  enrollStudent,
  enrollTestStudent,
  getProgress,
  liveRecords,
  loginAs,
  orgUserIdFor,
  saveRecord,
  seedCourse,
  signRecord,
} from "../helpers/training";

test.describe("Training grading UI (instructor)", () => {
  test.use({ storageState: ".auth/instructor.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("Save and sign from the enrollment lesson dialog", async ({
    page,
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);

    await page.goto(`/training/enrollments/${enrollmentId}?tab=lessons`);
    await dismissCookieBanner(page);
    await expect(page.getByText(course.lessonName)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^Grade$/ }).click();
    await expect(page.getByRole("button", { name: /Save and sign/i })).toBeVisible();
    const saveReq = page.waitForResponse(
      (r) =>
        r.url().includes("/training/records") &&
        r.request().method() === "POST" &&
        !r.url().includes("/sign"),
    );
    const signReq = page.waitForResponse(
      (r) =>
        r.url().includes("/training/records/") &&
        r.url().includes("/sign") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Save and sign/i }).click();
    expect((await saveReq).ok()).toBeTruthy();
    expect((await signReq).ok()).toBeTruthy();

    await expect(page.getByText("Complete")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Grade$/ })).toHaveCount(0);

    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const progress = await getProgress(request, instructor, enrollmentId);
    expect(progress.completedLessonIds).toContain(course.lessonId);
    const rec = liveRecords(progress, course.lessonId)[0];
    expect(rec.instructorSignedAt).toBeTruthy();
    expect(rec.grade).toBe("S");
  });

  test("close-out Grade this lesson signs one record and does not double-create", async ({
    page,
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId, studentOrgUserId } = await enrollTestStudent(
      request,
      owner,
      course.versionId,
    );
    const instructorId = await orgUserIdFor(owner, request, ACCOUNTS.instructor);
    const dual = await createDualReservation(
      request,
      owner,
      studentOrgUserId,
      instructorId,
    );
    expect(dual, "could not book a dual slot for close-out grading").toBeTruthy();

    await page.goto(`/schedule/reservations/${dual!.id}`);
    await dismissCookieBanner(page);
    await expect(page.getByText("Training record")).toBeVisible({ timeout: 25_000 });

    await page.getByText("Grade the lesson").click();
    const grader = page
      .locator("div.rounded-md.border")
      .filter({ hasText: course.name })
      .filter({ has: page.getByRole("button", { name: /Grade this lesson/i }) });
    await expect(grader.getByRole("button", { name: /Grade this lesson/i })).toBeVisible({
      timeout: 15_000,
    });
    await grader.getByRole("button", { name: /Grade this lesson/i }).click();
    await expect(page.getByRole("button", { name: /Sign lesson/i })).toBeVisible();

    const saveReq = page.waitForResponse(
      (r) =>
        r.url().includes("/training/records") &&
        r.request().method() === "POST" &&
        !r.url().includes("/sign"),
    );
    const signReq = page.waitForResponse(
      (r) =>
        r.url().includes("/training/records/") &&
        r.url().includes("/sign") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Sign lesson/i }).click();
    const saved = await saveReq;
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const signed = await signReq;
    expect(signed.ok(), await signed.text()).toBeTruthy();

    await expect(page.getByText(/signed and credited/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await dismissCookieBanner(page);
    await expect(page.getByText("Training record")).toBeVisible({ timeout: 25_000 });
    const fold = page.getByRole("button", { name: /Grade the lesson/i });
    await expect(fold).not.toContainText("0 of ");

    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const progress = await getProgress(request, instructor, enrollmentId);
    expect(progress.completedLessonIds).toContain(course.lessonId);
    const rec = liveRecords(progress, course.lessonId)[0];
    expect(liveRecords(progress, course.lessonId)).toHaveLength(1);
    expect(rec.reservationId).toBe(dual!.id);
  });

  test("close-out does not offer Grade this lesson when the syllabus is already finished", async ({
    page,
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId, studentOrgUserId } = await enrollTestStudent(
      request,
      owner,
      course.versionId,
    );
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 12,
    });
    const savedJson = await saved.json();
    expect(saved.ok(), JSON.stringify(savedJson)).toBeTruthy();
    const recordId = dataOf(savedJson).id as number;
    const signed = await signRecord(request, instructor, recordId);
    const signedJson = await signed.json();
    expect(signed.ok(), JSON.stringify(signedJson)).toBeTruthy();

    const instructorId = await orgUserIdFor(owner, request, ACCOUNTS.instructor);
    const dual = await createDualReservation(
      request,
      owner,
      studentOrgUserId,
      instructorId,
    );
    expect(dual, "could not book a dual slot for a finished syllabus").toBeTruthy();

    await page.goto(`/schedule/reservations/${dual!.id}`);
    await dismissCookieBanner(page);
    await expect(page.getByText("Training record")).toBeVisible({ timeout: 25_000 });
    await page.getByText("Grade the lesson").click();
    await expect(page.getByText("Syllabus complete").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Grade this lesson/i })).toHaveCount(0);
  });

  test("close-out Sign lesson reuses the unsigned draft already on the booking", async ({
    page,
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId, studentOrgUserId } = await enrollTestStudent(
      request,
      owner,
      course.versionId,
    );
    const instructorId = await orgUserIdFor(owner, request, ACCOUNTS.instructor);
    const dual = await createDualReservation(
      request,
      owner,
      studentOrgUserId,
      instructorId,
    );
    expect(dual, "could not book a dual slot for close-out reuse").toBeTruthy();

    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const draft = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      instructionDeciHours: 5,
      reservationId: dual!.id,
    });
    expect(draft.ok(), await draft.text()).toBeTruthy();
    const draftId = dataOf(await draft.json()).id as number;

    await page.goto(`/schedule/reservations/${dual!.id}`);
    await dismissCookieBanner(page);
    await expect(page.getByText("Training record")).toBeVisible({ timeout: 25_000 });

    await page.getByText("Grade the lesson").click();
    const grader = page
      .locator("div.rounded-md.border")
      .filter({ hasText: course.name })
      .filter({ has: page.getByRole("button", { name: /Grade this lesson/i }) });
    await grader.getByRole("button", { name: /Grade this lesson/i }).click();
    await expect(page.getByRole("button", { name: /Sign lesson/i })).toBeVisible();

    const saveReq = page.waitForResponse(
      (r) =>
        r.url().includes("/training/records") &&
        r.request().method() === "POST" &&
        !r.url().includes("/sign"),
    );
    const signReq = page.waitForResponse(
      (r) =>
        r.url().includes("/training/records/") &&
        r.url().includes("/sign") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Sign lesson/i }).click();
    const saved = await saveReq;
    expect(saved.ok(), await saved.text()).toBeTruthy();
    expect(dataOf(await saved.json()).id).toBe(draftId);
    const signed = await signReq;
    expect(signed.ok(), await signed.text()).toBeTruthy();

    await expect(
      page.getByText(new RegExp(`signed and credited to ${course.name}`)),
    ).toBeVisible({ timeout: 15_000 });

    const progress = await getProgress(request, instructor, enrollmentId);
    expect(progress.completedLessonIds).toContain(course.lessonId);
    const recs = liveRecords(progress, course.lessonId);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe(draftId);
    expect(recs[0].reservationId).toBe(dual!.id);
    expect(recs[0].instructorSignedAt).toBeTruthy();
  });
});

test.describe("Training grading UI (owner)", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("rental booking does not show Training record", async ({ page, request }) => {
    const { owner, course } = await seedCourse(request);
    const renterId = await orgUserIdFor(owner, request, ACCOUNTS.renter);
    await enrollStudent(request, owner, course.versionId, renterId);

    const resources = await request.get(`${owner.base}/resources`, {
      headers: owner.headers,
    });
    const items = (await resources.json()).data ?? [];
    const plane = items.find(
      (r: { type?: { plane?: { grounded?: boolean; tailNumber?: string } } }) =>
        r.type?.plane && !r.type.plane.grounded,
    );
    expect(plane, "need a bookable plane").toBeTruthy();

    let created: Awaited<ReturnType<typeof request.post>> | null = null;
    const notes = `E2E-TRN-rental-${Date.now()}`;
    for (let dayOffset = 3; dayOffset <= 12; dayOffset++) {
      const probe = new Date(Date.now() + dayOffset * 864e5);
      const ymd = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(probe);
      const start = new Date(`${ymd}T11:00:00-06:00`);
      created = await request.post(`${owner.base}/reservations/`, {
        headers: owner.headers,
        data: {
          title: "E2E Training Rental",
          type: "rental",
          start: start.toISOString(),
          end: new Date(start.getTime() + 3600_000).toISOString(),
          timeZoneName: "America/Denver",
          notes,
          resource: { id: plane.id },
          personnel: { renters: [{ id: renterId }] },
        },
      });
      if (created.status() < 300) break;
    }
    expect(created!.status(), await created!.text()).toBeLessThan(300);
    const id = (await created!.json()).data.id as number;

    await page.goto(`/schedule/reservations/${id}`);
    await dismissCookieBanner(page);
    await expect(page.locator("body")).toContainText(/rental|E2E Training Rental/i, {
      timeout: 20_000,
    });
    await expect(page.getByText("Training record")).toHaveCount(0);
  });
});
