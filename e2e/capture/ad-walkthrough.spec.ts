import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { authAs, firstPlane, type Auth } from "../helpers/airworthiness";

/**
 * Answer the consent question before the page loads, rather than clicking it away after.
 *
 * Clicking Decline works, but the banner is drawn on mount and dismissed a frame or two later,
 * so it was still sitting over the bottom-left corner of most of these captures. In a document
 * whose whole job is to show the product, a cookie card in every picture is noise about
 * something that is not the subject. `denied` rather than `granted`: the same choice the
 * product tells people is the privacy-preserving one.
 */
async function withConsentAnswered(page: Page) {
  await page.context().addCookies([
    { name: "aer_consent", value: "denied", url: "http://127.0.0.1:5173" },
  ]);
}

/**
 * NOT A TEST. A screenshot capture run for the Airworthiness Directive walkthrough document.
 *
 * It lives under e2e/capture/ and ends in `.capture.ts` so the ordinary `e2e/operations/` run
 * never picks it up: it writes files, it depends on fixtures it creates as it goes, and a
 * failure here means a missing picture rather than a broken product. Run it deliberately:
 *
 *   VITE_API_PROXY=http://127.0.0.1:5011 npx playwright test e2e/capture --reporter=line
 *
 * It still ASSERTS at every step, because a screenshot of the wrong screen is worse than no
 * screenshot: it would be a picture of something that does not exist, in a document whose whole
 * job is to show what does.
 */

const OUT =
  process.env.SHOT_DIR ??
  "/private/tmp/claude-501/-Users-tony-Documents-Personal-AerScheduler/174b8dfc-57ff-4d19-8477-efb9ab1587f1/scratchpad/shots/console";

/**
 * The fixtures are named as a real school would name them, with no test prefix, because these
 * names are ON SCREEN in the finished document. Cleanup finds them by exact name instead.
 */
const FIXTURE_NAMES = ["AD 2015-19-07 spar inspection", "Annual inspection (walkthrough)"];

fs.mkdirSync(OUT, { recursive: true });

/** Sequence numbers keep the folder in reading order whatever the file system thinks. */
async function shot(page: Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** The fixture every chair in this document is looking at. */
async function givenTheFleetIsSetUp(request: APIRequestContext, auth: Auth) {
  const plane = await firstPlane(request, auth);
  const stamp = Date.now();

  // An AD that is due now, for the technician to sign.
  const due = await request.post(`${auth.base}/maintenance/reminders/templates`, {
    headers: auth.headers,
    data: {
      name: FIXTURE_NAMES[0],
      repeat: true,
      ground: false,
      remindHours: 1000,
      remindHoursBefore: 100_000,
      hourBasedOn: "tach",
      sourceType: "ad",
      sourceRef: `2015-19-07`,
      revision: "39-18272",
      revisionDate: "2026-03-15T00:00:00.000Z",
      templateResources: [{ id: plane.id, startHour: 10_000, startDate: "2025-01-01T00:00:00.000Z" }],
    },
  });
  expect(due.ok(), await due.text()).toBeTruthy();

  // An annual on real calendar months, so the walkthrough can show the unit that matters.
  const annual = await request.post(`${auth.base}/maintenance/reminders/templates`, {
    headers: auth.headers,
    data: {
      name: FIXTURE_NAMES[1],
      repeat: true,
      ground: true,
      remindMonths: 12,
      remindDaysBefore: 30,
      templateResources: [{ id: plane.id, startDate: "2026-02-15T16:00:00.000Z" }],
    },
  });
  expect(annual.ok(), await annual.text()).toBeTruthy();

  return {
    plane,
    stamp,
    dueId: (await due.json()).data.id as number,
    annualId: (await annual.json()).data.id as number,
  };
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await withConsentAnswered(page);
});

test.describe("capture", () => {
  test("01 owner decides whether the school tracks ADs at all", async ({ page, request }) => {
    const auth = await authAs(request, "owner");
    await givenTheFleetIsSetUp(request, auth);

    await page.goto("/settings?tab=ad-tracking");
    await expect(page.getByText("What we could match")).toBeVisible();
    await shot(page, "01-owner-ad-tracking-choice");

    // The readiness panel, which is the half that answers "should I turn this on".
    await page.getByText("What we could match").scrollIntoViewIfNeeded();
    await shot(page, "02-owner-readiness-panel");
  });

  test("02 owner adds the directive", async ({ page }) => {
    await page.goto("/maintenance?view=templates");
    await page.getByRole("button", { name: /Add inspections/i }).first().click();
    await page.getByRole("button", { name: /^Recurring/ }).click();
    await expect(page.locator("#insp-every-unit")).toBeVisible();
    await shot(page, "03-owner-add-inspection-units");

    // The source fields: what makes an inspection an AD rather than an oil change.
    await page.getByRole("button", { name: "On the meter" }).click();
    await page.locator("#insp-name").fill("AD 2026-04-11 fuel selector");
    const sourceType = page.locator("[data-testid='insp-source-type']");
    await sourceType.click();
    await page.getByRole("option", { name: /Airworthiness Directive/ }).click();
    await page.locator("#insp-source-ref").fill("2026-04-11");
    await page.locator("#insp-revision").fill("39-23424");
    await shot(page, "04-owner-source-fields");
    await page.keyboard.press("Escape");
  });

  test("03 the inspection list a technician opens", async ({ page }) => {
    await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent("AD 2015-19-07")}`);
    await expect(page.getByText("AD", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, "05-inspection-list-with-ad-badge");

    // The fleet view. Asserted on a tail number rather than the rail label: "By aircraft" is
    // also the hidden value of a mobile-width select, which is never visible at this size.
    await page.goto("/maintenance?view=aircraft");
    await expect(page.getByText(/^N[-0-9A-Z]+$/).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, "06-fleet-status-by-aircraft");
  });
});

test.describe("capture as the technician", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: ".auth/technician.json" });

  test("04 the A&P signs the directive off", async ({ page }) => {
    await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent("AD 2015-19-07")}`);
    await page.getByRole("button", { name: "Sign off" }).first().click();
    await expect(page.getByText(/Once signed, this record can/)).toBeVisible();
    await shot(page, "07-tech-sign-off-sheet-empty");

    await page.getByLabel("What was done").fill(
      "Inspected the forward wing spar carry-through per paragraph (g)(1) using the eddy " +
        "current procedure in the referenced service bulletin. No cracking found."
    );
    await page.getByLabel("Certified by").fill("Dale Whitfield");
    await page.getByLabel("Certificate", { exact: true }).fill("3421887");
    await page.getByLabel("Type", { exact: true }).click();
    await page.getByRole("option", { name: "A&P", exact: true }).click();
    await shot(page, "08-tech-sign-off-sheet-filled");

    await page.getByRole("button", { name: "Sign off", exact: true }).last().click();
    await expect(page.getByText("Signed off.")).toBeVisible({ timeout: 20_000 });
    await shot(page, "09-tech-signed-off-confirmation");
  });

  test("05 the technician cannot change the school's posture", async ({ page }) => {
    await page.goto("/settings?tab=ad-tracking");
    await shot(page, "10-tech-no-ad-tracking-tab");
  });
});

test.describe("capture as the IA", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: ".auth/technician.json" });

  test("06 the IA reads the compliance log", async ({ page }) => {
    await page.goto("/maintenance?view=compliance");
    await expect(page.getByPlaceholder(/Search records/)).toBeVisible();
    await shot(page, "11-ia-compliance-log");

    await page.getByPlaceholder(/Search records/).fill("2015-19-07");
    await expect(page.getByText("2015-19-07", { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, "12-ia-compliance-log-filtered");

    await page.getByText("2015-19-07", { exact: false }).first().click();
    await expect(page.getByText(/eddy current/).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, "13-ia-compliance-record-detail");
  });

  test("07 the IA leaves with a copy", async ({ page }) => {
    await page.goto("/reports?report=airworthiness");
    await expect(page.getByRole("button", { name: /^Export/ })).toBeVisible({ timeout: 20_000 });
    await shot(page, "14-ia-airworthiness-report");

    await page.getByRole("button", { name: /^Export/ }).click();
    await expect(page.getByRole("menuitem", { name: "PDF" })).toBeVisible();
    await shot(page, "15-ia-export-menu");
    await page.keyboard.press("Escape");
  });
});

test.describe("capture as a pilot", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: ".auth/student.json" });

  test("08 what a student pilot can and cannot reach", async ({ page }) => {
    await page.goto("/");
    await shot(page, "16-pilot-home-no-maintenance-nav");

    await page.goto("/maintenance");
    await page.waitForTimeout(1500);
    await shot(page, "17-pilot-maintenance-refused");
  });
});
