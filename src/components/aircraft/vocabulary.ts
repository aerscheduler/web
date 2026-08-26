/**
 * The aircraft vocabulary for the UI: the same enums the server enforces, plus the
 * display text.
 *
 * The database stores snake_case labels because a Postgres enum cannot hold a space.
 * Nothing a person reads should say "single_engine_land", so the mapping lives here and
 * only here, rather than being reinvented per form.
 */

export const AIRCRAFT_CATEGORIES = [
  "airplane",
  "rotorcraft",
  "glider",
  "lighter_than_air",
  "powered_lift",
  "powered_parachute",
  "weight_shift_control",
] as const;
export type AircraftCategory = (typeof AIRCRAFT_CATEGORIES)[number];

export const AIRCRAFT_CLASSES = [
  "single_engine_land",
  "multi_engine_land",
  "single_engine_sea",
  "multi_engine_sea",
  "helicopter",
  "gyroplane",
  "airship",
  "balloon",
  "land",
  "sea",
] as const;
export type AircraftClass = (typeof AIRCRAFT_CLASSES)[number];

/**
 * Which classes belong to which category. Mirrors CLASSES_BY_CATEGORY on the server and
 * the `plane_category_class_valid` CHECK constraint in the database.
 *
 * An empty list means the category has no class rating at all, and the form hides the
 * class control entirely rather than offering an empty dropdown.
 */
export const CLASSES_BY_CATEGORY: Record<AircraftCategory, AircraftClass[]> = {
  airplane: ["single_engine_land", "multi_engine_land", "single_engine_sea", "multi_engine_sea"],
  rotorcraft: ["helicopter", "gyroplane"],
  lighter_than_air: ["airship", "balloon"],
  powered_parachute: ["land", "sea"],
  weight_shift_control: ["land", "sea"],
  glider: [],
  powered_lift: [],
};

export const ENGINE_TYPES = ["piston", "turboprop", "turbojet", "turbofan", "electric", "none"] as const;
export const FUEL_TYPES = ["avgas_100ll", "mogas", "jet_a", "diesel", "electric", "none"] as const;
export const GEAR_TYPES = ["tricycle", "tailwheel", "skids", "floats", "amphibious", "skis"] as const;
export const METER_MODES = ["hobbs_and_tach", "hobbs_only", "tach_only", "none"] as const;

/**
 * Which meters a category implies, given what is currently selected.
 *
 * A GLIDER AND A BALLOON HAVE NO ENGINE, so they have no Hobbs and no tach, and
 * `meterMode: "none"` is what excludes them from automatic invoicing. Everything else runs
 * something and is assumed to meter it.
 *
 * Takes the current value and not just the category, so it can be symmetrical without
 * being destructive. Moving TO a meterless category always sets "none", because the old
 * value cannot be true any more. Moving AWAY from one only clears "none": a school that
 * deliberately set "tach only" on a Cub keeps it when they correct the category, and an
 * aeroplane never silently keeps the setting that stops it being billed.
 *
 * Shared by the aircraft form and the onboarding wizard so the two cannot disagree about
 * what a glider is, which is exactly how the wizard came to create one with meters.
 */
export function meterModeForCategory(category: AircraftCategory, current: string): string {
  const meterless = category === "glider" || category === "lighter_than_air";
  if (meterless) return "none";
  return current === "none" ? "hobbs_and_tach" : current;
}

/** Display text. Anything not listed falls back to the label with underscores removed. */
const LABELS: Record<string, string> = {
  airplane: "Airplane",
  rotorcraft: "Rotorcraft",
  glider: "Glider",
  lighter_than_air: "Lighter than air",
  powered_lift: "Powered lift",
  powered_parachute: "Powered parachute",
  weight_shift_control: "Weight-shift control",

  single_engine_land: "Single-engine land",
  multi_engine_land: "Multi-engine land",
  single_engine_sea: "Single-engine sea",
  multi_engine_sea: "Multi-engine sea",
  helicopter: "Helicopter",
  gyroplane: "Gyroplane",
  airship: "Airship",
  balloon: "Balloon",
  land: "Land",
  sea: "Sea",

  piston: "Piston",
  turboprop: "Turboprop",
  turbojet: "Turbojet",
  turbofan: "Turbofan",
  electric: "Electric",
  none: "None",

  avgas_100ll: "Avgas 100LL",
  mogas: "Mogas",
  jet_a: "Jet A",
  diesel: "Diesel",

  tricycle: "Tricycle",
  tailwheel: "Tailwheel",
  skids: "Skids",
  floats: "Floats",
  amphibious: "Amphibious",
  skis: "Skis",

  hobbs_and_tach: "Hobbs and tach",
  hobbs_only: "Hobbs only",
  tach_only: "Tach only",
};

export const label = (value: string): string =>
  LABELS[value] ?? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * The registry lookup answers with the legacy `categoryClass` string, so translate it
 * into the pair the form now holds. Returns null for anything else, which is the normal
 * case for a rotorcraft or a glider: the FAA import cannot classify those yet, and the
 * person picks.
 */
export function pairFromLegacy(
  value: string | null | undefined
): { category: AircraftCategory; aircraftClass: AircraftClass } | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "single-engine land":
      return { category: "airplane", aircraftClass: "single_engine_land" };
    case "multi-engine land":
      return { category: "airplane", aircraftClass: "multi_engine_land" };
    case "single-engine sea":
      return { category: "airplane", aircraftClass: "single_engine_sea" };
    case "multi-engine sea":
      return { category: "airplane", aircraftClass: "multi_engine_sea" };
    default:
      return null;
  }
}
