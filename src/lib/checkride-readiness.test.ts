import { describe, expect, it } from "vitest";
import type { Endorsement, Standing } from "@/types/api";
import { calendarMonthsBack, checkrideReadiness } from "./checkride-readiness";

const NOW = new Date(2026, 9, 18, 12); // 18 October 2026, local

const end = (templateCode: string, signedAt: Date, extra: Partial<Endorsement> = {}): Endorsement => ({
  id: Math.floor(Math.random() * 1e6),
  templateCode,
  title: templateCode,
  renderedText: "x",
  signedAt: signedAt.toISOString(),
  expiresAt: null,
  signerCertificateNumber: null,
  orgUserId: 1,
  signedByOrgUserId: 2,
  enrollmentId: null,
  supersedesId: null,
  ...extra,
});

const standing = (met: boolean, faaSourced = true, label = "Total flight"): Standing => ({
  requirementId: 1, code: "x", label, requiredDeciHours: 400, requiredCount: null,
  creditedDeciHours: met ? 400 : 300, creditedCount: 0, rawDeciHours: 0, disallowedDeciHours: 0,
  cappedBy: null, remaining: met ? 0 : 100, met, faaSourced, staleDeciHours: 0, staleCount: 0,
  recencyCalendarMonths: null,
});

const progress = (over: Partial<Parameters<typeof checkrideReadiness>[0]> = {}) => ({
  standings: [standing(true)],
  lessonsComplete: 20,
  lessonsTotal: 20,
  certificateSought: "private",
  ...over,
});

const all = [end("A.36", new Date(2026, 6, 1)), end("A.37", new Date(2026, 9, 1)), end("A.1", new Date(2026, 9, 1))];
const state = (r: ReturnType<typeof checkrideReadiness>, key: string) => r!.items.find((i) => i.key === key)!.state;

describe("checkrideReadiness", () => {
  it("says nothing for a course with no certificate", () => {
    expect(checkrideReadiness(progress({ certificateSought: null }), all, NOW)).toBeNull();
    expect(checkrideReadiness(progress({ certificateSought: "tailwheel" }), all, NOW)).toBeNull();
  });

  it("is ready with everything done, A.2 being advisory only", () => {
    const r = checkrideReadiness(progress(), all, NOW)!;
    expect(r.ready).toBe(true);
    expect(state(r, "review")).toBe("advisory");
  });

  it("names the certificate's own endorsements", () => {
    const r = checkrideReadiness(progress({ certificateSought: "instrument" }), all, NOW)!;
    expect(state(r, "knowledge")).toBe("missing");
    expect(r.items.find((i) => i.key === "practical")!.label).toMatch(/A\.43/);
  });

  it("counts lessons left and FAA shortfalls only", () => {
    const r = checkrideReadiness(
      progress({ lessonsComplete: 18, standings: [standing(true), standing(false, false, "School stage check")] }),
      all,
      NOW
    )!;
    expect(state(r, "lessons")).toBe("missing");
    expect(r.items[0].detail).toBe("2 lessons to go, of 20");
    expect(state(r, "hours")).toBe("done");
  });

  it("takes A.1 from the two preceding calendar months, not 60 days", () => {
    expect(calendarMonthsBack(NOW, 2)).toEqual(new Date(2026, 7, 1));
    //1 August counts in October; 31 July does not.
    expect(state(checkrideReadiness(progress(), [...all.slice(0, 2), end("A.1", new Date(2026, 7, 1, 9))], NOW), "prereq")).toBe("done");
    const old = checkrideReadiness(progress(), [...all.slice(0, 2), end("A.1", new Date(2026, 6, 31, 9))], NOW)!;
    expect(state(old, "prereq")).toBe("missing");
    expect(old.ready).toBe(false);
  });

  it("ignores an expired endorsement", () => {
    const expired = end("A.37", new Date(2026, 5, 1), { expiresAt: new Date(2026, 8, 1).toISOString() });
    expect(state(checkrideReadiness(progress(), [all[0], expired, all[2]], NOW), "practical")).toBe("missing");
  });
});
