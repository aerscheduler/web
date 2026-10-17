import { test, expect, type Browser, type Page, type Response } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Messages in the console, end to end, as a student and an instructor in two browsers:
 * the launcher opens the panel, a new message is written on a To: line, it arrives live on
 * the other side, edit happens in place, delete takes it away, a right-click mutes the
 * conversation, Expand opens the big view, and a link followed from there lands on the page
 * with Messages back in its panel. Every write is checked on the wire, not just on screen.
 *
 * Text carries a per-run E2E- prefix, and every message sent here is deleted at the end.
 */

const run = `E2E-msg-${Date.now()}`;
const base = () => apiProxyTarget().replace(/\/$/, "");

async function open(browser: Browser, role: "student" | "instructor") {
  const context = await browser.newContext({ storageState: `.auth/${role}.json` });
  const page = await context.newPage();
  await page.goto("/me");
  await expect(page).not.toHaveURL(/\/login/);
  await dismissCookieBanner(page);
  return page;
}

const panel = (page: Page) => page.locator('section[aria-label="Messages"]');

async function openPanel(page: Page) {
  await page.getByRole("button", { name: /^Messages/ }).click();
  await expect(panel(page)).toBeVisible();
}

const isPost = (path: RegExp) => (r: Response) => r.request().method() === "POST" && path.test(new URL(r.url()).pathname);

test.describe.serial("Messages", () => {
  let student: Page;
  let instructor: Page;
  const sent: number[] = [];

  test.beforeAll(async ({ browser }) => {
    student = await open(browser, "student");
    instructor = await open(browser, "instructor");
  });

  test.afterAll(async ({ request }) => {
    const token = (await apiLogin(request, ACCOUNTS.student)).auth.accessToken as string;
    for (const id of sent) {
      await request.delete(`${base()}/conversations/messages/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    await student?.context().close();
    await instructor?.context().close();
  });

  test("a new message is written on a To: line and opens the conversation", async () => {
    await openPanel(student);
    await panel(student).getByRole("button", { name: "New message", exact: true }).click();
    await panel(student).getByRole("textbox", { name: "To", exact: true }).fill("Test Instructor");
    await panel(student).getByRole("option", { name: /Test Instructor/ }).click();

    const text = `${run} first`;
    const posted = student.waitForResponse(isPost(/\/conversations\/\d+\/messages$/));
    const box = panel(student).getByRole("textbox", { name: "Write a message" });
    await box.fill(text);
    await box.press("Enter");
    const res = await posted;
    expect(res.status()).toBe(201);
    const message = (await res.json()).data as { id: number; body: string };
    expect(message.body).toBe(text);
    sent.push(message.id);

    // The panel is now the conversation with that person, the message in it.
    await expect(panel(student).getByText(text)).toBeVisible();
    await expect(panel(student).getByRole("button", { name: /Test Instructor/ })).toBeVisible();
  });

  test("it is on the other side, and the next one arrives live", async () => {
    await openPanel(instructor);
    await panel(instructor).getByRole("button", { name: /Test Student/ }).first().click();
    await expect(panel(instructor).getByText(`${run} first`)).toBeVisible();

    const text = `${run} live`;
    const posted = student.waitForResponse(isPost(/\/conversations\/\d+\/messages$/));
    const box = panel(student).getByRole("textbox", { name: "Message Test Instructor" });
    await box.fill(text);
    await box.press("Enter");
    sent.push(((await (await posted).json()).data as { id: number }).id);

    // No reload: the socket brings it.
    await expect(panel(instructor).getByText(text)).toBeVisible({ timeout: 15_000 });
  });

  test("edit happens in place, and delete takes the message away", async () => {
    const row = panel(student).locator("[data-message-id]").filter({ hasText: `${run} live` });
    await row.hover();
    await row.getByRole("button", { name: "Message options" }).click();
    await student.getByRole("menuitem", { name: "Edit" }).click();

    const editor = panel(student).getByRole("textbox", { name: "Edit message" });
    await expect(editor).toBeFocused();
    const edited = `${run} live, edited`;
    const patched = student.waitForResponse((r) => r.request().method() === "PATCH" && /\/conversations\/messages\/\d+$/.test(r.url()));
    await editor.fill(edited);
    await editor.press("Enter");
    const res = await patched;
    expect(res.status()).toBe(200);
    expect(((await res.json()).data as { body: string }).body).toBe(edited);
    await expect(panel(student).getByText(edited)).toBeVisible();
    await expect(panel(student).getByText("Edited", { exact: true })).toBeVisible();
    // The other side gets the edit too.
    await expect(panel(instructor).getByText(edited)).toBeVisible({ timeout: 15_000 });

    const gone = panel(student).locator("[data-message-id]").filter({ hasText: edited });
    await gone.hover();
    await gone.getByRole("button", { name: "Message options" }).click();
    const deleted = student.waitForResponse((r) => r.request().method() === "DELETE" && /\/conversations\/messages\/\d+$/.test(r.url()));
    await student.getByRole("menuitem", { name: "Delete" }).click();
    expect((await deleted).status()).toBe(200);
    // No confirmation, and no "Message deleted" left behind.
    await expect(panel(student).getByText(edited)).toHaveCount(0);
    await expect(panel(student).getByText("Message deleted", { exact: true })).toHaveCount(0);
  });

  test("right-click a conversation to mute it, and again to unmute", async () => {
    await panel(student).getByRole("button", { name: "Back to conversations" }).click();
    const row = panel(student).locator("li button").filter({ hasText: "Test Instructor" }).first();

    await row.click({ button: "right" });
    let muted = student.waitForResponse(isPost(/\/conversations\/\d+\/mute$/));
    await student.getByRole("menuitem", { name: "Mute" }).click();
    let res = await muted;
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toEqual({ muted: true });
    await expect(row.getByLabel("Muted")).toBeVisible();

    await row.click({ button: "right" });
    muted = student.waitForResponse(isPost(/\/conversations\/\d+\/mute$/));
    await student.getByRole("menuitem", { name: "Unmute" }).click();
    res = await muted;
    expect(res.request().postDataJSON()).toEqual({ muted: false });
    await expect(row.getByLabel("Muted")).toHaveCount(0);
  });

  test("Expand opens the big view; a link from it lands on the page with Messages back in its panel", async () => {
    await panel(instructor).getByRole("button", { name: "Expand" }).click();
    const dialog = instructor.getByRole("dialog", { name: "Messages" });
    await expect(dialog).toBeVisible();
    await expect(panel(instructor)).toHaveCount(0);

    // The conversation's name opens its info; Profile is a link to the person.
    await dialog.getByRole("button", { name: /Test Student/ }).last().click();
    await instructor.getByRole("link", { name: "Profile" }).click();

    await expect(instructor).toHaveURL(/\/people\/\d+/);
    await expect(dialog).toHaveCount(0);
    await expect(panel(instructor)).toBeVisible();
  });
});
