import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import {
  authAs,
  cleanupAdFixtures,
  dismissCookieBanner,
  givenDueAd,
  recordsFor,
  signOffThroughUi,
} from "../helpers/airworthiness";

/**
 * Airworthiness Directives, walked end to end from each chair that actually touches them.
 *
 * WHY BY ROLE AND NOT BY FEATURE. The feature specs next door prove the mechanism: a record
 * is written, a snapshot survives a supersession, a second sign-off does not eat the first.
 * All of that can be true while the product is still unusable, because an AD is not handled
 * by one person. An owner decides whether the school tracks them at all. A technician does
 * the work and signs it. An IA puts their Inspection Authorization behind an annual and has
 * to be able to see the whole history. Somebody eventually has to hand a stack of paper to
 * an inspector or a buyer's mechanic.
 *
 * Each of those is a different screen, a different permission, and a different question, and
 * the seams between them are where this has broken every time. So these tests are journeys,
 * not assertions about functions.
 *
 * WHAT IS DELIBERATELY NOT HERE: nothing in this file decides whether an AD applies. That
 * determination belongs to a certificated person, and no test should imply the software makes
 * it.
 */

test.afterAll(async ({ request }) => {
  await cleanupAdFixtures(request);
});

/* ------------------------------------------------------------------------------------- */

test.describe("The owner deciding whether to track ADs at all", () => {
  test("can turn tracking on, and is told what we could match before deciding", async ({
    page,
    request,
  }) => {
    const auth = await authAs(request, "owner");

    await page.goto("/settings?tab=ad-tracking");
    await dismissCookieBanner(page);

    // THE ORDER MATTERS. The readiness panel is on the same page as the choice, and visible
    // before anything is switched on, because "should I turn this on" is unanswerable
    // without knowing how well it could work on this particular fleet.
    await expect(page.getByText("What we could match")).toBeVisible();
    await expect(page.getByRole("button", { name: /Not here/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await page.getByRole("button", { name: /I track them here/ }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    const after = await (
      await request.get(`${auth.base}/organizations/adTracking`, { headers: auth.headers })
    ).json();
    expect(after.data.mode).toBe("manual");

    // The sentence that has to survive every mode, including this one.
    await expect(
      page.getByText(/never decides that an Airworthiness Directive does not apply/i)
    ).toBeVisible();

    await request.patch(`${auth.base}/organizations/adTracking`, {
      headers: auth.headers,
      data: { mode: "off" },
    });
  });

  test("adds an AD with the three things that make it citable", async ({ page, request }) => {
    const auth = await authAs(request, "owner");
    const fixture = await givenDueAd(request, auth, { label: "OWNER" });

    await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent(fixture.name)}`);
    await dismissCookieBanner(page);

    // The badge is what separates a regulation from an oil change at a glance, and it is
    // the whole reason `sourceType` exists.
    await expect(page.getByText(fixture.name).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("AD", { exact: true }).first()).toBeVisible();

    // And the number, amendment and revision date reached the template. 91.417(a)(2)(v)
    // wants the revision, and the DATE is the part that is easy to leave off.
    const templates = await request.get(`${auth.base}/maintenance/reminders/templates`, {
      headers: auth.headers,
    });
    const mine = ((await templates.json()).data ?? []).find(
      (t: { id: number }) => t.id === fixture.templateId
    );
    expect(mine.sourceType).toBe("ad");
    expect(mine.sourceRef).toBe(fixture.ref);
    expect(mine.revision).toBe("39-23424");
    expect(mine.revisionDate, "the revision DATE is what 91.417 asks for").toContain("2026-03-15");
  });
});

/* ------------------------------------------------------------------------------------- */

test.describe("The A&P who did the work", () => {
  test.use({ storageState: ".auth/technician.json" });

  test("signs an AD off and the record carries their certificate, not the school's", async ({
    page,
    request,
  }) => {
    const owner = await authAs(request, "owner");
    const fixture = await givenDueAd(request, owner, { label: "AP" });

    await signOffThroughUi(page, {
      templateName: fixture.name,
      method:
        "Inspected the forward wing spar carry-through per paragraph (g)(1) of the AD using " +
        "the eddy current procedure in the referenced service bulletin. No cracking found.",
      mechanic: "Dale Whitfield",
      certificateNumber: "3421887",
      certificateType: "A&P",
    });

    // THE POINT OF THE WHOLE FEATURE: what landed, not what the toast said.
    const records = await recordsFor(request, owner, fixture.ref);
    expect(records, "one sign-off writes exactly one record").toHaveLength(1);

    const record = records[0];
    expect(record.mechanicName).toBe("Dale Whitfield");
    expect(record.mechanicCertificateNumber).toBe("3421887");
    // 43.9(a)(4) wants the KIND of certificate, not only its number. "3421887" alone does
    // not say whether the signer held an Inspection Authorization, which is the entire
    // question on an annual, and this field was submitted-but-never-shown for a while.
    expect(record.mechanicCertificateType).toBe("A&P");
    expect(record.methodOfCompliance).toContain("eddy current");

    // The snapshot, taken at signature rather than read through afterwards.
    expect(record.sourceRef).toBe(fixture.ref);
    expect(record.revision).toBe("39-23424");
    expect(record.revisionDate).toContain("2026-03-15");
  });

  test("cannot sign an AD off without saying what was done", async ({ page, request }) => {
    const owner = await authAs(request, "owner");
    const fixture = await givenDueAd(request, owner, { label: "NOMETHOD" });

    await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent(fixture.name)}`);
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: "Sign off" }).first().click();
    await expect(page.getByText(/Once signed, this record can/)).toBeVisible();

    // An empty method of compliance is not a record. The submit is blocked rather than the
    // sign-off going through and leaving a row that says nothing.
    await page.getByLabel("Certified by").fill("Dale Whitfield");
    await expect(page.getByRole("button", { name: "Sign off", exact: true }).last()).toBeDisabled();

    await page.getByLabel("What was done").fill("Inspected per paragraph (g). No defects.");
    await expect(page.getByRole("button", { name: "Sign off", exact: true }).last()).toBeEnabled();

    const records = await recordsFor(request, owner, fixture.ref);
    expect(records, "nothing should have been written by a blocked submit").toHaveLength(0);
  });

  test("cannot change whether the school tracks ADs, which is not their call", async ({
    page,
    request,
  }) => {
    const tech = await authAs(request, "technician");
    const res = await request.patch(`${tech.base}/organizations/adTracking`, {
      headers: tech.headers,
      data: { mode: "catalogue" },
    });
    expect(res.status(), "turning the catalogue on is an owner decision").toBe(403);

    // And the console does not offer it either, so this is not a door drawn on a wall.
    await page.goto("/settings?tab=ad-tracking");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /I track them here/ })).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------------------------- */

test.describe("The IA at an annual", () => {
  test.use({ storageState: ".auth/technician.json" });

  /**
   * The journey this feature exists for.
   *
   * An IA signing an annual is asserting, among other things, that the aircraft's AD status
   * has been checked. That means reading the whole history for the tail, not the one line
   * that happens to be due this week, and being able to leave with a copy of it.
   */
  test("reads the whole history for one tail and leaves with a copy", async ({
    page,
    request,
  }) => {
    const owner = await authAs(request, "owner");
    const fixture = await givenDueAd(request, owner, { label: "IA" });

    await signOffThroughUi(page, {
      templateName: fixture.name,
      method:
        "Annual inspection AD review. Verified compliance with the referenced directive at " +
        "this inspection per paragraph (h). Aircraft returned to service.",
      mechanic: "Marguerite Ocampo",
      certificateNumber: "2884016",
      certificateType: "IA",
    });

    // The log, filtered to this rule the way somebody actually finds a record.
    await page.goto("/maintenance?view=compliance");
    await dismissCookieBanner(page);
    await page.getByPlaceholder(/Search records/).fill(fixture.ref);

    // What the row must show without opening anything: the number AS SIGNED, the aircraft,
    // and who put their name to it with which rating.
    await expect(page.getByText(`${fixture.ref} Rev 39-23424`).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Marguerite Ocampo").first()).toBeVisible();
    await expect(page.getByText("IA 2884016").first()).toBeVisible();

    // Opening it shows the sentence an inspector actually reads.
    await page.getByText(`${fixture.ref} Rev 39-23424`).first().click();
    await expect(page.getByText(/Annual inspection AD review/).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a signed record still says what it said after the AD is superseded", async ({
    page,
    request,
  }) => {
    const owner = await authAs(request, "owner");
    const fixture = await givenDueAd(request, owner, { label: "SUPERSEDE" });

    await signOffThroughUi(page, {
      templateName: fixture.name,
      method: "Initial compliance per paragraph (g)(1).",
      mechanic: "Marguerite Ocampo",
      certificateNumber: "2884016",
      certificateType: "IA",
    });

    // The AD is superseded and the school updates the rule it tracks.
    const patched = await request.patch(
      `${owner.base}/maintenance/reminders/templates/${fixture.templateId}`,
      {
        headers: owner.headers,
        data: { revision: "39-99999", revisionDate: "2027-01-01T00:00:00.000Z" },
      }
    );
    expect(patched.ok(), await patched.text()).toBeTruthy();

    // THE RECORD DOES NOT MOVE. If it did, every past sign-off would silently start
    // asserting a revision that did not exist when the mechanic signed, which is the one
    // way an append-only log can lie while looking healthy.
    const records = await recordsFor(request, owner, fixture.ref);
    expect(records).toHaveLength(1);
    expect(records[0].revision).toBe("39-23424");
    expect(records[0].revisionDate).toContain("2026-03-15");

    await page.goto("/maintenance?view=compliance");
    await dismissCookieBanner(page);
    await page.getByPlaceholder(/Search records/).fill(fixture.ref);
    await expect(page.getByText(`${fixture.ref} Rev 39-23424`).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`${fixture.ref} Rev 39-99999`)).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------------------------- */

test.describe("Handing the records over", () => {
  /**
   * Somebody outside the school eventually needs a copy: an inspector, a buyer's mechanic,
   * an insurer. 91.417(b)(2) makes the records transfer with the aircraft at sale, so
   * "export" is not a nice-to-have on this report.
   *
   * Both formats are asserted end to end because they fail differently. CSV fails by being
   * empty or by losing a column; the PDF fails by being a valid file that is unreadable,
   * which no status code catches.
   */
  test("the airworthiness report downloads as a spreadsheet and as a document", async ({
    page,
    request,
  }) => {
    const owner = await authAs(request, "owner");
    const fixture = await givenDueAd(request, owner, { label: "EXPORT" });

    await signOffThroughUi(page, {
      templateName: fixture.name,
      method: "Complied with per paragraph (g)(2). Placard installed.",
      mechanic: "Dale Whitfield",
      certificateNumber: "3421887",
      certificateType: "A&P",
    });

    await page.goto("/reports?report=airworthiness");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /^Export/ })).toBeVisible({ timeout: 20_000 });

    for (const format of ["CSV", "PDF"] as const) {
      const wait = page.waitForEvent("download", { timeout: 30_000 });
      await page.getByRole("button", { name: /^Export/ }).click();
      await page.getByRole("menuitem", { name: format }).click();
      const download = await wait;

      const name = download.suggestedFilename();
      expect(name, "the file is named in the school's dates").toMatch(
        format === "CSV" ? /\.csv$/ : /\.pdf$/
      );

      const path = await download.path();
      expect(path, `${format} produced no file`).toBeTruthy();
      const bytes = readFileSync(path!);
      expect(bytes.length, `${format} downloaded an empty file`).toBeGreaterThan(200);

      if (format === "PDF") {
        // A real PDF, not an HTML error page with a .pdf name, which is exactly what a
        // 404 through this path looks like on disk.
        expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
      } else {
        const text = bytes.toString("utf8");
        // The columns an outside reader needs. A CSV that dropped the certificate would
        // still open cleanly in a spreadsheet and be useless as evidence.
        expect(text).toContain("Aircraft");
        expect(text).toContain(fixture.ref);
        expect(text).toContain("3421887");
      }
    }
  });

  test("a student pilot cannot export the school's airworthiness report", async ({ request }) => {
    const student = await authAs(request, "student");
    const res = await request.post(`${student.base}/reports/export`, {
      headers: student.headers,
      data: {
        reportId: "airworthiness",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.000Z",
        format: "pdf",
      },
    });
    expect(res.status()).toBe(403);
  });

  /**
   * A DELIBERATE ASYMMETRY, pinned so it cannot drift by accident in either direction.
   *
   * Every other maintenance read is admin-or-technician. The compliance log is not, and the
   * route says why: a pilot in command has to determine the aircraft is airworthy before
   * flying it (91.7(a)), and "when was the annual signed" is exactly that question. The
   * console still does not put the screen in a student's navigation, so this is an API
   * decision rather than a screen anyone stumbles onto.
   *
   * If someone later decides the mechanic's certificate number should not be that wide, this
   * test is the thing that has to be changed on purpose rather than discovered in the wild.
   */
  test("a student pilot CAN read the compliance log, on purpose", async ({ request }) => {
    const student = await authAs(request, "student");
    const res = await request.get(`${student.base}/maintenance/compliance?limit=3`, {
      headers: student.headers,
    });
    expect(res.status(), "a pilot must be able to check airworthiness before flying").toBe(200);

    // But not the rest of maintenance, which is where the line actually sits.
    const reminders = await request.get(`${student.base}/maintenance/reminders?resolved=false`, {
      headers: student.headers,
    });
    expect(reminders.status()).toBe(403);
  });
});
