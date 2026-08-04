import {
  AsYouType,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Phone numbers in the console.
 *
 * The server stores E.164 (`+13035551234`) and is the authority on what is valid — see
 * `server/src/utils/phone.ts`. Nothing here decides whether a number is acceptable; a
 * submit always goes to the server and a rejection always comes back from it. What this
 * module does is stop the round trip being the *first* time somebody is told, and stop
 * raw E.164 being shown to a human.
 *
 * The default (`min`) metadata bundle, not the `max` one the server uses. `max` is ~145KB
 * and buys mobile-vs-landline detection and slightly stricter validation — worth it in a
 * Node process, not in a page nobody visits twice. The cost of the smaller bundle is that
 * `looksValid` is a little more permissive than the server; that is the right direction
 * for a hint, since the server still has the final say.
 */

/** Assumed for a number typed with no country code. Matches the server's default. */
const DEFAULT_COUNTRY: CountryCode = "US";

/**
 * E.164 to something a person reads: "(303) 555-1234".
 *
 * Returns the input unchanged when it can't be parsed rather than an empty string —
 * rows written before normalization existed hold arbitrary text, and blanking those
 * on screen looks like data loss.
 */
export function formatPhone(
  value: string | null | undefined,
  country?: string | null
): string {
  if (!value) return "";

  const parsed = parsePhoneNumberFromString(
    String(value).trim(),
    (country as CountryCode) || DEFAULT_COUNTRY
  );
  if (!parsed || !parsed.isValid()) return String(value);

  // A foreign number gets its country code spelled out, a domestic one doesn't —
  // "+44 7400 123456" is useful, "+1 303 555 1234" to an American reader is noise.
  return parsed.country === DEFAULT_COUNTRY ? parsed.formatNational() : parsed.formatInternational();
}

/** A `tel:` href — always the E.164 form, which is what a dialer wants. */
export function telHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  const parsed = parsePhoneNumberFromString(String(value).trim(), DEFAULT_COUNTRY);
  return parsed?.isValid() ? `tel:${parsed.number}` : `tel:${String(value).replace(/[^\d+]/g, "")}`;
}

/**
 * Reformat as the user types: "3035" -> "(303) 5".
 *
 * `AsYouType` is stateful per instance, so a fresh one per keystroke is deliberate —
 * reusing one across renders makes deleting a character reformat against stale state.
 *
 * Input containing a "+" is left completely alone. Someone typing an international
 * number is mid-way through a format we would only fight with, and the server accepts
 * it as typed.
 */
export function formatPhoneAsTyped(input: string, country?: string | null): string {
  if (input.includes("+")) return input;

  return new AsYouType((country as CountryCode) || DEFAULT_COUNTRY).input(input);
}

/**
 * A cheap "this won't be accepted" hint for the form.
 *
 * Empty counts as valid: these fields are optional, and an empty box is not an error
 * until something requires it. Callers that DO require a number check for emptiness
 * themselves, so this stays usable for both.
 */
export function looksValid(value: string | null | undefined, country?: string | null): boolean {
  if (!value || String(value).trim() === "") return true;

  const parsed = parsePhoneNumberFromString(
    String(value).trim(),
    (country as CountryCode) || DEFAULT_COUNTRY
  );
  return parsed?.isValid() ?? false;
}

/** A date-only value (`YYYY-MM-DD`) rendered without dragging a timezone into it. */
export function formatDateOfBirth(value: string | null | undefined): string {
  if (!value) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value);

  const [, y, m, d] = match;
  // Constructed in UTC and read back in UTC. `new Date("1994-03-17")` is UTC midnight,
  // which prints as the 16th for anybody west of Greenwich — the entire reason this
  // helper exists rather than the shared `formatDate`.
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Whole years since a date of birth, or null when there isn't one. */
export function ageFrom(value: string | null | undefined): number | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;

  const [, y, m, d] = match;
  const now = new Date();
  let age = now.getUTCFullYear() - Number(y);

  // Not had this year's birthday yet.
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (month < Number(m) || (month === Number(m) && day < Number(d))) age -= 1;

  return age >= 0 && age < 130 ? age : null;
}
