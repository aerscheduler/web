// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";

//The panel is responsive, and jsdom ships no `matchMedia`. Stubbed to "desktop" so the
//sheet renders its docked form; the formatting under test is the same either way.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

import { afterEach, describe, expect, it } from "vitest";
import { AuditDetailSheet } from "./audit-detail-sheet";
import type { AuditEvent } from "@/types/api";

/**
 * EVERY HOUR FIGURE IN A DIFF READS AS HOURS, NOT AS RAW TENTHS.
 *
 * Every hour column in this schema is an integer in tenths, and the audit diff stores the
 * raw value on purpose. The conversion happens once, in this panel, against a set matched by
 * FIELD NAME. That makes it silently incomplete by default: a writer that starts emitting a
 * new key gets raw tenths and nothing anywhere errors.
 *
 * It has now happened twice. `recordReservationMeters` was widened to carry the ramp-OUT
 * readings and the instruction time, because correcting either changes the billed hours, and
 * `hobbsOut` / `tachOut` / `briefing` went straight past the set. The panel then showed
 * "Hobbs out 12005" beside its own summary saying "Hobbs out 1200.5": the same event
 * disagreeing with itself by a factor of ten, two inches apart, on the page a school opens
 * to settle a billing dispute.
 *
 * Asserted on the RENDERED OUTPUT rather than on the set, so it covers the whole path and
 * cannot be satisfied by a constant that the renderer no longer consults.
 */
const sheet = (changes: Record<string, { from: unknown; to: unknown }>) => {
  const event = {
    id: 1,
    action: "reservation.metersCorrected",
    entityType: "reservation",
    entityId: 42,
    createdAt: "2026-08-31T18:00:00.000Z",
    summary: "Meters corrected",
    changes,
  } as unknown as AuditEvent;

  render(
    <AuditDetailSheet
      event={event}
      open
      onOpenChange={() => {}}
      actionLabel={() => "Meters corrected"}
      entityLabel={() => "Reservation"}
      isDestructive={() => false}
    />
  );
};

describe("an hour figure in an audit diff", () => {
  //No global auto-cleanup in this project, so each render would otherwise stack on the last
  //and every `getByText` would find several.
  afterEach(cleanup);

  //All five figures `recordReservationMeters` can emit. If that helper grows a sixth hour
  //column, add it here and to TENTHS_FIELDS in the same commit.
  it.each([
    ["hobbs", "Hobbs"],
    ["tach", "Tach"],
    ["hobbsOut", "Hobbs Out"],
    ["tachOut", "Tach Out"],
    ["briefing", "Briefing"],
  ])("renders %s as hours, not as raw tenths", (key, label) => {
    sheet({ [key]: { from: 12000, to: 12005 } });

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("1200.0")).toBeTruthy();
    expect(screen.getByText("1200.5")).toBeTruthy();
    //The failure this exists to catch: the raw integer reaching the page.
    expect(screen.queryByText("12000")).toBeNull();
    expect(screen.queryByText("12005")).toBeNull();
  });

  //A correction only carries the figures that MOVED, so a diff holding one key is the
  //ordinary case rather than a malformed one.
  it("copes with a diff carrying a single figure", () => {
    sheet({ hobbsOut: { from: 12000, to: 12005 } });
    expect(screen.getByText("1200.5")).toBeTruthy();
  });

  //Not everything in a diff is an hour. A tail number or a count must survive untouched.
  it("leaves a non-hour field alone", () => {
    sheet({ tailNumber: { from: "N172TS", to: "N44TS" } });
    expect(screen.getByText("N44TS")).toBeTruthy();
  });
});
