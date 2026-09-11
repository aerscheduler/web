import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";
import {
  dataOf,
  enrollStudent,
  enrollTestStudent,
  getProgress,
  loginAs,
  orgUserIdFor,
  saveRecord,
  seedCourse,
  signRecord,
} from "../helpers/training";

test.describe("Training console (owner)", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("sees the seeded course, enrolls from the syllabus, and can open End enrollment", async ({
    page,
    request,
  }) => {
    const { course } = await seedCourse(request);

    await page.goto("/training");
    await dismissCookieBanner(page);
    await expect(page).toHaveURL(/\/training/);
    await expect(page.getByText(course.name)).toBeVisible({ timeout: 20_000 });

    await page.goto(`/training/${course.courseId}`);
    await page.getByRole("button", { name: /Enroll a student/i }).click();
    await page.getByRole("combobox").filter({ hasText: /Choose a member/i }).click();
    await page.getByRole("option", { name: /Test Student/i }).click();
    await page.getByRole("button", { name: /^Enroll$/ }).click();
    await expect(page.getByText(/Test Student/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/training?tab=students");
    await expect(page.getByText(course.name)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link").filter({ hasText: course.name }).first().click();
    await expect(page).toHaveURL(/\/training\/enrollments\//);

    await page.getByRole("button", { name: /End enrollment/i }).click();
    await expect(page.getByText("End this enrollment")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Terminated$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Record it$/ }).click();
    await expect(page.getByText(/terminated/i).first()).toBeVisible({ timeout: 15_000 });

    const owner = await loginAs(request, ACCOUNTS.owner);
    const enrollmentId = Number(page.url().match(/enrollments\/(\d+)/)?.[1]);
    const progress = await getProgress(request, owner, enrollmentId);
    expect(progress.enrollment.status).toBe("terminated");
    await expect(page.getByRole("button", { name: /^Grade$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add credit/i })).toHaveCount(0);
  });

  test("archived course syllabus has no Enroll a student", async ({ page, request }) => {
    const owner = await loginAs(request, ACCOUNTS.owner);
    const { course } = await seedCourse(request);
    const archived = await request.patch(
      `${owner.base}/training/courses/${course.courseId}`,
      { headers: owner.headers, data: { archived: true } },
    );
    expect(archived.ok(), await archived.text()).toBeTruthy();

    await page.goto(`/training/${course.courseId}`);
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /Enroll a student/i })).toHaveCount(0);
  });
});

test.describe("Training console (student)", () => {
  test.use({ storageState: ".auth/student.json" });

  test("/me/training links into the record and Back stays on My training", async ({
    page,
    request,
  }) => {
    const owner = await loginAs(request, ACCOUNTS.owner);
    const { course } = await seedCourse(request);
    await enrollTestStudent(request, owner, course.versionId);

    await page.goto("/me/training");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { name: /My training/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("link", { name: course.name }).click();
    await expect(page).toHaveURL(/\/training\/enrollments\//);
    await expect(page.getByText(course.name)).toBeVisible();

    await page.getByRole("link", { name: /^Training$/ }).click();
    await expect(page).toHaveURL(/\/me\/training($|\?)/);
    await expect(page.getByRole("heading", { name: /My training/i })).toBeVisible();
  });

  test("/training bounces to /me", async ({ page }) => {
    await page.goto("/training");
    await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
  });

  test("enrollment page has no Grade button", async ({ page, request }) => {
    const owner = await loginAs(request, ACCOUNTS.owner);
    const { course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);

    await page.goto(`/training/enrollments/${enrollmentId}?tab=lessons`);
    await dismissCookieBanner(page);
    await expect(page.getByText(course.lessonName)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Grade$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Save and sign/i })).toHaveCount(0);
  });

  test("student countersigns a signed lesson from My training", async ({
    page,
    request,
  }) => {
    const owner = await loginAs(request, ACCOUNTS.owner);
    const { course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const savedBody = await saved.json();
    expect(saved.ok(), JSON.stringify(savedBody)).toBeTruthy();
    const recordId = dataOf(savedBody).id as number;
    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();

    await page.goto("/me/training");
    await dismissCookieBanner(page);
    const card = page
      .locator("[data-doc-shot=me-training-progress]")
      .filter({ hasText: course.name });
    await expect(card.getByRole("button", { name: /^Sign$/ })).toBeVisible({
      timeout: 20_000,
    });
    const countersign = page.waitForResponse(
      (r) => r.url().includes("/countersign") && r.request().method() === "POST",
    );
    await card.getByRole("button", { name: /^Sign$/ }).click();
    expect((await countersign).ok()).toBeTruthy();
  });

  test("student countersigns a signed lesson from the enrollment record", async ({
    page,
    request,
  }) => {
    const owner = await loginAs(request, ACCOUNTS.owner);
    const { course } = await seedCourse(request);
    const { enrollmentId } = await enrollTestStudent(request, owner, course.versionId);
    const instructor = await loginAs(request, ACCOUNTS.instructor);
    const saved = await saveRecord(request, instructor, {
      enrollmentId,
      lessonId: course.lessonId,
      grade: "S",
      flightDeciHours: 10,
    });
    const savedBody = await saved.json();
    expect(saved.ok(), JSON.stringify(savedBody)).toBeTruthy();
    const recordId = dataOf(savedBody).id as number;
    expect((await signRecord(request, instructor, recordId)).ok()).toBeTruthy();

    await page.goto(`/training/enrollments/${enrollmentId}?tab=lessons`);
    await dismissCookieBanner(page);
    await expect(page).toHaveURL(/tab=lessons/);
    await expect(page.getByText(course.name)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Sign$/ })).toBeVisible();
    const countersign = page.waitForResponse(
      (r) => r.url().includes("/countersign") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^Sign$/ }).click();
    expect((await countersign).ok()).toBeTruthy();
  });
});

test.describe("Training console (instructor)", () => {
  test.use({ storageState: ".auth/instructor.json" });

  test("can open /training", async ({ page }) => {
    await page.goto("/training");
    await dismissCookieBanner(page);
    await expect(page).toHaveURL(/\/training($|\/|\?)/);
    await expect(page.getByRole("heading", { name: /^Training$/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("My training lists only the instructor's own courses", async ({ page, request }) => {
    const owner = await loginAs(request, ACCOUNTS.owner);
    const { course: theirs } = await seedCourse(request);
    await enrollTestStudent(request, owner, theirs.versionId);
    const { course: mine } = await seedCourse(request);
    const instructorOu = await orgUserIdFor(owner, request, ACCOUNTS.instructor);
    await enrollStudent(request, owner, mine.versionId, instructorOu);

    await page.goto("/me/training");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { name: /My training/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(mine.name)).toBeVisible();
    await expect(page.getByText(theirs.name)).toHaveCount(0);
  });
});

test.describe("Training console (dispatcher)", () => {
  test.use({ storageState: ".auth/dispatcher.json" });

  test("can open /training (web allows staff) and does not see Enroll", async ({
    page,
  }) => {
    await page.goto("/training");
    await dismissCookieBanner(page);
    await expect(page).toHaveURL(/\/training($|\/|\?)/);
    await expect(page.getByRole("button", { name: /Enroll a student/i })).toHaveCount(0);
  });
});
