import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

async function bearerToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("aer.token"));
  expect(token, "session token missing after onboarding").toBeTruthy();
  return token as string;
}

async function apiGet<T>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.get(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  expect(res.ok(), `${path} ${res.status()} ${JSON.stringify(body).slice(0, 400)}`).toBeTruthy();
  if (body && typeof body === "object" && "data" in body) return (body as { data: T }).data;
  return body as T;
}

async function apiAuthOrg(request: APIRequestContext, token: string) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.get(`${base}/auth/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  expect(res.ok(), `/auth/ ${res.status()}`).toBeTruthy();
  return body.data.organization as {
    id: number;
    name: string;
    organizationType: string;
    preferences?: { newOrgOnboardingComplete?: boolean };
  };
}

async function pickAirport(page: Page, query: string, option: RegExp) {
  await page.getByLabel("Home airport").fill(query);
  await expect(page.getByRole("option", { name: option })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("option", { name: option }).click();
}

async function acceptCookies(page: Page) {
  const accept = page.getByRole("button", { name: /^Accept$/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function signupFresh(page: Page, name: string) {
  const stamp = Date.now();
  const email = `e2e-onboard-${stamp}@example.com`;
  await page.goto("/signup");
  await acceptCookies(page);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  return email;
}

async function onboardingComplete(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("aer.session");
    if (!raw) return false;
    try {
      const s = JSON.parse(raw) as {
        organization?: { preferences?: { newOrgOnboardingComplete?: boolean } };
      };
      return Boolean(s.organization?.preferences?.newOrgOnboardingComplete);
    } catch {
      return false;
    }
  });
}

async function finishWizard(
  page: Page,
  opts?: { heardFromLabel?: string; heardFromId?: string; tips?: boolean },
) {
  await expect(page.getByRole("heading", { name: /tips while you get going/i })).toBeVisible();
  await acceptCookies(page);
  if (opts?.tips === false) {
    await page.getByRole("checkbox", { name: /Send me those tips/i }).uncheck();
  }
  if (opts?.heardFromLabel && opts.heardFromId) {
    const pill = page.getByRole("button", { name: opts.heardFromLabel, exact: true });
    await pill.click();
    await expect(pill).toHaveAttribute("aria-pressed", "true");
  }
  const heardSave =
    opts?.heardFromId
      ? page.waitForResponse((res) => {
          if (!res.url().includes("/organizations/onboarding")) return false;
          if (res.request().method() !== "PATCH") return false;
          const body = res.request().postDataJSON() as { heardFrom?: string } | null;
          return body?.heardFrom === opts.heardFromId;
        })
      : null;
  const completeSave = page.waitForResponse((res) => {
    if (!/\/organizations\/?(\?|$)/.test(res.url())) return false;
    if (res.request().method() !== "PATCH") return false;
    const body = res.request().postDataJSON() as {
      preferences?: { newOrgOnboardingComplete?: boolean };
    } | null;
    return body?.preferences?.newOrgOnboardingComplete === true;
  });
  await page.getByRole("button", { name: "Finish" }).click();
  if (heardSave) {
    const heardRes = await heardSave;
    const heardBody = (await heardRes.json()) as { data?: { heardFrom?: string | null }; message?: string };
    expect(
      heardRes.ok(),
      `PATCH /organizations/onboarding ${heardRes.status()} ${JSON.stringify(heardBody).slice(0, 400)}`,
    ).toBeTruthy();
    expect(heardBody.data?.heardFrom, "PATCH /organizations/onboarding must persist heardFrom").toBe(
      opts.heardFromId,
    );
  }
  const completeRes = await completeSave;
  expect(completeRes.ok(), await completeRes.text()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /tips while you get going/i })).toHaveCount(0);
  await expect.poll(() => onboardingComplete(page), { timeout: 15_000 }).toBe(true);
}

/** Type and name are already filled. Walk intent, then submit. */
async function finishOperationDetails(
  page: Page,
  lastLabel: "Create operation" | "Continue",
) {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /What do you want working first/i })).toBeVisible();
  await page.getByRole("button", { name: lastLabel }).click();
}

async function startSchoolOperation(page: Page, name: string) {
  await page.getByRole("button", { name: /I run a flight school/i }).click();
  await expect(page.getByRole("heading", { name: /kind of operation/i })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Tell us about your operation" })).toBeVisible();
  await page.getByLabel("Operation name").fill(name);
}

test.describe("Onboarding gates", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated /onboarding sends you to login", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Onboarding already complete", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("complete org sees You're all set", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: /all set/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
    await expect(page.getByText(/already configured/i)).toHaveCount(0);
    await expect(page.getByText(/Remaining setup is on your dashboard/i)).toBeVisible();
    await expect(page.getByTestId("onboarding-billing")).toHaveCount(0);
  });

  test("?restart=1 replays the wizard on the local dev server", async ({ page }) => {
    await page.goto("/onboarding?restart=1");
    const persona = page.getByRole("heading", { name: /What brings you to AerScheduler/i });
    const allSet = page.getByRole("heading", { name: /all set/i });
    await expect(persona.or(allSet)).toBeVisible();
    if (await allSet.isVisible()) {
      // Production builds ignore ?restart=1. Local Vite is import.meta.env.DEV.
      return;
    }
    await expect(persona).toBeVisible();
    await expect(page.getByRole("button", { name: /I run a flight school/i })).toBeVisible();
    await expect(page.getByTestId("onboarding-billing")).toHaveCount(0);
  });
});

test.describe("Onboarding members cannot operate", () => {
  test.use({ storageState: ".auth/student.json" });

  test("student does not reach Create operation, even with ?restart=1", async ({ page }) => {
    await page.goto("/onboarding?restart=1");
    await expect(page.getByRole("heading", { name: /all set/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What brings you to AerScheduler/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /What do you want working first/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Create operation|Continue/i })).toHaveCount(0);
  });
});

test.describe("Onboarding wizard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("student join has a no-code escape", async ({ page }) => {
    await signupFresh(page, "E2E Student");
    await page.getByRole("button", { name: /I'm joining an organization/i }).click();
    await expect(page.getByRole("heading", { name: "Join your organization" })).toBeVisible();
    await page.getByLabel("Invite code").fill("NOT-A-REAL-CODE");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByText(/didn't work|invalid/i)).toBeVisible();
    await page.getByRole("button", { name: /have a code/i }).click();
    await expect(page.getByRole("heading", { name: /What brings you to AerScheduler/i })).toBeVisible();
  });

  test("school owner can skip aircraft and billing without checklist preview", async ({
    page,
    request,
  }) => {
    await signupFresh(page, "E2E Owner");
    await startSchoolOperation(page, `E2E Onboard ${Date.now()}`);
    await finishOperationDetails(page, "Create operation");

    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What brings you to AerScheduler/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Skip for now" }).click();

    const billing = page.getByTestId("onboarding-billing");
    await expect(billing).toBeVisible();
    await expect(page.getByRole("heading", { name: "Get paid when you close out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect Stripe" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Not now\. Go to the dashboard/i })).toHaveCount(0);
    await expect(page.getByText(/Add your first aircraft/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /I'll do this later/i })).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("onboarding-billing")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Get paid when you close out" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Skip for now" }).click();
    await finishWizard(page);

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: /all set/i })).toBeVisible();
    await expect(page.getByTestId("onboarding-billing")).toHaveCount(0);
    await page.getByRole("link", { name: "Go to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    const token = await bearerToken(page);
    const org = await apiAuthOrg(request, token);
    expect(org.preferences?.newOrgOnboardingComplete).toBe(true);
    const planes = await apiGet<{ id: number }[]>(request, token, "/resources/planes");
    expect(planes).toHaveLength(0);
  });

  test("back from aircraft updates the same organization", async ({ page, request }) => {
    await signupFresh(page, "E2E Owner");
    const firstName = `E2E Onboard ${Date.now()}`;
    await startSchoolOperation(page, firstName);
    await pickAirport(page, "KAPA", /KAPA Centennial Airport/i);
    await finishOperationDetails(page, "Create operation");
    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toBeVisible({
      timeout: 30_000,
    });

    let orgPosts = 0;
    let orgPatches = 0;
    page.on("request", (req) => {
      if (!/\/organizations\/?(\?|$)/.test(req.url())) return;
      if (req.method() === "POST") orgPosts += 1;
      if (req.method() === "PATCH") orgPatches += 1;
    });

    const token = await bearerToken(page);
    const beforeIntent = await apiGet<{ source: string | null }>(
      request,
      token,
      "/organizations/onboarding",
    );
    expect(beforeIntent.source).toBe("scheduling");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("Operation name")).toHaveValue(firstName);
    const renamed = `${firstName} Renamed`;
    await page.getByLabel("Operation name").fill(renamed);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /What do you want working first/i })).toBeVisible();
    await page.getByRole("button", { name: /Track maintenance/i }).click();
    const sourcePatch = page.waitForResponse((res) => {
      if (!res.url().includes("/organizations/onboarding")) return false;
      if (res.request().method() !== "PATCH") return false;
      const body = res.request().postDataJSON() as { source?: string } | null;
      return body?.source === "maintenance";
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toBeVisible({
      timeout: 30_000,
    });
    const sourceRes = await sourcePatch;
    expect(sourceRes.ok(), await sourceRes.text()).toBeTruthy();
    expect(orgPosts, "must not POST a second organization").toBe(0);
    expect(orgPatches, "must PATCH the organization that already exists").toBeGreaterThan(0);

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          try {
            const s = JSON.parse(localStorage.getItem("aer.session") || "null") as {
              organization?: { name?: string };
            };
            return s.organization?.name ?? "";
          } catch {
            return "";
          }
        });
      })
      .toBe(renamed);

    const afterIntent = await apiGet<{ source: string | null }>(
      request,
      token,
      "/organizations/onboarding",
    );
    expect(afterIntent.source).toBe("maintenance");

    const locations = await apiGet<
      { name: string; address?: { city?: string; state?: string } }[]
    >(request, token, "/locations");
    expect(locations[0].name).toMatch(/Centennial/i);
    expect(locations[0].address?.city).toMatch(/Denver/i);
    expect(locations[0].address?.state).toBe("CO");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("Home airport")).toHaveValue(/Centennial/i);
    await page.getByLabel("Home airport").fill("MY STRIP");
    await finishOperationDetails(page, "Continue");
    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toBeVisible({
      timeout: 30_000,
    });
    const afterType = await apiGet<
      { name: string; address?: { city?: string; state?: string } }[]
    >(request, token, "/locations");
    expect(afterType[0].name).toMatch(/MY STRIP/i);
    expect(afterType[0].address?.city).toMatch(/Denver/i);
    expect(afterType[0].address?.state).toBe("CO");
  });

  test("school owner save: org, airport, intent, aircraft, heard-from, and tips", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const orgName = `E2E Onboard ${stamp}`;
    const tail = `N${String(stamp).slice(-5)}`;
    await signupFresh(page, "E2E Save Owner");

    await page.getByRole("button", { name: /I run a flight school/i }).click();
    await expect(page.getByRole("heading", { name: /kind of operation/i })).toBeVisible();
    await page.getByRole("button", { name: /Flying club/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Tell us about your operation" })).toBeVisible();
    await page.getByLabel("Operation name").fill(orgName);
    await pickAirport(page, "KAPA", /KAPA Centennial Airport/i);
    await expect(page.getByLabel("Home airport")).toHaveValue(/Centennial/i);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /What do you want working first/i })).toBeVisible();
    await page.getByRole("button", { name: /Track maintenance/i }).click();
    await page.getByRole("button", { name: "Create operation" }).click();

    await expect(page.getByRole("heading", { name: /Add your first aircraft/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel("Tail number").fill(tail);
    await page.getByLabel("Make").fill("Cessna");
    await page.getByLabel("Model").fill("172");
    await page.getByLabel(/Year/).fill("2018");
    await page.getByLabel("Hobbs").fill("12.3");
    await page.getByLabel("Tach").fill("10.1");
    await page.getByRole("textbox", { name: "Rate" }).fill("180");
    await page.getByRole("combobox", { name: "Rate basis" }).click();
    await page.getByRole("option", { name: /Dry/i }).click();
    await page.getByRole("combobox", { name: "Bill by" }).click();
    await page.getByRole("option", { name: /^Tach$/i }).click();
    await page.getByRole("button", { name: "Add aircraft" }).click();

    await expect(page.getByTestId("onboarding-billing")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Skip for now" }).click();

    await finishWizard(page, {
      heardFromLabel: "Google search",
      heardFromId: "google",
      tips: false,
    });

    const token = await bearerToken(page);
    const org = await apiAuthOrg(request, token);
    expect(org.name).toBe(orgName);
    expect(org.organizationType).toBe("flying_club");
    expect(org.preferences?.newOrgOnboardingComplete).toBe(true);

    const locations = await apiGet<
      { id: number; name: string; timeZone?: string | null; address?: { city?: string; state?: string } }[]
    >(request, token, "/locations");
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toMatch(/Centennial/i);
    expect(locations[0].address?.city).toMatch(/Denver/i);
    expect(locations[0].address?.state).toBe("CO");
    const home = await apiGet<{ timeZone?: string | null }>(
      request,
      token,
      `/locations/${locations[0].id}`,
    );
    expect(home.timeZone).toBe("America/Denver");

    const onboarding = await apiGet<{
      source: string | null;
      heardFrom?: string | null;
    }>(request, token, "/organizations/onboarding");
    expect(onboarding.source).toBe("maintenance");
    expect(onboarding.heardFrom).toBe("google");

    const planes = await apiGet<
      {
        type: {
          plane: {
            tailNumber: string;
            make?: string | null;
            model?: string | null;
            year?: string | null;
            hobbsTime?: number | null;
            tachTime?: number | null;
            cost?: { wetRate?: number | null; dryRate?: number | null; billByHobbsTime?: boolean };
          };
        };
      }[]
    >(request, token, "/resources/planes");
    expect(planes).toHaveLength(1);
    const plane = planes[0].type.plane;
    expect(plane.tailNumber).toBe(tail);
    expect(plane.make).toBe("Cessna");
    expect(plane.model).toBe("172");
    expect(plane.year).toBe("2018");
    expect(plane.hobbsTime).toBe(123);
    expect(plane.tachTime).toBe(101);
    expect(plane.cost?.dryRate).toBe(18000);
    expect(plane.cost?.wetRate ?? 0).toBe(0);
    expect(plane.cost?.billByHobbsTime).toBe(false);

    const prefs = await apiGet<{
      notificationPreferences?: {
        emailNotificationPreferences?: { onboardingTips?: boolean };
      };
    }>(request, token, "/orgUsers/preferences");
    expect(prefs.notificationPreferences?.emailNotificationPreferences?.onboardingTips).toBe(
      false,
    );
  });

  test("solo instructor save: type, name, skip aircraft, tips stay on", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const orgName = `E2E Solo ${stamp}`;
    await signupFresh(page, "E2E Solo");

    await page.getByRole("button", { name: /independent instructor/i }).click();
    await expect(page.getByRole("heading", { name: "Name your operation" })).toBeVisible();
    await page.getByLabel("Operation name").fill(orgName);
    await pickAirport(page, "KBOI", /KBOI.*Boise/i);
    await expect(page.getByLabel("Home airport")).toHaveValue(/Boise/i);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /What do you want working first/i })).toBeVisible();
    await page.getByRole("button", { name: /Bill and get paid/i }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /Add the aircraft you fly/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByTestId("onboarding-billing")).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByRole("checkbox")).toBeChecked();
    await finishWizard(page);

    const token = await bearerToken(page);
    const org = await apiAuthOrg(request, token);
    expect(org.name).toBe(orgName);
    expect(org.organizationType).toBe("solo_instructor");
    expect(org.preferences?.newOrgOnboardingComplete).toBe(true);

    const locations = await apiGet<{ id: number; name: string }[]>(
      request,
      token,
      "/locations",
    );
    expect(locations[0].name).toMatch(/Boise/i);
    const home = await apiGet<{ timeZone?: string | null }>(
      request,
      token,
      `/locations/${locations[0].id}`,
    );
    expect(home.timeZone).toBe("America/Boise");

    const onboarding = await apiGet<{ source: string | null }>(
      request,
      token,
      "/organizations/onboarding",
    );
    expect(onboarding.source).toBe("billing");

    const planes = await apiGet<{ id: number }[]>(request, token, "/resources/planes");
    expect(planes).toHaveLength(0);

    const prefs = await apiGet<{
      notificationPreferences?: {
        emailNotificationPreferences?: { onboardingTips?: boolean };
      };
    }>(request, token, "/orgUsers/preferences");
    expect(prefs.notificationPreferences?.emailNotificationPreferences?.onboardingTips).toBe(
      true,
    );
  });
});
