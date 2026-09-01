import { describe, expect, it } from "vitest";
import { ACTION_LABEL, humanizeAction, summaryDetail } from "./reservation-audit";

/**
 * EVERY `reservation.*` ACTION THE SERVER CAN WRITE NEEDS A LABEL HERE.
 *
 * This map's fallback used to be the raw action string, so a missing entry did not fail
 * anywhere: it rendered "reservation.metersCorrected by Test Owner from the console" into
 * a customer's activity feed. Five actions were in that state, the whole money-shaped
 * group added later, because the console has TWO separate label maps (this one and the
 * Audit Logs page's) and nothing compared them.
 *
 * The list below mirrors the `reservation.*` half of `AuditAction`
 * (server/src/services/audit.ts). Adding an action there means adding it in three places:
 * here, `reservation-audit.tsx`, and `routes/_authed/audit-logs.tsx`.
 */
const SERVER_RESERVATION_ACTIONS = [
  "reservation.created",
  "reservation.rescheduled",
  "reservation.updated",
  "reservation.cancelled",
  "reservation.rampedOut",
  "reservation.rampedIn",
  "reservation.reviewConfirmed",
  "reservation.invoiced",
  "reservation.closedOut",
  "reservation.metersEntered",
  "reservation.metersCorrected",
  "reservation.splitChanged",
  "reservation.personnelChanged",
  "reservation.closeOutReopened",
] as const;

describe("reservation timeline labels", () => {
  it.each(SERVER_RESERVATION_ACTIONS)("has a human label for %s", (action) => {
    expect(ACTION_LABEL[action]).toBeTruthy();
  });

  it("never renders a dotted identifier as a label", () => {
    for (const label of Object.values(ACTION_LABEL)) {
      expect(label).not.toContain(".");
    }
  });
});

describe("humanizeAction", () => {
  //The safety net, so the NEXT unmapped action degrades to something readable instead of
  //leaking its own identifier the way metersCorrected did.
  it("turns an unmapped action into a sentence", () => {
    expect(humanizeAction("reservation.closeOutReopened")).toBe("Close out reopened");
    expect(humanizeAction("reservation.metersCorrected")).toBe("Meters corrected");
  });

  it("copes with an action carrying no dot at all", () => {
    expect(humanizeAction("somethingHappened")).toBe("Something happened");
  });
});

describe("summaryDetail", () => {
  //The server writes self-contained sentences because an API consumer reads them with no
  //label beside them. Under a title, the repeated half is noise.
  it("drops the half the label already said", () => {
    expect(summaryDetail("Meters corrected: Hobbs 2812.5 → 2812.0", "Meters corrected")).toBe(
      "Hobbs 2812.5 → 2812.0"
    );
  });

  it("keeps a summary that says something else entirely", () => {
    expect(summaryDetail("Close-out reopened, 1 sign-off cleared", "Close-out reopened")).toBe(
      "Close-out reopened, 1 sign-off cleared"
    );
  });

  it("shows nothing when the summary only restates the label", () => {
    expect(summaryDetail("Booked", "Booked")).toBeNull();
    expect(summaryDetail("Booked: ", "Booked")).toBeNull();
    expect(summaryDetail(null, "Booked")).toBeNull();
    expect(summaryDetail(undefined, "Booked")).toBeNull();
  });
});
