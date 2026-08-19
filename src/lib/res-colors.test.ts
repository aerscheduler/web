import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE RESERVATION HUES ARE SHARED WITH THE MOBILE APP, BY HAND.
 *
 * The app declares the same seven colours in `lib/constants/style.dart`
 * (`calendarColorSolo`, `calendarColorDual`, …) and there is no shared source between the
 * two repositories, so the only thing keeping them equal is a person remembering. This
 * test pins the light values; the app has the mirror of it in
 * `test/reservation_type_colors_test.dart`.
 *
 * If this fails you have changed a hue here. Change it in the app too, then update both
 * tests. Do not just edit the expected value.
 *
 * Why it matters: a booking is identified by colour on a board where the block can be a
 * few points wide, and the app and console are read by the same people about the same
 * flights. Solo and dual drifting together is what prompted this, a school could not tell
 * an instructional flight from a solo at a glance.
 */
const EXPECTED: Record<string, string> = {
  "--res-solo": "#1967d2",
  "--res-dual": "#b5397e",
  "--res-ground": "#5b6472",
  "--res-sim": "#9a6a45",
  "--res-rental": "#17876f",
  "--res-guest": "#7256b0",
  "--res-maintenance": "#5e7290",
};

describe("reservation type colours", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  // The light values are the first declaration of each token; the dark-mode block
  // redeclares them further down and is deliberately not pinned here.
  const firstValueOf = (token: string): string | null => {
    const m = css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
    return m ? m[1].toLowerCase() : null;
  };

  for (const [token, hex] of Object.entries(EXPECTED)) {
    it(`${token} still matches the app`, () => {
      expect(firstValueOf(token)).toBe(hex);
    });
  }

  it("has a dark-mode value for every token", () => {
    for (const token of Object.keys(EXPECTED)) {
      const all = css.match(new RegExp(`${token}:\\s*#[0-9a-fA-F]{6}`, "g")) ?? [];
      expect(all.length).toBeGreaterThanOrEqual(2);
    }
  });
});
