import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  amendRecord,
  countersignRecord,
  createDualReservation,
  dataOf,
  endEnrollment,
  enrollStudent,
  enrollTestStudent,
  getProgress,
  liveRecords,
  loginAs,
  orgUserIdFor,
  readJson,
  saveRecord,
  seedCourse,
  signRecord,
  unsignedRecords,
} from "../helpers/training";

/**
 * HTTP edges the first lifecycle spec does not cover: closed enrollments,
 * countersign, amend, role matrix, notes gate, reservationId omit vs null.
 */
test.describe("Training API edges", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("sign is refused after terminate and posts no credits", async ({ request }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const draft = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const draftId = dataOf(await draft.json()).id as number;

    const ended = await endEnrollment(request, owner, enrollmentId, "terminated", "E2E left");
    expect(ended.status(), await ended.text()).toBe(200);

    const signed = await signRecord(request, instructor, draftId);
    expect(signed.status()).toBe(409);
    expect((await readJson(signed)).message).toMatch(/terminated/i);

    const after = await getProgress(request, owner, enrollmentId);
    const rec = liveRecords(after, course.lessonId)[0];
    expect(rec.instructorSignedAt).toBeFalsy();
    expect(
      (after.enrollment.credits ?? []).filter(
        (c: { lessonRecordId?: number }) => c.lessonRecordId === draftId,
      ),
    ).toHaveLength(0);
  });

  test("concurrent end and sign: terminated enrollment never has credits without a signature", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const draft = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      instructionDeciHours: 5,
    });
    const draftId = dataOf(await draft.json()).id as number;

    const [ended, signed] = await Promise.all([
      endEnrollment(request, owner, enrollmentId, "terminated", "E2E left"),
      signRecord(request, instructor, draftId),
    ]);
    expect(ended.status(), await ended.text()).toBe(200);
    expect([200, 409]).toContain(signed.status());

    const after = await getProgress(request, owner, enrollmentId);
    expect(after.enrollment.status).toBe("terminated");
    const rec = liveRecords(after, course.lessonId)[0];
    const credits = (after.enrollment.credits ?? []).filter(
      (c: { lessonRecordId?: number }) => c.lessonRecordId === draftId,
    );
    if (rec.instructorSignedAt) {
      expect(signed.status()).toBe(200);
      expect(credits.length).toBeGreaterThan(0);
    } else {
      expect(signed.status()).toBe(409);
      expect(credits).toHaveLength(0);
    }
  });

  test("concurrent graduate and terminate: only one status change sticks", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const [grad, ended] = await Promise.all([
      request.post(`${owner.base}/training/enrollments/${enrollmentId}/graduate`, {
        headers: owner.headers,
        data: {},
      }),
      endEnrollment(request, owner, enrollmentId, "terminated", "E2E left"),
    ]);
    const oks = [grad, ended].filter((r) => r.ok());
    const conflicts = [grad, ended].filter((r) => r.status() === 409);
    expect(oks).toHaveLength(1);
    expect(conflicts.length + oks.length).toBe(2);

    const after = await getProgress(request, owner, enrollmentId);
    expect(["graduated", "terminated"]).toContain(after.enrollment.status);
    if (after.enrollment.status === "graduated") {
      expect(after.enrollment.terminatedAt).toBeNull();
    } else {
      expect(after.enrollment.graduatedAt).toBeNull();
    }
  });

  test("amend, countersign, and certify are refused after terminate", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      instructionDeciHours: 5,
    });
    const recordId = dataOf(await saved.json()).id as number;
    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();
    expect(
      (await endEnrollment(request, owner, enrollmentId, "terminated", "E2E left")).ok(),
    ).toBeTruthy();

    const amended = await amendRecord(request, instructor, recordId, "hours were night");
    expect(amended.status()).toBe(409);

    const student = await loginAs(request, ACCOUNTS.student);
    const countersigned = await countersignRecord(request, student, recordId);
    expect(countersigned.status()).toBe(409);

    const certify = await request.post(
      `${owner.base}/training/enrollments/${enrollmentId}/certify`,
      { headers: owner.headers, data: {} },
    );
    expect(certify.status()).toBe(409);
  });

  test("student cannot end an enrollment; cancelled is 400; already ended is 409", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const student = await loginAs(request, ACCOUNTS.student);

    const asStudent = await endEnrollment(request, student, enrollmentId, "terminated");
    expect(asStudent.status()).toBe(403);

    const cancelled = await endEnrollment(request, owner, enrollmentId, "cancelled");
    expect(cancelled.status()).toBe(400);

    const first = await endEnrollment(request, owner, enrollmentId, "terminated", "done");
    expect(first.status(), await first.text()).toBe(200);
    const again = await endEnrollment(request, owner, enrollmentId, "terminated", "again");
    expect(again.status()).toBe(409);
  });

  test("student countersigns only after the instructor, and only their own record", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const student = await loginAs(request, ACCOUNTS.student);

    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const recordId = dataOf(await saved.json()).id as number;

    const early = await countersignRecord(request, student, recordId);
    expect(early.status()).toBe(409);

    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();

    const asInstructor = await countersignRecord(request, instructor, recordId);
    expect(asInstructor.status()).toBe(403);

    const ok = await countersignRecord(request, student, recordId);
    expect(ok.status(), await ok.text()).toBe(200);

    const twice = await countersignRecord(request, student, recordId);
    expect(twice.status()).toBe(409);

    const { course: other } = await seedCourse(request);
    const renterId = await orgUserIdFor(owner, request, ACCOUNTS.renter);
    const otherEnrollment = await enrollStudent(request, owner, other.versionId, renterId);
    const otherSaved = await saveRecord(request, instructor, {
      enrollmentId: otherEnrollment,
      lessonId: other.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const otherId = dataOf(await otherSaved.json()).id as number;
    expect((await signRecord(request, instructor, otherId)).ok()).toBeTruthy();
    const peek = await countersignRecord(request, student, otherId);
    expect(peek.status()).toBe(403);
  });

  test("instructor amends a signed lesson; student and dispatcher cannot", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      instructionDeciHours: 5,
    });
    const recordId = dataOf(await saved.json()).id as number;
    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();

    const student = await loginAs(request, ACCOUNTS.student);
    expect((await amendRecord(request, student, recordId, "night was day")).status()).toBe(
      403,
    );
    const dispatcher = await loginAs(request, ACCOUNTS.dispatcher);
    expect(
      (await amendRecord(request, dispatcher, recordId, "night was day")).status(),
    ).toBe(403);

    const short = await amendRecord(request, instructor, recordId, "x");
    expect(short.status()).toBe(400);

    const ok = await amendRecord(request, instructor, recordId, "night was day");
    expect(ok.status(), await ok.text()).toBe(200);
    const amendmentId = dataOf(await ok.json()).id as number;
    expect(amendmentId).not.toBe(recordId);

    const progress = await getProgress(request, owner, enrollmentId);
    const original = (progress.enrollment.lessonRecords ?? []).find(
      (r: { id: number }) => r.id === recordId,
    );
    expect(original.instructorSignedAt).toBeTruthy();
    const draft = unsignedRecords(progress, course.lessonId);
    expect(draft).toHaveLength(1);
    expect(draft[0].id).toBe(amendmentId);

    const twice = await amendRecord(request, instructor, recordId, "again");
    expect(twice.status()).toBe(409);

    const withdrawn = await countersignRecord(request, student, recordId);
    expect(withdrawn.status()).toBe(409);
    expect((await readJson(withdrawn)).message).toMatch(/amended/i);
  });

  test("admin can grade; renter and technician cannot; renter can read their own enrollment", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const admin = await loginAs(request, ACCOUNTS.admin);
    const saved = await saveRecord(request, admin, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const recordId = dataOf(await saved.json()).id as number;
    expect((await signRecord(request, admin, recordId)).ok()).toBeTruthy();

    const technician = await loginAs(request, ACCOUNTS.technician);
    expect(
      (
        await saveRecord(request, technician, {
          enrollmentId,
          lessonId: course.lessonId,
          grade: "S",
        })
      ).status(),
    ).toBe(403);
    const techGet = await request.get(
      `${technician.base}/training/enrollments/${enrollmentId}`,
      { headers: technician.headers },
    );
    expect(techGet.status()).toBe(403);

    const renterId = await orgUserIdFor(owner, request, ACCOUNTS.renter);
    const { course: renterCourse } = await seedCourse(request);
    const renterEnrollment = await enrollStudent(
      request,
      owner,
      renterCourse.versionId,
      renterId,
    );
    const renter = await loginAs(request, ACCOUNTS.renter);
    const mine = await request.get(
      `${renter.base}/training/enrollments/${renterEnrollment}`,
      { headers: renter.headers },
    );
    expect(mine.ok(), await mine.text()).toBeTruthy();
    const theirs = await request.get(
      `${renter.base}/training/enrollments/${enrollmentId}`,
      { headers: renter.headers },
    );
    expect(theirs.status()).toBe(403);
    expect(
      (
        await saveRecord(request, renter, {
          enrollmentId: renterEnrollment,
          lessonId: renterCourse.lessonId,
          grade: "S",
        })
      ).status(),
    ).toBe(403);
  });

  test("requiresNotes blocks sign until notes are on the record", async ({ request }) => {
    const { owner, course } = await seedCourse(request, { requiresNotes: true });
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const recordId = dataOf(await saved.json()).id as number;
    const blocked = await signRecord(request, instructor, recordId);
    expect(blocked.status()).toBe(409);
    expect((await readJson(blocked)).message).toMatch(/notes/i);

    const withNotes = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      notes: "Steep turns to ACS.",
    });
    expect(withNotes.ok(), await withNotes.text()).toBeTruthy();
    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();
  });

  test("omitting reservationId keeps the booking link; null clears it", async ({
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
    expect(dual, "need a dual slot to pin reservationId").toBeTruthy();
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      reservationId: dual!.id,
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    let progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)[0].reservationId).toBe(dual!.id);

    const keep = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 11,
    });
    expect(keep.ok(), await keep.text()).toBeTruthy();
    progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)[0].reservationId).toBe(dual!.id);

    const clear = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 11,
      reservationId: null,
    });
    expect(clear.ok(), await clear.text()).toBeTruthy();
    progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)[0].reservationId).toBeNull();
  });

  test("hand-posted credit is refused after terminate", async ({ request }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    expect(
      (await endEnrollment(request, owner, enrollmentId, "terminated", "E2E left")).ok(),
    ).toBeTruthy();

    const posted = await request.post(`${owner.base}/training/credits`, {
      headers: owner.headers,
      data: {
        enrollmentId,
        requirementId: course.reqs.dual,
        deciHours: 10,
        source: "transfer_61",
        notes: "prior school",
        occurredAt: "2026-08-15T12:00:00.000Z",
      },
    });
    expect(posted.status()).toBe(409);
    expect((await readJson(posted)).message).toMatch(/terminated/i);

    const progress = await getProgress(request, owner, enrollmentId);
    expect(progress.enrollment.credits ?? []).toHaveLength(0);
  });

  test("sign is refused after transfer and after graduate", async ({ request }) => {
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const transferred = await seedCourse(request);
    const { enrollmentId: transferId } = await enrollTestStudent(
      request,
      transferred.owner,
      transferred.course.versionId,
    );
    const tSaved = await saveRecord(request, instructor, {
      enrollmentId: transferId,
      lessonId: transferred.course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const tRecord = dataOf(await tSaved.json()).id as number;
    expect(
      (
        await endEnrollment(
          request,
          transferred.owner,
          transferId,
          "transferred",
          "new school",
        )
      ).ok(),
    ).toBeTruthy();
    const tSign = await signRecord(request, instructor, tRecord);
    expect(tSign.status()).toBe(409);
    expect((await readJson(tSign)).message).toMatch(/transferred/i);

    const graduated = await seedCourse(request);
    const { enrollmentId: gradId } = await enrollTestStudent(
      request,
      graduated.owner,
      graduated.course.versionId,
    );
    const gSaved = await saveRecord(request, instructor, {
      enrollmentId: gradId,
      lessonId: graduated.course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const gRecord = dataOf(await gSaved.json()).id as number;
    const grad = await request.post(
      `${graduated.owner.base}/training/enrollments/${gradId}/graduate`,
      { headers: graduated.owner.headers, data: {} },
    );
    expect(grad.ok(), await grad.text()).toBeTruthy();
    const gSign = await signRecord(request, instructor, gRecord);
    expect(gSign.status()).toBe(409);
    expect((await readJson(gSign)).message).toMatch(/graduated/i);
  });

  test("mixed aircraft and device time posts two credits on the same requirement", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 20,
      simulatorDeciHours: 8,
    });
    const recordId = dataOf(await saved.json()).id as number;
    const signed = await signRecord(request, instructor, recordId);
    expect(signed.ok(), await signed.text()).toBeTruthy();

    const progress = await getProgress(request, owner, enrollmentId);
    const rows = (progress.enrollment.credits ?? []).filter(
      (c: { requirementId: number }) => c.requirementId === course.reqs.total_flight,
    );
    expect(rows.map((c: { source: string }) => c.source).sort()).toEqual([
      "lesson",
      "simulator",
    ]);
  });
});
