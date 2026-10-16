import { describe, expect, it } from "vitest";
import { adInspectionName, adSubjectWords, normalizeAdNumber } from "./ad-number";

describe("normalizeAdNumber", () => {
  it.each([
    ["2013-11-11", "2013-11-11"],
    ["AD 2013-11-11", "2013-11-11"],
    ["2013 11 11", "2013-11-11"],
    ["2007-21-14R1", "2007-21-14 R1"],
    ["96-12-22", "96-12-22"],
  ])("%s is %s", (raw, want) => expect(normalizeAdNumber(raw)).toBe(want));

  it.each(["", "2013-11", "Amdt 39-17471"])("refuses %s", (raw) => expect(normalizeAdNumber(raw)).toBeNull());
});

describe("adInspectionName", () => {
  it("names it from the subject line", () => {
    expect(
      adInspectionName({ adNumber: "2013-11-11", manufacturer: "Cessna Aircraft Company", subject: "Joint Aircraft System Component (JASC)/Air Transport Association (ATA) of America Code 7931, Engine Oil Pressure." })
    ).toBe("AD 2013-11-11 Engine oil pressure");
  });

  it("falls back to the manufacturer before subject lines existed", () => {
    expect(adInspectionName({ adNumber: "96-12-22", manufacturer: "Cessna Aircraft Company", subject: null })).toBe("AD 96-12-22 Cessna Aircraft Company");
  });

  it("keeps to the 60 characters an inspection name holds", () => {
    expect(adInspectionName({ adNumber: "2026-20-11", manufacturer: "Rolls-Royce Deutschland Ltd & Co KG and a very long certificate holder", subject: null }).length).toBeLessThanOrEqual(60);
  });
});

describe("adSubjectWords", () => {
  it.each([
    ["Joint Aircraft System Component (JASC)/Air Transport Association (ATA) of America Code 7931, Engine Oil Pressure.", "Engine oil pressure"],
    ["Joint Aircraft Service Component (JASC) Code: 2620: Extinguishing System. (i) Material Incorporated by Reference", "Extinguishing system"],
    ["Air Transport Association (ATA) of America Code 5415; Nacelles/Pylons.", "Nacelles/pylons"],
    ["Joint Aircraft System Component (JASC) Code 3700, VACUUM SYSTEM.", "Vacuum system"],
    ["Joint Aircraft Service Component (JASC) Code: 2500, Equipment/ Furnishings.", "Equipment/furnishings"],
  ])("%s", (subject, want) => expect(adSubjectWords(subject)).toBe(want));

  it("is null with no subject or no system", () => {
    expect(adSubjectWords(null)).toBeNull();
    expect(adSubjectWords("Code 28.")).toBeNull();
  });
});
