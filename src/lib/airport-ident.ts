/**
 * Same rules as server `parseAirportIdent`: uppercase alphanumerics, 2–10 chars.
 *
 * A typed home-airport field is often "KAPA" with no picker row. Spaces mean a
 * name ("Centennial Airport"), not an identifier, so those stay zoneless unless
 * they picked a published row.
 */
export function typedAirportIdent(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const key = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key.length < 2 || key.length > 10) return null;
  return key;
}
