import { test, expect, type APIRequestContext, type Page, type Response } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Member groups in Messages and Announcements (2026-10-19), end to end in the console:
 *
 * - the student types a member group's name on the To: line, picks it, and lands in the
 *   conversation that follows the group, whose info says so and offers no Leave;
 * - the owner posts an announcement addressed to that group from "Who it's for", the board
 *   tags it with the group, the student in the group gets it and the renter outside it does not.
 *
 * Checked on the wire, not only on screen. Names carry a per-run E2E- prefix; the group, its
 * conversation and the announcement are removed at the end.
 */

const run = `E2E-mg-${Date.now()}`;
const groupName = `${run} glider club`;
const base = () => apiProxyTarget().replace(/\/$/, "");

async function auth(request: APIRequestContext, email: string) {
  const token = (await apiLogin(request, email)).auth.accessToken as string;
  return { Authorization: `Bearer ${token}` };
}

const isPost = (path: RegExp) => (r: Response) =>
  r.request().method() === "POST" && path.test(new URL(r.url()).pathname);

test.describe.serial("Member groups in Messages and Announcements", () => {
  let groupId: number;
  let conversationId: number | null = null;
  let announcementId: number | null = null;
  let studentId: number;

  test.beforeAll(async ({ request }) => {
    const owner = await auth(request, ACCOUNTS.owner);
    const people = (await (await request.get(`${base()}/orgUsers`, { headers: owner })).json()).data as Array<{
      id: number;
      user?: { name?: string };
    }>;
    const idOf = (name: string) => people.find((p) => p.user?.name === name)!.id;
    studentId = idOf("Test Student");
    const made = await request.post(`${base()}/groups/orgUser`, {
      headers: owner,
      data: { name: groupName, orgUserIds: [studentId, idOf("Test Instructor")] },
    });
    expect(made.status(), await made.text()).toBe(201);
    groupId = (await made.json()).data.id as number;
  });

  test.afterAll(async ({ request }) => {
    const owner = await auth(request, ACCOUNTS.owner);
    if (announcementId != null) await request.delete(`${base()}/announcements/${announcementId}`, { headers: owner, data: {} });
    // Deleting the group turns its conversation into an ordinary group; then everybody leaves it.
    await request.delete(`${base()}/groups/orgUser/${groupId}`, { headers: owner });
    if (conversationId != null) {
      for (const who of [ACCOUNTS.owner, ACCOUNTS.student, ACCOUNTS.instructor]) {
        await request.post(`${base()}/conversations/${conversationId}/leave`, { headers: await auth(request, who), data: {} });
      }
    }
  });

  test("a member group on the To: line opens the conversation that follows it", async ({ browser }) => {
    const context = await browser.newContext({ storageState: ".auth/student.json" });
    const page: Page = await context.newPage();
    await page.goto("/me");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /^Messages/ }).click();
    const panel = page.locator('section[aria-label="Messages"]');
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "New message", exact: true }).first().click();
    await panel.getByRole("textbox", { name: "To", exact: true }).fill(run);
    const option = panel.locator(`[data-member-group="${groupId}"]`);
    await expect(option).toBeVisible();
    await expect(option).toContainText("Group · 2 people");

    const opened = page.waitForResponse(isPost(new RegExp(`/conversations/member-groups/${groupId}$`)));
    await option.click();
    const res = await opened;
    expect(res.status()).toBeLessThan(300);
    const c = (await res.json()).data as { id: number; title: string; memberGroup: { id: number; name: string } };
    conversationId = c.id;
    expect(c.title).toBe(groupName);
    expect(c.memberGroup).toEqual({ id: groupId, name: groupName });

    // The conversation, named after the group, with the line that says who started it.
    await expect(panel.getByText(/started this conversation for the .* group/)).toBeVisible();

    // Its info: everyone in the group, joined and left with it; no Leave, no Add people.
    // The conversation's name opens its info.
    await panel.locator("button[aria-expanded]").filter({ hasText: groupName }).last().click();
    // (It opens in a popover, outside the panel.)
    await expect(page.locator("[data-follows-group]")).toContainText(`Everyone in the ${groupName} group`);
    await expect(page.getByRole("button", { name: /^Leave/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add people/i })).toHaveCount(0);
    await context.close();
  });

  test("an announcement addressed to the group reaches its members and nobody else", async ({ browser, request }) => {
    const context = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await context.newPage();
    await page.goto("/operations/announcements");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /New announcement/ }).first().click();
    const dialog = page.getByRole("dialog");
    const title = `${run} tow plane`;
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Message").fill("Tow at 0900");

    await dialog.locator("[data-announcement-audience]").getByRole("combobox").click();
    await page.getByRole("option", { name: groupName }).click();
    await page.keyboard.press("Escape");
    await expect(dialog.locator("[data-announcement-audience]")).toContainText(groupName);

    const posted = page.waitForResponse(isPost(/\/announcements$/));
    await dialog.getByRole("button", { name: "Post announcement" }).click();
    const res = await posted;
    expect(res.status()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ forRoles: [], forGroupIds: [groupId] });
    const made = (await res.json()).data as { id: number; forGroups: { id: number; name: string }[] };
    announcementId = made.id;
    expect(made.forGroups).toEqual([{ id: groupId, name: groupName }]);

    // The board tags it with the group.
    await expect(page.locator(`[data-announcement-group="${groupId}"]`).first()).toContainText(groupName);
    await context.close();

    // The student in the group sees it; the renter outside it does not.
    const titles = async (email: string) =>
      ((await (await request.get(`${base()}/announcements`, { headers: await auth(request, email) })).json()).data as Array<{ title: string }>).map(
        (a) => a.title,
      );
    expect(await titles(ACCOUNTS.student)).toContain(title);
    expect(await titles(ACCOUNTS.renter)).not.toContain(title);
  });
});
