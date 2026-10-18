import { test, expect, type Browser, type Page, type Response } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Messages in the console, end to end, as a student and an instructor in two browsers:
 * the launcher opens the panel, a new message is written on a To: line, it arrives live on
 * the other side, edit happens in place, delete takes it away, a picked mention is one pill that
 * goes out as its token, a photo and a file go with a message and arrive live, a right-click
 * mutes the conversation, a reaction and a reply land on the other side with "Seen" under the
 * reply once it is read, Expand grows the same panel (and is not offered on a phone), and a
 * link followed from the bigger panel lands on the page with Messages back to its normal size.
 * Every write is checked on the wire, not just on screen.
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
    // The header's pencil; an empty list offers a second "New message" button in its empty state.
    await panel(student).getByRole("button", { name: "New message", exact: true }).first().click();
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
    await row.getByRole("button", { name: "More" }).click();
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
    await gone.getByRole("button", { name: "More" }).click();
    const deleted = student.waitForResponse((r) => r.request().method() === "DELETE" && /\/conversations\/messages\/\d+$/.test(r.url()));
    await student.getByRole("menuitem", { name: "Delete" }).click();
    expect((await deleted).status()).toBe(200);
    // No confirmation, and no "Message deleted" left behind.
    await expect(panel(student).getByText(edited)).toHaveCount(0);
    await expect(panel(student).getByText("Message deleted", { exact: true })).toHaveCount(0);
  });

  test("a picked mention is one pill: one Backspace removes it, and it goes out as its token", async () => {
    const box = panel(student).getByRole("textbox", { name: "Message Test Instructor" });
    await box.click();
    await box.pressSequentially(`${run} pill @N17`);
    await panel(student).getByRole("option").first().waitFor();
    await box.press("Enter");
    const pill = panel(student).locator("[data-mention-pill]");
    await expect(pill).toHaveCount(1);

    // Backspace over the space after it, then once more: the whole pill goes, not one letter.
    await box.press("Backspace");
    await box.press("Backspace");
    await expect(pill).toHaveCount(0);

    await box.pressSequentially("@N17");
    await panel(student).getByRole("option").first().waitFor();
    await box.press("Enter");
    await box.pressSequentially("now");
    const posted = student.waitForResponse(isPost(/\/conversations\/\d+\/messages$/));
    await box.press("Enter");
    const res = await posted;
    const sentBody = (res.request().postDataJSON() as { body: string }).body;
    expect(sentBody).toMatch(new RegExp(`^${run} pill \\{r:\\d+\\} now$`));
    sent.push(((await res.json()).data as { id: number }).id);
    await expect(pill).toHaveCount(0);
  });

  test("a photo and a PDF upload as they are picked, go with the message, and arrive live", async () => {
    // A real PNG (1x1) and a minimal PDF, picked through the paperclip's file input.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const slots = student.waitForResponse(isPost(/\/conversations\/attachments$/));
    await panel(student).getByTestId("message-attach-input").setInputFiles([
      { name: "cowling.png", mimeType: "image/png", buffer: png },
      { name: "annual.pdf", mimeType: "application/pdf", buffer: pdf },
    ]);
    expect((await slots).status()).toBe(201);
    await expect(panel(student).locator('[data-attachment-draft="ready"]')).toHaveCount(2);

    const text = `${run} with files`;
    const box = panel(student).getByRole("textbox", { name: "Message Test Instructor" });
    await box.click();
    await box.pressSequentially(text);
    const posted = student.waitForResponse(isPost(/\/conversations\/\d+\/messages$/));
    await box.press("Enter");
    const res = await posted;
    expect(res.status()).toBe(201);
    expect((res.request().postDataJSON() as { attachmentIds: number[] }).attachmentIds).toHaveLength(2);
    const message = (await res.json()).data as { id: number; attachments: { fileName: string; isImage: boolean; url: string }[] };
    sent.push(message.id);
    expect(message.attachments.map((a) => [a.fileName, a.isImage])).toEqual([
      ["cowling.png", true],
      ["annual.pdf", false],
    ]);
    // The signed link really serves the bytes.
    expect((await student.request.get(message.attachments[0]!.url)).status()).toBe(200);
    await expect(panel(student).locator('[data-attachment-draft]')).toHaveCount(0);

    // The other side gets the picture and the file card, live.
    const row = panel(instructor).locator("[data-message-id]").filter({ hasText: text });
    await expect(row.getByRole("img", { name: "cowling.png" })).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("annual.pdf")).toBeVisible();
  });

  test("a reaction and a reply arrive live, and Seen appears once the other side reads it", async () => {
    // The instructor reacts to the student's message with a thumbs-up, from the hover bar.
    const theirs = panel(instructor).locator("[data-message-id]").filter({ hasText: `${run} with files` });
    await theirs.hover();
    await theirs.getByRole("button", { name: "React", exact: true }).click();
    const reacted = instructor.waitForResponse((r) => r.request().method() === "PUT" && /\/conversations\/messages\/\d+\/reaction$/.test(r.url()));
    await instructor.getByRole("button", { name: "React \u{1F44D}" }).click();
    const reaction = await reacted;
    expect(reaction.status()).toBe(200);
    expect((reaction.request().postDataJSON() as { emoji: string }).emoji).toBe("\u{1F44D}");

    // It shows under the student's message without a reload.
    const mine = panel(student).locator("[data-message-id]").filter({ hasText: `${run} with files` });
    await expect(mine.locator("[data-message-reactions]").getByRole("button", { name: /\u{1F44D}/u })).toBeVisible({ timeout: 15_000 });

    // The instructor answers that message; the reply carries the quote.
    await theirs.hover();
    await theirs.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(panel(instructor).locator("[data-replying]")).toContainText("Replying to Test Student");
    const box = panel(instructor).getByRole("textbox", { name: "Message Test Student" });
    await expect(box).toBeFocused();
    const text = `${run} reply`;
    await box.pressSequentially(text);
    const posted = instructor.waitForResponse(isPost(/\/conversations\/\d+\/messages$/));
    await box.press("Enter");
    const res = await posted;
    expect(res.status()).toBe(201);
    const reply = (await res.json()).data as { id: number; replyTo: { id: number; preview: string } };
    expect(reply.replyTo.preview).toContain(`${run} with files`);
    await expect(panel(instructor).locator("[data-replying]")).toHaveCount(0);

    // The student sees the reply under its quote, live.
    const replyRow = panel(student).locator("[data-message-id]").filter({ hasText: text });
    await expect(replyRow.locator("[data-reply-quote]")).toContainText(`${run} with files`, { timeout: 15_000 });

    // The student has it on screen, so it is read, and the instructor's reply says Seen.
    await expect(panel(instructor).locator("[data-seen]")).toHaveText("Seen", { timeout: 15_000 });

    const token = (await apiLogin(instructor.request, ACCOUNTS.instructor)).auth.accessToken as string;
    await instructor.request.delete(`${base()}/conversations/messages/${reply.id}`, { headers: { Authorization: `Bearer ${token}` } });
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

  test("Expand makes the panel bigger in place; a link from it lands on the page with the panel back to normal", async () => {
    await panel(instructor).getByRole("button", { name: "Expand" }).click();
    // The same panel, grown: no dialog, no second surface.
    await expect(panel(instructor)).toHaveAttribute("data-expanded", "true");
    await expect(instructor.getByRole("dialog", { name: "Messages" })).toHaveCount(0);
    const box = await panel(instructor).boundingBox();
    expect(box!.width).toBeGreaterThan(380);

    // The conversation's name opens its info; Profile is a link to the person.
    await panel(instructor).getByRole("button", { name: /Test Student/ }).last().click();
    await instructor.getByRole("link", { name: "Profile" }).click();

    await expect(instructor).toHaveURL(/\/people\/\d+/);
    await expect(panel(instructor)).toBeVisible();
    await expect(panel(instructor)).not.toHaveAttribute("data-expanded", "true");
  });

  test("on a phone there is no Expand: the panel is already the whole screen", async () => {
    await instructor.setViewportSize({ width: 375, height: 812 });
    await expect(panel(instructor)).toBeVisible();
    await expect(panel(instructor).getByRole("button", { name: "Expand" })).toBeHidden();
    await instructor.setViewportSize({ width: 1280, height: 720 });
  });
});
