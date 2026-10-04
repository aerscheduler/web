import { describe, expect, it } from "vitest";
import type { ComponentLife } from "@/types/api";
import { componentHours, lifeFigure } from "./resource-components";
import { missingPapersSentence } from "./resource-papers";

const life = (over: Partial<ComponentLife>): ComponentLife => ({
  meter: "tach",
  meterNow: 20000,
  timeNow: 4600,
  hours: null,
  calendar: null,
  status: "ok",
  binding: null,
  ...over,
});

describe("a component's headline figure", () => {
  it("says how much is left on the clock that decides, in hours from tenths", () => {
    expect(lifeFigure(life({ status: "dueSoon", binding: "hours", hours: { limit: 5000, left: 400, dueAtMeter: 20400, warnWithin: 500, status: "dueSoon" } }))).toBe("40.0 h left");
    expect(lifeFigure(life({ status: "overdue", binding: "hours", hours: { limit: 5000, left: -35, dueAtMeter: 20400, warnWithin: 500, status: "overdue" } }))).toBe("3.5 h past limit");
    expect(lifeFigure(life({ status: "overdue", binding: "hours", hours: { limit: 5000, left: 0, dueAtMeter: 20400, warnWithin: 500, status: "overdue" } }))).toBe("At its limit");
  });

  it("counts days near a calendar limit and names the day further out", () => {
    const cal = (daysLeft: number, dueOn = "2027-03-14") =>
      lifeFigure(life({ status: "ok", binding: "calendar", calendar: { limitMonths: 72, dueOn, daysLeft, warnWithin: 219, status: "ok" } }));
    expect(cal(1)).toBe("1 day left");
    expect(cal(60)).toBe("60 days left");
    expect(cal(200)).toBe("Until Mar 14, 2027");
    expect(cal(0)).toBe("Limit today");
    expect(cal(-3, "2026-10-02")).toBe("Past limit Oct 2");
  });

  it("is plain about a part with no limit, one it cannot count, and one that came off", () => {
    expect(lifeFigure(life({ status: "none" }))).toBe("No limit");
    expect(lifeFigure(life({ status: "none", hours: { limit: 5000, left: null, dueAtMeter: null, warnWithin: 500, status: null } }))).toBe("Not counted");
    expect(lifeFigure(life({ status: "removed" }))).toBe("Came off");
  });

  it("groups thousands", () => {
    expect(componentHours(200000)).toBe("20,000.0");
  });
});

describe("the papers every aircraft has to carry", () => {
  it("names whichever of the certificate and the registration is missing", () => {
    expect(missingPapersSentence([])).toBe("No airworthiness certificate or registration on file.");
    expect(missingPapersSentence([{ category: "poh" }, { category: "registration" }])).toBe("No airworthiness certificate on file.");
    expect(missingPapersSentence([{ category: "airworthiness_certificate" }])).toBe("No registration certificate on file.");
    expect(missingPapersSentence([{ category: "airworthiness_certificate" }, { category: "registration" }])).toBeNull();
  });
});
