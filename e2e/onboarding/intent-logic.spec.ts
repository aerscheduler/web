/**
 * Pure onboarding helpers.
 *
 * These do not need a browser or a seeded org. Playwright still runs them so we do not
 * add a second test runner to `web/` for a handful of pure functions. The companion
 * UI coverage is `e2e/onboarding/checklist-tracks.spec.ts`.
 */
import { test, expect } from "@playwright/test";
import {
  attributionIsWeak,
  inferredIntent,
  resolveSetupSource,
  shouldAskHeardFrom,
  sourceFromLandingPath,
} from "../../src/lib/onboarding-intent";
import { orderForTrack, TRACKS } from "../../src/lib/onboarding-tracks";
import { CHECKLIST } from "../../src/lib/onboarding-checklist";
import type { Attribution } from "../../src/lib/attribution";

test.describe("sourceFromLandingPath", () => {
  test("maps MyFBO alternative guide to maintenance", () => {
    expect(sourceFromLandingPath("/resources/myfbo-alternative")).toBe("maintenance");
  });

  test("maps training and reports content", () => {
    expect(sourceFromLandingPath("/resources/flight-training-records")).toBe("training");
    expect(sourceFromLandingPath("/resources/flight-school-reports")).toBe("reports");
    expect(sourceFromLandingPath("/features/training")).toBe("training");
  });

  test("returns undefined for generic paths", () => {
    expect(sourceFromLandingPath("/")).toBeUndefined();
    expect(sourceFromLandingPath("/pricing")).toBeUndefined();
  });
});

test.describe("resolveSetupSource", () => {
  test("intent wins over landing path", () => {
    expect(
      resolveSetupSource({
        intent: "billing",
        landingPath: "/resources/myfbo-alternative",
        src: "maintenance",
      })
    ).toBe("billing");
  });

  test("explicit src wins over landing path when no intent", () => {
    expect(
      resolveSetupSource({
        src: "scheduling",
        landingPath: "/resources/myfbo-alternative",
      })
    ).toBe("scheduling");
  });

  test("infers from landing path when src is missing", () => {
    expect(
      resolveSetupSource({
        landingPath: "/resources/myfbo-alternative",
      })
    ).toBe("maintenance");
  });
});

test.describe("attribution weakness", () => {
  test("empty attribution asks how they heard", () => {
    expect(attributionIsWeak(null)).toBe(true);
    expect(shouldAskHeardFrom(null)).toBe(true);
  });

  test("google referrer is strong enough to skip the question", () => {
    const a: Attribution = {
      referrer: "https://www.google.com/",
      landingPath: "/resources/myfbo-alternative",
      at: new Date().toISOString(),
    };
    expect(attributionIsWeak(a)).toBe(false);
    expect(shouldAskHeardFrom(a)).toBe(false);
  });

  test("gclid is strong", () => {
    expect(
      attributionIsWeak({
        gclid: "abc",
        at: new Date().toISOString(),
      })
    ).toBe(false);
  });

  test("inferredIntent maps myfbo landing to maintenance", () => {
    expect(
      inferredIntent({
        landingPath: "/resources/myfbo-alternative",
        referrer: "https://www.google.com/",
        at: new Date().toISOString(),
      })
    ).toBe("maintenance");
  });
});

test.describe("tracks", () => {
  const ids = CHECKLIST.map((i) => i.id);

  test("every track lead id exists in the checklist catalogue", () => {
    for (const [name, track] of Object.entries(TRACKS)) {
      for (const lead of track.lead) {
        expect(ids, `${name} lead ${lead}`).toContain(lead);
      }
    }
  });

  test("maintenance track leads with maintenance", () => {
    expect(orderForTrack(ids, "maintenance")[0]).toBe("maintenance");
  });

  test("training track leads with training", () => {
    expect(orderForTrack(ids, "training")[0]).toBe("training");
  });

  test("unknown source leaves default order", () => {
    expect(orderForTrack(ids, "nope")).toEqual(ids);
    expect(orderForTrack(ids, null)).toEqual(ids);
  });
});
