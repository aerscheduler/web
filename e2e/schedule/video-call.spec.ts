import { test, expect, type Page } from "@playwright/test";
import { apiLogin, cleanupE2eReservations } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import {
  dismissCookieBanner,
  pickByPlaceholder,
  pickNextBookableSlot,
  submitBookReservation,
} from "../helpers/reservation-form";

/**
 * A ground lesson held over a video call: the "Video call" row on the booking form, a
 * room that becomes optional once there is a call, and the Join link on the record page.
 *
 * Google Meet and Zoom creation need a real connected account, so they are covered by the
 * server's unit tests; this drives everything a school can do without one.
 */
test.describe("Video call on a ground lesson", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  async function openGroundForm(page: Page) {
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /\+?\s*New reservation/i }).first().click();
    await expect(page.locator("#res-type")).toBeVisible({ timeout: 15_000 });
    await page.locator("#res-type").click();
    await page.getByRole("option", { name: /^Ground$/i }).click();
    await expect(page.locator("#res-video-call")).toBeVisible();
  }

  test("books a remote lesson with a pasted link and no room, then shows Join", async ({ page }) => {
    const marker = `E2E-UI-video-${Date.now()}`;
    await openGroundForm(page);

    // Without a call, a ground lesson still needs a room.
    await expect(page.locator("#res-video-call")).toHaveText(/No video call/);

    // Google Meet is offered but greyed until Google Calendar is connected, with the reason.
    await page.locator("#res-video-call").click();
    const meet = page.getByRole("option", { name: /Add Google Meet/ });
    await expect(meet).toBeVisible();
    await expect(meet).toHaveAttribute("aria-disabled", "true");
    await expect(meet).toContainText(/connect Google Calendar first/i);
    await page.getByRole("option", { name: /^Paste a link$/ }).click();

    await page.locator("#res-video-call-link").fill("us02web.zoom.us/j/84512345678?pwd=Ground1");
    // The room picker now offers "No room" and settles on it.
    await expect(page.locator("#res-resource")).toContainText(/No room/);

    await pickByPlaceholder(page, /Assign student/i, /Test Student/, /Search students/i);
    await pickNextBookableSlot(page);
    await page.locator("#res-title").fill(marker);
    await page.locator("#res-notes").fill(marker);

    const posted = await submitBookReservation(page);
    const sent = posted.request().postDataJSON() as { meetingUrl?: string; resource?: unknown; type: string };
    expect(sent.type).toBe("ground");
    expect(sent.meetingUrl).toBe("us02web.zoom.us/j/84512345678?pwd=Ground1");
    expect(sent.resource).toBeUndefined();

    const saved = (await posted.json()).data as { id: number; meetingUrl: string | null; resource: unknown };
    expect(saved.meetingUrl).toBe("https://us02web.zoom.us/j/84512345678?pwd=Ground1");
    expect(saved.resource ?? null).toBeNull();

    await page.goto(`/schedule/reservations/${saved.id}`);
    const join = page.getByRole("link", { name: /Join Zoom/ });
    await expect(join).toBeVisible({ timeout: 15_000 });
    await expect(join).toHaveAttribute("href", "https://us02web.zoom.us/j/84512345678?pwd=Ground1");
    await expect(join).toHaveAttribute("target", "_blank");
    await expect(page.getByText("None, video call")).toBeVisible();

  });

  test("an empty pasted link is caught before anything is sent", async ({ page }) => {
    await openGroundForm(page);
    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^Paste a link$/ }).click();
    await pickByPlaceholder(page, /Assign student/i, /Test Student/, /Search students/i);
    await pickNextBookableSlot(page);
    await page.locator("#res-title").fill(`E2E-UI-video-empty-${Date.now()}`);

    let posted = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/reservations\/?$/.test(new URL(r.url()).pathname)) posted = true;
    });
    await page.getByRole("button", { name: /^Book reservation$/i }).click();
    await expect(page.getByText(/Paste the meeting link, or choose No video call/i).first()).toBeVisible();
    await expect(page.locator("#res-video-call-link")).toHaveAttribute("aria-invalid", "true");
    expect(posted).toBe(false);
  });

  test("editing keeps the link, refuses a lesson with neither room nor call, and swaps links", async ({ page, request }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    const token = (await apiLogin(request, ACCOUNTS.owner)).auth.accessToken as string;
    const headers = { Authorization: `Bearer ${token}` };
    const people = await request.get(`${base}/orgUsers?student=true&limit=100`, { headers });
    const student = ((await people.json()).data as { id: number; user?: { name?: string } }[]).find((u) =>
      /Test Student/.test(u.user?.name ?? "")
    );
    expect(student, "seeded Test Student").toBeTruthy();
    // Three weeks out, at a minute no other spec uses, so nothing has started or clashes.
    const day = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
    const made = await request.post(`${base}/reservations`, {
      headers,
      data: {
        type: "ground",
        title: `E2E-UI-video-edit-${Date.now()}`,
        notes: "E2E-UI-video edit",
        start: `${day}T19:10:00Z`,
        end: `${day}T19:55:00Z`,
        timeZoneName: "America/Denver",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        personnel: { students: [{ id: student!.id }] },
      },
    });
    expect(made.status(), await made.text()).toBe(201);
    const id = ((await made.json()).data as { id: number }).id;

    await page.goto(`/schedule/reservations/${id}`);
    await dismissCookieBanner(page);
    await expect(page.getByRole("link", { name: /Join Google Meet/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Edit reservation/ }).click();
    await expect(page.locator("#res-video-call")).toContainText(/Google Meet \(current link\)/);
    await expect(page.locator("#res-resource")).toContainText(/No room/);

    // Off: a ground lesson with nowhere to happen is refused before it is sent.
    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^No video call$/ }).click();
    await page.getByRole("button", { name: /^Save changes$/ }).click();
    await expect(page.getByText(/Ground reservations need a room/i).first()).toBeVisible();

    // A new pasted link replaces the old one.
    await page.locator("#res-video-call").click();
    await page.getByRole("option", { name: /^Paste a link$/ }).click();
    await page.locator("#res-video-call-link").fill("https://zoom.us/j/99887766554");
    const patched = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(`/reservations/${id}`));
    await page.getByRole("button", { name: /^Save changes$/ }).click();
    const res = await patched;
    expect(res.ok(), await res.text()).toBeTruthy();
    expect(((await res.json()).data as { meetingUrl: string }).meetingUrl).toBe("https://zoom.us/j/99887766554");
    await expect(page.getByRole("link", { name: /Join Zoom/ })).toBeVisible({ timeout: 15_000 });
  });
});
