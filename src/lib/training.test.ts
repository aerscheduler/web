import { describe, expect, it } from "vitest";
import { holdsTrainingGrant, ledgerDateLabel, logbookDayFromIso, logbookDayToOccurredAt } from "./training";

describe("ledgerDateLabel", () => {
  it("keeps a UTC-midnight logbook date on that calendar day", () => {
    expect(ledgerDateLabel("2024-06-01T00:00:00.000Z", false)).toBe(
      new Date("2024-06-01T00:00:00.000Z").toLocaleDateString(undefined, {
        timeZone: "UTC",
      })
    );
  });

  it("formats a lesson that started at UTC midnight in the viewer's timezone", () => {
    const iso = "2026-08-06T00:00:00.000Z";
    expect(ledgerDateLabel(iso, true)).toBe(new Date(iso).toLocaleDateString());
  });

  it("formats a real instant in the viewer's timezone", () => {
    const iso = "2026-08-05T20:00:00.000-06:00";
    expect(ledgerDateLabel(iso, true)).toBe(new Date(iso).toLocaleDateString());
  });
});

describe("holdsTrainingGrant", () => {
  const mine = {
    implied: ["configureTraining", "manageEnrollment"],
    grants: [
      { grant: "checkInstructor", courseId: 7 },
      { grant: "auditor", courseId: null },
    ],
  };

  it("treats implied admin grants as held", () => {
    expect(holdsTrainingGrant(mine, "manageEnrollment")).toBe(true);
    expect(holdsTrainingGrant(undefined, "manageEnrollment")).toBe(false);
  });

  it("lets a school-wide grant satisfy a course-scoped question", () => {
    expect(holdsTrainingGrant(mine, "auditor", 7)).toBe(true);
  });

  it("does not let a course-scoped grant satisfy a different course", () => {
    expect(holdsTrainingGrant(mine, "checkInstructor", 7)).toBe(true);
    expect(holdsTrainingGrant(mine, "checkInstructor", 8)).toBe(false);
  });
});

describe("logbookDayFromIso", () => {
  it("keeps a UTC-midnight calendar day on that date", () => {
    expect(logbookDayFromIso("2024-06-15T00:00:00.000Z", "2024-01-01")).toBe("2024-06-15");
  });

  it("uses the local calendar day for a real evening instant", () => {
    const iso = "2026-08-06T02:00:00.000Z";
    const d = new Date(iso);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(logbookDayFromIso(iso, "2024-01-01")).toBe(expected);
  });
});

describe("logbookDayToOccurredAt", () => {
  it("stores noon UTC so a US school still sees that calendar day", () => {
    expect(logbookDayToOccurredAt("2024-06-15")).toBe("2024-06-15T12:00:00.000Z");
  });
});
