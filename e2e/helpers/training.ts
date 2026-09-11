import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "./env";

/**
 * Training E2E fixtures. The stack seed has no courses, so every spec that
 * touches curriculum has to mint its own syllabus through the public API.
 *
 * Names are prefixed E2E-TRN- so leftover rows in a shared local DB are
 * obviously test artifacts (the isolated stack wipes them on teardown).
 */

export type Session = {
  base: string;
  headers: Record<string, string>;
  email: string;
};

export type SeededCourse = {
  name: string;
  courseId: number;
  versionId: number;
  stageId: number;
  lessonId: number;
  lessonName: string;
  reqs: Record<string, number>;
  taskId: number | null;
};

export function e2eTrainingName(suffix = ""): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return `E2E-TRN-${stamp}${suffix ? `-${suffix}` : ""}`;
}

export async function loginAs(
  request: APIRequestContext,
  email: string,
): Promise<Session> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(auth.ok(), `auth failed for ${email}: ${auth.status()}`).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` }, email };
}

export async function readJson(res: APIResponse): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function dataOf(body: any): any {
  return body?.data ?? body;
}

export async function expectOk(
  res: APIResponse,
  label: string,
): Promise<any> {
  const body = await readJson(res);
  expect(res.ok(), `${label}: ${res.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return dataOf(body);
}

export async function orgUserIdFor(
  session: Session,
  request: APIRequestContext,
  email: string,
): Promise<number> {
  const res = await request.get(
    `${session.base}/orgUsers?q=${encodeURIComponent(email)}`,
    { headers: session.headers },
  );
  const users = dataOf(await readJson(res));
  const list = Array.isArray(users) ? users : [];
  const row = list.find((u: any) => u?.user?.email === email);
  expect(row, `no org user for ${email}`).toBeTruthy();
  return row.id as number;
}

export async function enrollTestStudent(
  request: APIRequestContext,
  session: Session,
  versionId: number,
): Promise<{ enrollmentId: number; studentOrgUserId: number }> {
  const studentOrgUserId = await orgUserIdFor(session, request, ACCOUNTS.student);
  const enrollmentId = await enrollStudent(
    request,
    session,
    versionId,
    studentOrgUserId,
  );
  return { enrollmentId, studentOrgUserId };
}

/** One stage, one flight lesson, four hour requirements. Optional ACS task. */
export async function seedCourse(
  request: APIRequestContext,
  opts: { withTask?: boolean; extraLesson?: boolean; requiresNotes?: boolean } = {},
): Promise<{ owner: Session; course: SeededCourse }> {
  const owner = await loginAs(request, ACCOUNTS.owner);
  const name = e2eTrainingName();

  const created = await expectOk(
    await request.post(`${owner.base}/training/courses`, {
      headers: owner.headers,
      data: {
        name,
        regulatoryPart: "part61",
        certificateSought: "private",
      },
    }),
    "create course",
  );
  const courseId = created.id as number;

  const courseBody = await expectOk(
    await request.get(`${owner.base}/training/courses/${courseId}`, {
      headers: owner.headers,
    }),
    "get course",
  );
  const versionId = courseBody.versions[0].id as number;

  const stage = await expectOk(
    await request.put(`${owner.base}/training/versions/${versionId}/stages`, {
      headers: owner.headers,
      data: { name: "Stage I", position: 1 },
    }),
    "upsert stage",
  );

  const reqs: Record<string, number> = {};
  for (const [code, label, min] of [
    ["total_flight", "Total flight time", 400],
    ["dual", "Dual instruction received", 200],
    ["night", "Night flight training", 30],
    ["ground", "Ground training", 350],
  ] as const) {
    const r = await expectOk(
      await request.put(
        `${owner.base}/training/versions/${versionId}/requirements`,
        {
          headers: owner.headers,
          data: { code, label, minDeciHours: min, source: "part61" },
        },
      ),
      `upsert requirement ${code}`,
    );
    reqs[code] = r.id as number;
  }

  const lessonName = "Lesson 12: Night dual cross-country";
  const lesson = await expectOk(
    await request.put(`${owner.base}/training/versions/${versionId}/lessons`, {
      headers: owner.headers,
      data: {
        stageId: stage.id,
        name: lessonName,
        position: 12,
        kind: "flight",
        ...(opts.requiresNotes ? { requiresNotes: true } : {}),
        credits: [
          { requirementId: reqs.total_flight, creditFrom: "flight" },
          { requirementId: reqs.dual, creditFrom: "flight" },
          { requirementId: reqs.night, creditFrom: "flight" },
          { requirementId: reqs.ground, creditFrom: "instruction" },
        ],
      },
    }),
    "upsert lesson",
  );

  if (opts.extraLesson) {
    await expectOk(
      await request.put(`${owner.base}/training/versions/${versionId}/lessons`, {
        headers: owner.headers,
        data: {
          stageId: stage.id,
          name: "Lesson 13: Dual pattern",
          position: 13,
          kind: "flight",
          credits: [
            { requirementId: reqs.total_flight, creditFrom: "flight" },
            { requirementId: reqs.dual, creditFrom: "flight" },
          ],
        },
      }),
      "upsert extra lesson",
    );
  }

  let taskId: number | null = null;
  if (opts.withTask) {
    const tasks = await expectOk(
      await request.put(
        `${owner.base}/training/versions/${versionId}/lessons/${lesson.id}/tasks`,
        {
          headers: owner.headers,
          data: {
            tasks: [
              {
                name: "Steep turns",
                position: 1,
                acsCode: "PA.V.A",
                standard: "Maintain altitude ±100 feet.",
              },
            ],
          },
        },
      ),
      "set lesson tasks",
    );
    // Some responses are `{ count }`; fetch the version to read the task id.
    const version = await expectOk(
      await request.get(`${owner.base}/training/versions/${versionId}`, {
        headers: owner.headers,
      }),
      "get version for task id",
    );
    const found = version.stages
      ?.flatMap((s: any) => s.lessons ?? [])
      .find((l: any) => l.id === lesson.id);
    taskId = found?.tasks?.[0]?.id ?? tasks?.id ?? null;
    expect(taskId, `task id after setLessonTasks: ${JSON.stringify(tasks)}`).toBeTruthy();
  }

  await expectOk(
    await request.post(`${owner.base}/training/versions/${versionId}/publish`, {
      headers: owner.headers,
      data: {},
    }),
    "publish version",
  );

  return {
    owner,
    course: {
      name,
      courseId,
      versionId,
      stageId: stage.id as number,
      lessonId: lesson.id as number,
      lessonName,
      reqs,
      taskId,
    },
  };
}

export async function enrollStudent(
  request: APIRequestContext,
  session: Session,
  versionId: number,
  orgUserId: number,
): Promise<number> {
  const data = await expectOk(
    await request.post(`${session.base}/training/enrollments`, {
      headers: session.headers,
      data: { versionId, orgUserId },
    }),
    "enroll",
  );
  return data.id as number;
}

export async function getProgress(
  request: APIRequestContext,
  session: Session,
  enrollmentId: number,
) {
  return expectOk(
    await request.get(`${session.base}/training/enrollments/${enrollmentId}`, {
      headers: session.headers,
    }),
    `GET enrollment ${enrollmentId}`,
  );
}

export async function saveRecord(
  request: APIRequestContext,
  session: Session,
  body: Record<string, unknown>,
): Promise<APIResponse> {
  return request.post(`${session.base}/training/records`, {
    headers: session.headers,
    data: body,
  });
}

export async function signRecord(
  request: APIRequestContext,
  session: Session,
  recordId: number,
  credits?: unknown,
): Promise<APIResponse> {
  return request.post(`${session.base}/training/records/${recordId}/sign`, {
    headers: session.headers,
    data: credits != null ? { credits } : {},
  });
}

export async function endEnrollment(
  request: APIRequestContext,
  session: Session,
  enrollmentId: number,
  status: "terminated" | "transferred" | string = "terminated",
  reason?: string,
): Promise<APIResponse> {
  return request.post(`${session.base}/training/enrollments/${enrollmentId}/end`, {
    headers: session.headers,
    data: { status, ...(reason != null ? { reason } : {}) },
  });
}

export async function amendRecord(
  request: APIRequestContext,
  session: Session,
  recordId: number,
  reason: string,
): Promise<APIResponse> {
  return request.post(`${session.base}/training/records/${recordId}/amend`, {
    headers: session.headers,
    data: { reason },
  });
}

export async function countersignRecord(
  request: APIRequestContext,
  session: Session,
  recordId: number,
): Promise<APIResponse> {
  return request.post(`${session.base}/training/records/${recordId}/countersign`, {
    headers: session.headers,
    data: {},
  });
}

export function unsignedRecords(progress: any, lessonId: number): any[] {
  const rows = progress?.enrollment?.lessonRecords ?? progress?.lessonRecords ?? [];
  return rows.filter(
    (r: any) => r.lessonId === lessonId && !r.instructorSignedAt,
  );
}

export function liveRecords(progress: any, lessonId: number): any[] {
  const rows = progress?.enrollment?.lessonRecords ?? progress?.lessonRecords ?? [];
  const superseded = new Set(
    rows.map((r: any) => r.supersedesId).filter((id: unknown) => id != null),
  );
  return rows.filter(
    (r: any) => r.lessonId === lessonId && !superseded.has(r.id),
  );
}

/** Dual on N172TS with Test Student + Test Instructor, probing Denver daytime slots. */
export async function createDualReservation(
  request: APIRequestContext,
  session: Session,
  studentOrgUserId: number,
  instructorOrgUserId: number,
): Promise<{ id: number; notes: string } | null> {
  const resources = await expectOk(
    await request.get(`${session.base}/resources`, { headers: session.headers }),
    "list resources",
  );
  const items = Array.isArray(resources) ? resources : [];
  let plane: any = null;
  for (const r of items) {
    if (!r?.type?.plane || r.type.plane.grounded) continue;
    if (r.type.plane.tailNumber === "N172TS") {
      plane = r;
      break;
    }
    if (!plane) plane = r;
  }
  if (!plane) return null;

  const notes = `E2E-TRN-dual-${Date.now()}`;
  for (let dayOffset = 2; dayOffset <= 12; dayOffset++) {
    const probe = new Date(Date.now() + dayOffset * 864e5);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const start = new Date(`${ymd}T10:00:00-06:00`);
    const end = new Date(start.getTime() + 3600_000);
    const created = await request.post(`${session.base}/reservations/`, {
      headers: session.headers,
      data: {
        title: "E2E Training Dual",
        type: "dual",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZoneName: "America/Denver",
        notes,
        resource: { id: plane.id },
        personnel: {
          students: [{ id: studentOrgUserId }],
          instructors: [{ id: instructorOrgUserId }],
        },
      },
    });
    if (created.status() < 300) {
      const body = dataOf(await readJson(created));
      return { id: body.id as number, notes };
    }
  }
  return null;
}
