import { beforeEach, describe, expect, it } from "vitest";
import { isNewView, resetViewTrackingForTests } from "./analytics";

/** A re-resolve of the same URL is not a new screen (the NexwingAero pageview bursts). */
describe("isNewView", () => {
  beforeEach(() => resetViewTrackingForTests());

  it("counts the first screen and every real change, never the same href twice in a row", () => {
    expect(isNewView("/me/invoices?tab=ledger")).toBe(true);
    for (let i = 0; i < 10; i++) expect(isNewView("/me/invoices?tab=ledger")).toBe(false);
    expect(isNewView("/me/invoices?tab=invoices")).toBe(true);
    expect(isNewView("/me/invoices?tab=ledger")).toBe(true);
  });
});
