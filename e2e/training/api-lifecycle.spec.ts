import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  dataOf,
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
 * HTTP contracts the service itest never sees: Express authz, list widening,
 * candidates recordId, concurrent save/sign, archived enroll.
 *
 * Each test mints its own course so a signed lesson in one case cannot poison
 * another. Isolated-stack seed has no syllabi.
 */
test.describe("Training API lifecycle", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("unsigned save without recordId reuses one draft", async ({ request }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const first = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    expect(first.status(), await first.text()).toBe(200);
    const id1 = dataOf(await first.json()).id as number;

    const second = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "U",
      flightDeciHours: 12,
    });
    expect(second.status(), await second.text()).toBe(200);
    const id2 = dataOf(await second.json()).id as number;
    expect(id2).toBe(id1);

    const progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)).toHaveLength(1);
  });

  test("signed passing lesson allows extra dual and 409s a leftover unsigned", async ({
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
    const signed = await signRecord(request, instructor, recordId);
    const signedJson = await readJson(signed);
    expect(signed.status(), JSON.stringify(signedJson)).toBe(200);
    expect(dataOf(signedJson).creditsPosted).toBeGreaterThan(0);

    const progress = await getProgress(request, owner, enrollmentId);
    const credits = (progress.enrollment.credits ?? []).filter(
      (c: { lessonRecordId?: number }) => c.lessonRecordId === recordId,
    );
    expect(credits.length).toBe(4);
    const dualHours = credits.find(
      (c: { requirementId: number }) => c.requirementId === course.reqs.dual,
    );
    expect(dualHours?.deciHours).toBe(10);

    const extra = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 11,
    });
    expect(extra.status(), await extra.text()).toBe(200);
    const extraId = dataOf(await extra.json()).id as number;
    expect(extraId).not.toBe(recordId);

    const leftover = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 12,
    });
    expect(leftover.status()).toBe(409);
    const body = await readJson(leftover);
    expect(body.message).toMatch(/open draft/i);

    const after = await getProgress(request, owner, enrollmentId);
    expect(liveRecords(after, course.lessonId)).toHaveLength(2);
    expect(unsignedRecords(after, course.lessonId)).toHaveLength(1);
  });

  test("signed U allows a retake row", async ({ request }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "U",
      flightDeciHours: 10,
    });
    const recordId = dataOf(await saved.json()).id as number;
    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();

    const retake = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 12,
    });
    expect(retake.status(), await retake.text()).toBe(200);
    const retakeId = dataOf(await retake.json()).id as number;
    expect(retakeId).not.toBe(recordId);

    const progress = await getProgress(request, owner, enrollmentId);
    expect(liveRecords(progress, course.lessonId).length).toBeGreaterThanOrEqual(2);
    expect(progress.completedLessonIds ?? []).not.toContain(course.lessonId);
  });

  test("concurrent sign of one record: one 200, one 409, credits once", async ({
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

    const [a, b] = await Promise.all([
      signRecord(request, instructor, recordId),
      signRecord(request, instructor, recordId),
    ]);
    const statuses = [a.status(), b.status()].sort();
    expect(statuses).toEqual([200, 409]);

    const progress = await getProgress(request, owner, enrollmentId);
    const credits = (progress.enrollment.credits ?? []).filter(
      (c: { lessonRecordId?: number }) => c.lessonRecordId === recordId,
    );
    expect(credits.length).toBeGreaterThan(0);
    const dual = credits.filter((c: { requirementId: number }) => c.requirementId === course.reqs.dual);
    expect(dual).toHaveLength(1);
  });

  test("concurrent save without recordId leaves one unsigned draft", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const [a, b] = await Promise.all([
      saveRecord(request, instructor, {
        enrollmentId,
        lessonId: course.lessonId,
        grade: "S",
        flightDeciHours: 10,
      }),
      saveRecord(request, instructor, {
        enrollmentId,
        lessonId: course.lessonId,
        grade: "U",
        flightDeciHours: 12,
      }),
    ]);
    expect(a.ok(), await a.text()).toBeTruthy();
    expect(b.ok(), await b.text()).toBeTruthy();

    const progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)).toHaveLength(1);
  });

  test("duplicate requirement ids on sign are refused and the record stays unsigned", async ({
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
    });
    const recordId = dataOf(await saved.json()).id as number;
    const signed = await signRecord(request, instructor, recordId, [
      { requirementId: course.reqs.dual, deciHours: 10 },
      { requirementId: course.reqs.dual, deciHours: 10 },
    ]);
    expect(signed.status()).toBe(400);
    expect((await readJson(signed)).message).toMatch(/twice/i);

    const progress = await getProgress(request, owner, enrollmentId);
    const rec = liveRecords(progress, course.lessonId)[0];
    expect(rec.instructorSignedAt).toBeFalsy();
  });

  test("enroll on an archived course is 409", async ({ request }) => {
    const { owner, course } = await seedCourse(request);
    const archived = await request.patch(
      `${owner.base}/training/courses/${course.courseId}`,
      { headers: owner.headers, data: { archived: true } },
    );
    expect(archived.ok(), await archived.text()).toBeTruthy();

    const studentId = await orgUserIdFor(owner, request, ACCOUNTS.student);
    const enroll = await request.post(`${owner.base}/training/enrollments`, {
      headers: owner.headers,
      data: { versionId: course.versionId, orgUserId: studentId },
    });
    expect(enroll.status()).toBe(409);
    expect((await readJson(enroll)).message).toMatch(/archived/i);
  });

  test("student can GET own enrollment and is 403 on someone else's", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);

    const { course: other } = await seedCourse(request);
    const renterId = await orgUserIdFor(owner, request, ACCOUNTS.renter);
    const otherEnrollment = await enrollStudent(
      request,
      owner,
      other.versionId,
      renterId,
    );

    const student = await loginAs(request, ACCOUNTS.student);
    const mine = await request.get(
      `${student.base}/training/enrollments/${enrollmentId}`,
      { headers: student.headers },
    );
    expect(mine.ok(), await mine.text()).toBeTruthy();

    const theirs = await request.get(
      `${student.base}/training/enrollments/${otherEnrollment}`,
      { headers: student.headers },
    );
    expect(theirs.status()).toBe(403);

    const grade = await saveRecord(request, student, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
    });
    expect(grade.status()).toBe(403);
  });

  test("instructor can grade; dispatcher cannot; dispatcher asking for a student's list is empty", async ({
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
      flightDeciHours: 10,
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    const dispatcher = await loginAs(request, ACCOUNTS.dispatcher);
    const grade = await saveRecord(request, dispatcher, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
    });
    expect(grade.status()).toBe(403);

    const detail = await request.get(
      `${dispatcher.base}/training/enrollments/${enrollmentId}`,
      { headers: dispatcher.headers },
    );
    expect(detail.status()).toBe(403);

    const list = await request.get(
      `${dispatcher.base}/training/enrollments?orgUserId=${studentOrgUserId}`,
      { headers: dispatcher.headers },
    );
    expect(list.ok(), await list.text()).toBeTruthy();
    expect(dataOf(await list.json())).toEqual([]);
  });

  test("candidates: dual lists flight drafts; rental is empty; complete clears recordId", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const { enrollmentId, studentOrgUserId } = await enrollTestStudent(
      request,
      owner,
      course.versionId,
    );
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const dual = await request.get(
      `${instructor.base}/training/candidates?orgUserId=${studentOrgUserId}&type=dual`,
      { headers: instructor.headers },
    );
    expect(dual.ok(), await dual.text()).toBeTruthy();
    const dualRows = dataOf(await dual.json());
    expect(dualRows.length).toBeGreaterThan(0);
    const dualRow = dualRows.find((r: { enrollmentId: number }) => r.enrollmentId === enrollmentId);
    expect(dualRow, "candidates missing the enrollment we just created").toBeTruthy();
    const dualLesson = dualRow.lessons.find((l: { id: number }) => l.id === course.lessonId);
    expect(dualLesson, "dual candidates missing the flight lesson").toBeTruthy();
    expect(dualLesson.kind).toBe("flight");
    expect(dualLesson.complete).toBe(false);
    expect(dualLesson.recordId).toBeNull();

    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      instructionDeciHours: 5,
    });
    const recordId = dataOf(await saved.json()).id as number;

    const withDraft = dataOf(
      await (
        await request.get(
          `${instructor.base}/training/candidates?orgUserId=${studentOrgUserId}&type=dual`,
          { headers: instructor.headers },
        )
      ).json(),
    );
    const draftLesson = withDraft
      .find((r: { enrollmentId: number }) => r.enrollmentId === enrollmentId)
      ?.lessons.find((l: { id: number }) => l.id === course.lessonId);
    expect(draftLesson?.recordId).toBe(recordId);

    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();

    const after = dataOf(
      await (
        await request.get(
          `${instructor.base}/training/candidates?orgUserId=${studentOrgUserId}&type=dual`,
          { headers: instructor.headers },
        )
      ).json(),
    );
    const done = after
      .find((r: { enrollmentId: number }) => r.enrollmentId === enrollmentId)
      ?.lessons.find((l: { id: number }) => l.id === course.lessonId);
    expect(done?.complete).toBe(true);
    expect(done?.recordId).toBeNull();

    const rental = await request.get(
      `${instructor.base}/training/candidates?orgUserId=${studentOrgUserId}&type=rental`,
      { headers: instructor.headers },
    );
    expect(rental.ok()).toBeTruthy();
    const rentalRows = dataOf(await rental.json());
    const rentalMine = rentalRows.find(
      (r: { enrollmentId: number }) => r.enrollmentId === enrollmentId,
    );
    expect(rentalMine, "rental candidates should still name the enrollment").toBeTruthy();
    expect(rentalMine.lessons).toEqual([]);

    const asStudent = await loginAs(request, ACCOUNTS.student);
    const selfRes = await request.get(
      `${asStudent.base}/training/candidates?orgUserId=${studentOrgUserId}&type=dual`,
      { headers: asStudent.headers },
    );
    const selfBody = await readJson(selfRes);
    expect(selfRes.ok(), JSON.stringify(selfBody)).toBeTruthy();
    const selfRows = dataOf(selfBody);
    expect(selfRows.some((r: { enrollmentId: number }) => r.enrollmentId === enrollmentId)).toBeTruthy();

    const renterId = await orgUserIdFor(owner, request, ACCOUNTS.renter);
    const peek = await request.get(
      `${asStudent.base}/training/candidates?orgUserId=${renterId}&type=dual`,
      { headers: asStudent.headers },
    );
    expect(peek.status()).toBe(403);
  });

  test("omitting taskGrades preserves ACS marks; empty array clears them", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request, { withTask: true });
    expect(course.taskId).toBeTruthy();
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);

    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
      taskGrades: [{ lessonTaskId: course.taskId, grade: "S" }],
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    const keep = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 11,
    });
    expect(keep.ok(), await keep.text()).toBeTruthy();
    let progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)[0].taskGrades).toHaveLength(1);

    const wipe = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 11,
      taskGrades: [],
    });
    expect(wipe.ok(), await wipe.text()).toBeTruthy();
    progress = await getProgress(request, owner, enrollmentId);
    expect(unsignedRecords(progress, course.lessonId)[0].taskGrades ?? []).toHaveLength(0);
  });

  test("instructor enroll is 403; student list without orgUserId is only their own", async ({
    request,
  }) => {
    const { owner, course } = await seedCourse(request);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const studentId = await orgUserIdFor(owner, request, ACCOUNTS.student);
    const enroll = await request.post(`${instructor.base}/training/enrollments`, {
      headers: instructor.headers,
      data: { versionId: course.versionId, orgUserId: studentId },
    });
    expect(enroll.status()).toBe(403);

    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const student = await loginAs(request, ACCOUNTS.student);
    const listed = await request.get(`${student.base}/training/enrollments`, {
      headers: student.headers,
    });
    expect(listed.ok()).toBeTruthy();
    const rows = dataOf(await listed.json());
    expect(rows.some((r: { id: number }) => r.id === enrollmentId)).toBeTruthy();
    for (const row of rows) {
      const sid = row.studentOrgUserId ?? row.student?.id;
      expect(sid).toBe(studentId);
    }

    const renterId = await orgUserIdFor(owner, request, ACCOUNTS.renter);
    const otherList = await request.get(
      `${student.base}/training/enrollments?orgUserId=${renterId}`,
      { headers: student.headers },
    );
    expect(otherList.ok()).toBeTruthy();
    expect(dataOf(await otherList.json())).toEqual([]);
  });
});
