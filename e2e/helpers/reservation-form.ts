import { expect, type Page } from "@playwright/test";

export async function dismissCookieBanner(page: Page) {
  const accept = page.getByRole("button", { name: /^Accept$/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

export async function pickByPlaceholder(
  page: Page,
  placeholder: RegExp,
  option: RegExp,
  searchPlaceholder?: RegExp,
) {
  const trigger = page.getByRole("combobox").filter({ hasText: placeholder }).first();
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeVisible({ timeout: 25_000 });
  await trigger.click();
  if (searchPlaceholder) {
    const search = page.getByPlaceholder(searchPlaceholder).last();
    if (await search.isVisible().catch(() => false)) {
      const fill = option.source?.replace(/[\\^$.*+?()[\]{}|]/g, "") ?? "";
      if (fill) await search.fill(fill);
    }
  }
  const item = page
    .locator("[cmdk-item], [role='option']")
    .filter({ hasText: option })
    .first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
}

/** Pick the first open start time, using Next available when the smart picker is empty. */
export async function pickNextBookableSlot(page: Page) {
  const nextAvail = page.getByRole("button", { name: /Next available:/i });
  await expect
    .poll(
      async () => {
        if (await nextAvail.isVisible().catch(() => false)) return "next";
        const start = page.locator("#smart-start");
        const disabled = await start.isDisabled().catch(() => true);
        return disabled ? "wait" : "ready";
      },
      { timeout: 30_000 },
    )
    .not.toBe("wait");

  if (await nextAvail.isVisible().catch(() => false)) {
    await nextAvail.click();
    await page.waitForTimeout(800);
  }

  const startTrigger = page.locator("#smart-start");
  await expect(startTrigger).toBeEnabled({ timeout: 20_000 });
  const startLabel = ((await startTrigger.textContent()) ?? "").trim();
  if (/^Select$/i.test(startLabel) || /Checking/i.test(startLabel)) {
    await startTrigger.click();
    const opt = page.locator('[role="listbox"] [role="option"]').first();
    await expect(opt).toBeVisible({ timeout: 15_000 });
    await opt.click();
  }
}

export async function submitBookReservation(page: Page) {
  const postPromise = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/(api\/)?reservations\/?$/.test(new URL(r.url()).pathname),
    { timeout: 45_000 },
  );
  await page.getByRole("button", { name: /^Book reservation$/i }).click();

  const alert = page.getByRole("alert");
  const raced = await Promise.race([
    postPromise.then((r) => ({ kind: "post" as const, r })),
    alert
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(async () => ({
        kind: "alert" as const,
        text: (await alert.textContent()) ?? "",
      }))
      .catch(() => null),
  ]);
  if (!raced || raced.kind === "alert") {
    throw new Error(
      `Book blocked before POST. Alert: ${
        raced && raced.kind === "alert" ? raced.text : "(none)"
      }`,
    );
  }
  expect(
    raced.r.ok(),
    `POST /reservations failed ${raced.r.status()}: ${(await raced.r.text()).slice(0, 400)}`,
  ).toBeTruthy();
  return raced.r;
}
