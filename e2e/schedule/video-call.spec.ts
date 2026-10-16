import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin, cleanupE2eReservations } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner, pickByPlaceholder, pickNextBookableSlot } from "../helpers/reservation-form";

/**
 * A ground lesson held over a video call. The call is one of the integrations we support
 * (Google Meet, Zoom), never a pasted link; with one, the room is optional; the booking
 * page shows Join.
 *
 * The test accounts have no real Google or Zoom connection, so making the meeting is
 * covered by the server's unit tests; here the browser is told Google is connected and the
 * server, which really checks, refuses with its reason.
 */

const base = () => apiProxyTarget().replace(/\/$/, "");

async function ownerToken(request: APIRequestContext) {
  return (await apiLogin(request, ACCOUNTS.owner)).auth.accessToken as string;
}

async function personId(request: APIRequestContext, token: string, role: "student" | "instructor", name: RegExp) {
  const res = await request.get(`${base()}/orgUsers?${role}=true&limit=100`, { headers: { Authorization: `Bearer ${token}` } });
  const person = ((await res.json()).data as { id: number; user?: { name?: string } }[]).find((u) => name.test(u.user?.name ?? ""));
  expect(person, `seeded ${name}`).toBeTruthy();
  return person!.id;
}

let lessonDayOffset = Math.floor(Math.random() * 5) * 3;

/** A remote ground lesson three weeks out, made through the API (which still accepts a link). */
async function remoteLessonViaApi(request: APIRequestContext, meetingUrl: string) {
  const token = await ownerToken(request);
  const student = await personId(request, token, "student", /Test Student/);
  //Its own day per call, so two lessons in one run never clash on the student.
  lessonDayOffset += 1;
  const day = new Date(Date.now() + (20 + lessonDayOffset) * 864e5).toISOString().slice(0, 10);
  const minute = 10 + Math.floor(Math.random() * 30);
  const made = await request.post(`${base()}/reservations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      type: "ground",
      title: `E2E-UI-video-${Date.now()}`,
      notes: "E2E-UI-video",
      start: `${day}T19:${minute}:00Z`,
      end: `${day}T19:${minute + 20}:00Z`,
      timeZoneName: "America/Denver",
      meetingUrl,
      personnel: { students: [{ id: student }] },
    },
  });
  expect(made.status(), await made.text()).toBe(201);
  return ((await made.json()).data as { id: number }).id;
}

async function openGroundForm(page: Page) {
  await page.goto("/schedule");
  await expect(page).not.toHaveURL(/\/login/);
  await dismissCookieBanner(page);
  //A click that lands while the board is still settling can open nothing, or a form that is
  //replaced a moment later, so the whole open-and-pick-Ground step is retried.
  await expect(async () => {
    if (!(await page.locator("#res-type").isVisible())) {
      await page.getByRole("button", { name: /\+?\s*New reservation/i }).first().click();
    }
    await page.locator("#res-type").click({ timeout: 2_000 });
    await page.getByRole("option", { name: /^Ground$/i }).click({ timeout: 2_000 });
    await expect(page.locator("#res-video-call")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

const isReservationPost = (r: { request(): { method(): string }; url(): string }) =>
  r.request().method() === "POST" && /\/reservations\/?$/.test(new URL(r.url()).pathname);

test.describe("Video call on a ground lesson", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("offers the integrations only, never a pasted link; without a call a room is required", async ({ page }) => {
    await openGroundForm(page);
    await expect(page.locator("#res-video-call")).toHaveText(/No video call/);

    await page.locator("#res-video-call").click();
    const meet = page.getByRole("option", { name: /Add Google Meet/ });
    await expect(meet).toBeVisible();
    //Not greyed out: picking it connects Google right here.
    await expect(meet).not.toHaveAttribute("aria-disabled", "true");
    await expect(meet).toContainText(/Connects Google first/i);
    await expect(page.getByRole("option", { name: /Paste a link/i })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await pickByPlaceholder(page, /Assign student/i, /Test Student/, /Search students/i);
    await pickNextBookableSlot(page);
    await page.locator("#res-title").fill(`E2E-UI-video-noroom-${Date.now()}`);
    let posted = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/reservations\/?$/.test(new URL(r.url()).pathname)) posted = true;
    });
    await page.getByRole("button", { name: /^Book reservation$/i }).click();
    await expect(page.getByText(/Ground reservations need a room/i).first()).toBeVisible();
    expect(posted).toBe(false);
  });

  test("Add Google Meet asks the server to make the meeting and the room becomes optional", async ({ page }) => {
    await page.route("**/integrations/meetings", (route) =>
      route.fulfill({
        json: { data: { googleMeet: { connected: true }, zoom: { available: false, connected: false, email: null } } },
      })
    );
    await openGroundForm(page);
    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^Add Google Meet$/ }).click();
    await expect(page.getByText(/made on your Google account when you save/i)).toBeVisible();
    await expect(page.locator("#res-resource")).toContainText(/No room/);

    await pickByPlaceholder(page, /Assign student/i, /Test Student/, /Search students/i);
    await pickNextBookableSlot(page);
    await page.locator("#res-title").fill(`E2E-UI-video-meet-${Date.now()}`);
    const posted = page.waitForResponse(isReservationPost);
    await page.getByRole("button", { name: /^Book reservation$/i }).click();
    const res = await posted;
    const sent = res.request().postDataJSON() as { meeting?: { create: string }; meetingUrl?: string; resource?: unknown };
    expect(sent.meeting).toEqual({ create: "google_meet" });
    expect(sent.meetingUrl).toBeUndefined();
    expect(sent.resource).toBeUndefined();
    // The server really checks the connection, and refuses before anything is saved.
    expect(res.status()).toBe(400);
    await expect(page.getByText(/Connect Google Calendar first/i).first()).toBeVisible();
  });

  test("picking Google Meet with nothing connected connects Google in place, then picks it", async ({ page }) => {
    //Google's consent popup, stood in for: it hands back a code as the real one does.
    await page.addInitScript(() => {
      (window as unknown as { google: unknown }).google = {
        accounts: {
          oauth2: {
            initTokenClient: () => ({ requestAccessToken: () => undefined }),
            initCodeClient: (cfg: { callback: (r: { code: string }) => void }) => ({
              requestCode: () => setTimeout(() => cfg.callback({ code: "e2e-google-code" }), 50),
            }),
          },
        },
      };
    });
    let connected = false;
    let sentCode: unknown = null;
    await page.route("**/integrations/googleCalendar", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      sentCode = (route.request().postDataJSON() as { serverAuthCode?: string }).serverAuthCode;
      connected = true;
      return route.fulfill({ json: { data: { connected: true } } });
    });
    await page.route("**/integrations/meetings**", (route) =>
      route.fulfill({
        json: {
          data: {
            googleMeet: connected
              ? { connected: true, host: { who: "you", name: null }, youConnected: true }
              : { connected: false, host: null, youConnected: false },
            zoom: { available: false, connected: false, email: null, host: null, youConnected: false },
          },
        },
      })
    );
    await openGroundForm(page);
    await page.locator("#res-title").fill("E2E-typed-before-connecting");
    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^Add Google Meet$/ }).click();

    await expect(page.locator("#res-video-call")).toHaveText(/Add Google Meet/);
    expect(sentCode).toBe("e2e-google-code");
    await expect(page.getByText(/made on your Google account when you save/i)).toBeVisible();
    //The form never left: what was typed is still there.
    await expect(page.locator("#res-title")).toHaveValue("E2E-typed-before-connecting");
  });

  test("picking Zoom with nothing connected opens Zoom in a small window and picks Zoom when it reports back", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __opened: string[]; open: typeof window.open };
      w.__opened = [];
      w.open = ((_url?: string, name?: string) => {
        w.__opened.push(name ?? "");
        const fake = { location: { href: "" }, close: () => undefined, closed: false };
        return fake as unknown as Window;
      }) as typeof window.open;
    });
    let connected = false;
    await page.route("**/integrations/zoom/authorize-url", (route) =>
      route.fulfill({ json: { data: { url: "https://zoom.us/oauth/authorize?e2e=1" } } })
    );
    await page.route("**/integrations/meetings**", (route) =>
      route.fulfill({
        json: {
          data: {
            googleMeet: { connected: false, host: null, youConnected: false },
            zoom: {
              available: true,
              connected,
              email: connected ? "pilot@example.com" : null,
              host: connected ? { who: "you", name: null } : null,
              youConnected: connected,
            },
          },
        },
      })
    );
    await openGroundForm(page);
    await page.locator("#res-video-call").click();
    const zoom = page.getByRole("option", { name: /^Add Zoom meeting$/ });
    await expect(zoom).toContainText(/Connects Zoom first/i);
    await zoom.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([
      "aerscheduler-zoom",
    ]);
    await expect(page.locator("#res-video-call")).toContainText(/Connecting Zoom/);

    //What the callback page says once Zoom is connected.
    connected = true;
    await page.evaluate(() => {
      const c = new BroadcastChannel("aerscheduler:zoom-connect");
      c.postMessage({ connected: true, email: "pilot@example.com" });
      c.close();
    });
    await expect(page.locator("#res-video-call")).toHaveText(/Add Zoom meeting/);
    await expect(page.getByText(/made on your Zoom account when you save/i)).toBeVisible();
  });

  test("with an instructor on the lesson, the form asks about them and names them as the host", async ({ page }) => {
    const asked: string[] = [];
    await page.route("**/integrations/meetings**", (route) => {
      asked.push(route.request().url());
      const withInstructor = /instructorOrgUserId=\d+/.test(route.request().url());
      return route.fulfill({
        json: {
          data: {
            googleMeet: withInstructor
              ? { connected: true, host: { who: "instructor", name: "Test Instructor" }, youConnected: false }
              : { connected: false, host: null, youConnected: false },
            zoom: { available: false, connected: false, email: null, host: null, youConnected: false },
          },
        },
      });
    });
    await openGroundForm(page);
    await pickByPlaceholder(page, /Assign instructor/i, /Test Instructor/, /Search instructors/i);
    await expect.poll(() => asked.some((u) => /instructorOrgUserId=\d+/.test(u))).toBe(true);
    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^Add Google Meet$/ }).click();
    await expect(page.getByText(/made on Test Instructor's Google account when you save/i)).toBeVisible();
  });

  test("a booking with a call shows Join and None for the room", async ({ page, request }) => {
    const id = await remoteLessonViaApi(request, "https://us02web.zoom.us/j/84512345678?pwd=Ground1");
    await page.goto(`/schedule/reservations/${id}`);
    await dismissCookieBanner(page);
    const join = page.getByRole("link", { name: /Join Zoom/ });
    await expect(join).toBeVisible({ timeout: 15_000 });
    await expect(join).toHaveAttribute("href", "https://us02web.zoom.us/j/84512345678?pwd=Ground1");
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(page.getByText("None, video call")).toBeVisible();
  });

  test("editing keeps the call, and turning it off asks for a room again", async ({ page, request }) => {
    const id = await remoteLessonViaApi(request, "https://meet.google.com/abc-defg-hij");
    await page.goto(`/schedule/reservations/${id}`);
    await dismissCookieBanner(page);
    await expect(page.getByRole("link", { name: /Join Google Meet/ })).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await page.getByRole("button", { name: /Edit reservation/ }).click();
      await expect(page.locator("#res-video-call")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.locator("#res-video-call")).toContainText(/Google Meet \(current call\)/);
    await expect(page.locator("#res-resource")).toContainText(/No room/);

    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^No video call$/ }).click();
    await page.getByRole("button", { name: /^Save changes$/ }).click();
    await expect(page.getByText(/Ground reservations need a room/i).first()).toBeVisible();
  });
});

test.describe("Video call on a booking request", () => {
  test.afterAll(async ({ request }) => {
    const token = await ownerToken(request);
    await request.patch(`${base()}/organizations/`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { bookingPolicy: { bookingApprovalRequiredRoles: [] } },
    });
    await cleanupE2eReservations(request);
  });

  test("the desk sees the call on the request, and approval books it with no room", async ({ browser, request }) => {
    const owner = await ownerToken(request);
    await request.patch(`${base()}/organizations/`, {
      headers: { Authorization: `Bearer ${owner}` },
      data: { bookingPolicy: { bookingApprovalRequiredRoles: ["student"] } },
    });
    const instructor = await personId(request, owner, "instructor", /Test Instructor/);
    const student = (await apiLogin(request, ACCOUNTS.student)).auth.accessToken as string;

    //Late morning Tuesday to Friday in Denver, inside every one of the seeded instructor's
    //days (they are off on Mondays).
    const day = new Date(Date.now() + 22 * 864e5);
    while (![2, 3, 4, 5].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const ymd = day.toISOString().slice(0, 10);
    const marker = `E2E-UI-video-request-${Date.now()}`;
    const res = await request.post(`${base()}/booking-requests`, {
      headers: { Authorization: `Bearer ${student}` },
      data: {
        type: "ground",
        start: `${ymd}T18:00:00Z`,
        end: `${ymd}T19:00:00Z`,
        timeZoneName: "America/Denver",
        notes: marker,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        personnel: { instructors: [{ id: instructor }], students: [] },
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const created = (await res.json()).data as { id: number; meetingUrl: string | null; resource: unknown };
    expect(created.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(created.resource ?? null).toBeNull();

    const desk = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await desk.newPage();
    await page.goto("/schedule");
    await dismissCookieBanner(page);
    //A click that lands before the board has finished loading opens nothing, so retry it.
    await expect(async () => {
      await page.getByRole("button", { name: /Booking requests/i }).click();
      await expect(page.getByRole("link", { name: /Join Google Meet/ }).first()).toBeVisible({ timeout: 4_000 });
    }).toPass({ timeout: 30_000 });
    await desk.close();

    const approve = await request.post(`${base()}/booking-requests/${created.id}/approve`, {
      headers: { Authorization: `Bearer ${owner}` },
      data: {},
    });
    expect(approve.ok(), await approve.text()).toBeTruthy();

    const list = await request.get(
      `${base()}/reservations?startDate=${new Date(Date.now() - 864e5).toISOString()}&endDate=${new Date(Date.now() + 60 * 864e5).toISOString()}`,
      { headers: { Authorization: `Bearer ${owner}` } }
    );
    const items = ((await list.json()).data ?? []) as { notes?: string; meetingUrl?: string | null; resource?: unknown; type: string }[];
    const booked = items.find((r) => String(r.notes ?? "").includes(marker));
    expect(booked, "approved request is on the schedule").toBeTruthy();
    expect(booked!.type).toBe("ground");
    expect(booked!.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(booked!.resource ?? null).toBeNull();
  });
});
