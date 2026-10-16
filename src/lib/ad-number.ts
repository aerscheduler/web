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
 * What an AD is about, from its subject line, in sentence case. Subject lines name a JASC or ATA
 * code and then the system, punctuated every possible way: "Code 7931, Engine Oil Pressure.",
 * "Code: 2620: Extinguishing System", "Code 5415; Nacelles/Pylons", "Code 3700, VACUUM SYSTEM".
 * Null when there is no subject line (before about 2008) or it names no system.
 */
export function adSubjectWords(subject: string | null | undefined): string | null {
  const m = subject ? /Code:?\s*\d+(?!\d)\s*[,;:]?\s*([^.;(\d][^.;(]*)/i.exec(subject) : null;
  const words = m?.[1].replace(/\s*\/\s*/g, "/").trim();
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/**
 * A name for an inspection that implements an AD, from its subject line:
 * "Code 7931, Engine Oil Pressure." gives "AD 2013-11-11 Engine oil pressure".
 * Falls back to the manufacturer when the AD predates subject lines (before about 2008).
 * Capped at the inspection name's 60 characters.
 */
export function adInspectionName(ad: { adNumber: string; subject: string | null; manufacturer: string }): string {
  return `AD ${ad.adNumber} ${adSubjectWords(ad.subject) ?? ad.manufacturer}`.slice(0, 60).trim();
}
