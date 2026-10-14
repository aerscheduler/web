import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { auditEvents } from "./reservation-audit";

//Readings are stored in tenths. The fallback timeline printed the raw column, so a ramp-in
//read "Hobbs 36048" under a close-out that said 3604.8 (2026-10-14).
describe("auditEvents readings", () => {
  it("shows ramp readings in hours, not tenths", () => {
    const r = {
      id: 1,
      review: {
        rampedOutAt: "2026-10-13T23:04:00Z",
        rampedInAt: "2026-10-13T23:53:00Z",
        hobbsTimeOut: 36039,
        tachTimeOut: 31460,
        hobbsTimeIn: 36048,
        tachTimeIn: 31468,
      },
    } as unknown as Reservation;
    const details = auditEvents(r).map((e) => e.detail);
    expect(details).toContain("Hobbs 3603.9 · Tach 3146.0");
    expect(details).toContain("Hobbs 3604.8 · Tach 3146.8");
  });
});
