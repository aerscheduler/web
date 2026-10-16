/**
 * AD numbers, the way the server's utils/adText.ts reads them: "AD 2013-11-11", "2013 11 11"
 * and "2013-11-11" are one AD, and "2007-21-14R1" is the revised one, printed "2007-21-14 R1".
 */
export function normalizeAdNumber(raw: string): string | null {
  const t = raw.trim().replace(/^AD\s*/i, "").replace(/[\s.]+/g, "-");
  const m = /^((?:19|20)\d{2}|\d{2})-(\d{2})-(\d{2})(?:-?(R\d+))?$/i.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}${m[4] ? ` ${m[4].toUpperCase()}` : ""}` : null;
}

/**
 * A name for an inspection that implements an AD, from its subject line:
 * "JASC/ATA Code 7931, Engine Oil Pressure." gives "AD 2013-11-11 Engine oil pressure".
 * Falls back to the manufacturer when the AD predates subject lines (before about 2008).
 * Capped at the inspection name's 60 characters.
 */
export function adInspectionName(ad: { adNumber: string; subject: string | null; manufacturer: string }): string {
  const fromSubject = ad.subject
    ?.replace(/\.$/, "")
    .split(/;\s*/)[0]
    .split(/,\s*/)
    .slice(1)
    .join(", ")
    .trim();
  const what = fromSubject ? fromSubject.charAt(0) + fromSubject.slice(1).toLowerCase() : ad.manufacturer;
  return `AD ${ad.adNumber} ${what}`.slice(0, 60).trim();
}
