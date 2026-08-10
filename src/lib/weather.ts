/**
 * Pre-flight weather, a TypeScript port of the Flutter app's WeatherService +
 * Weather model (app/lib/services/weather_service.dart, app/lib/models/weather_model.dart).
 *
 * Two free, key-less sources, exactly as the app uses them:
 *
 *  * METAR observations, https://aviationweather.gov/api/data/metar (NOAA/NWS
 *    Aviation Weather Center). `fltCat` is already "VFR" | ", MVFR" | ", IFR" | ", LIFR",
 *    so no METAR string is ever parsed here. Rate limited to ~100 req/min, which is
 *    why the query keys below round coordinates: every reservation at the same field
 *    shares one cache entry and one in-flight request.
 *
 *  * Sunrise/sunset/civil twilight, https://api.sunrise-sunset.org
 *    ATTRIBUTION: sun and civil-twilight times are provided by https://sunrise-sunset.org/,
 *    whose terms require the service to be credited. The credit is surfaced in the UI.
 *    see SUN_ATTRIBUTION, rendered in the weather badge's tooltip.
 *
 * A Location has no ICAO identifier, only a geocoded address, so the nearest reporting
 * station is found by querying a small bounding box around the location's coordinates and
 * picking the closest station by great-circle distance.
 *
 * Nothing in here ever throws or rejects. Weather is supplementary: every failure path
 * resolves to null and the UI renders nothing at all, no spinner, no error, no toast.
 *
 * Deltas from Flutter, deliberate:
 *  - No User-Agent header. `User-Agent` is a forbidden header name for fetch(), so the
 *    browser strips it; the browser sends its own instead. (Flutter's http client sets
 *    the descriptive UA aviationweather.gov asks for.)
 *  - No hand-rolled cache/in-flight maps. React Query is the cache, see
 *    useMetarObservation / useSunTimes in features/queries.ts, whose keys and staleTimes
 *    reproduce the Dart maps (5 min observations, per-date-immutable sun times, a short
 *    hold on failure so a dead network isn't re-requested on every badge that mounts).
 *  - Times can be rendered in the reservation's OWN timezone (`timeLabel`/`dateKey` take
 *    an IANA zone), matching how the detail sheet already prints start/end. Flutter only
 *    ever had the device's local zone.
 *
 * WHY THE METAR GOES THROUGH OUR SERVER: aviationweather.gov serves no
 * `Access-Control-Allow-Origin` header (verified 2026-07-26), so a direct browser request
 * to it is blocked by CORS and would always resolve null. `fetchNearestObservation` below
 * therefore calls `GET /weather/metar` on the AerScheduler API, which does the bbox query,
 * the nearest-station pick and a 5-minute cache server-side. api.sunrise-sunset.org DOES
 * send `Access-Control-Allow-Origin: *`, so sun times are still fetched client-side.
 * (The Flutter app has no CORS and still calls aviationweather.gov directly.)
 */
import { format } from "date-fns";

import { api } from "@/lib/api";

// ── sources ──────────────────────────────────────────────────────────────────

export const METAR_URL = "https://aviationweather.gov/api/data/metar";
export const SUN_URL = "https://api.sunrise-sunset.org/json";

/** Required by sunrise-sunset.org's terms of use. Render this somewhere visible. */
export const SUN_ATTRIBUTION = "Sun times courtesy of sunrise-sunset.org";

/** ~55 km each way, which always contains at least one reporting station. */
export const BBOX_PADDING_DEG = 0.5;

/**
 * How close a reservation has to be before a surface observation says anything useful
 * about it. A METAR describes the weather right now, and the web board shows a whole
 * month, so a fresh "VFR" against a flight three weeks out is worse than showing nothing.
 * Sun times are properties of the date and stay correct at any range.
 */
export const OBSERVATION_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Observations are hourly, but SPECIs can be issued at any time. */
export const METAR_STALE_MS = 5 * 60 * 1000;

/** Don't retry a dead network or a down API on every badge that mounts. */
export const FAILURE_STALE_MS = 2 * 60 * 1000;

/** Past this age the observation is worth flagging rather than trusting. */
const STALE_OBSERVATION_MIN = 90;

// ── types ────────────────────────────────────────────────────────────────────

export type Coordinates = { lat: number; lng: number };

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

const FLIGHT_CATEGORIES: FlightCategory[] = ["VFR", "MVFR", "IFR", "LIFR"];

/**
 * One surface observation from the station nearest a location.
 *
 * The aviationweather.gov payload is loosely typed and confirmed to send strings where
 * numbers are expected (`wdir` comes back as the string "VRB", `visib` as "10+") and
 * `fltCat` can be absent entirely. Everything below is therefore parsed defensively and
 * every field is nullable.
 */
export interface Observation {
  stationId: string | null;
  stationName: string | null;
  observedAt: Date | null;
  /** Null when the station reported no category. Never guessed. */
  flightCategory: FlightCategory | null;
  windDirectionDegrees: number | null;
  windIsVariable: boolean;
  windSpeedKnots: number | null;
  /** Kept as the reported string ("10+", "7", "1.5"): "10+" is meaningful to a pilot. */
  visibility: string | null;
  temperatureCelsius: number | null;
  dewPointCelsius: number | null;
  cloudCover: string | null;
  rawObservation: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Sunrise, sunset and civil twilight for one day at one point. */
export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  civilTwilightBegin: Date | null;
  civilTwilightEnd: Date | null;
}

// ── loose-payload parsers ────────────────────────────────────────────────────
// Nothing below is allowed to throw.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseWeatherString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const parsed = String(value).trim();
  return parsed === "" ? null : parsed;
}

function parseWeatherNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    // Strings like "10+" or "M1/4" show up in visibility; keep whatever number is in there.
    const digits = value.replace(/[^0-9.-]/g, "");
    if (digits === "") return null;
    const parsed = Number.parseFloat(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseWeatherInt(value: unknown): number | null {
  const parsed = parseWeatherNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

/** `wdir` is the string "VRB" when the wind direction is variable. */
function isVariableWindDirection(value: unknown): boolean {
  return typeof value === "string" && value.toUpperCase().includes("VRB");
}

function parseVisibility(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Whole numbers read better without a trailing decimal.
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return parseWeatherString(value);
}

/** `obsTime` is unix SECONDS. */
function parseObservationTime(value: unknown): Date | null {
  const seconds = parseWeatherInt(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseWeatherDate(value: unknown): Date | null {
  const parsed = parseWeatherString(value);
  if (parsed === null) return null;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFlightCategory(value: unknown): FlightCategory | null {
  const parsed = parseWeatherString(value)?.toUpperCase();
  if (!parsed) return null;
  return FLIGHT_CATEGORIES.find((c) => c === parsed) ?? null;
}

/** One station record from the METAR array. Returns null when it isn't an object. */
export function parseObservation(raw: unknown): Observation | null {
  const json = asRecord(raw);
  if (!json) return null;

  return {
    stationId: parseWeatherString(json.icaoId),
    stationName: parseWeatherString(json.name),
    observedAt: parseObservationTime(json.obsTime),
    flightCategory: parseFlightCategory(json.fltCat),
    windDirectionDegrees: parseWeatherInt(json.wdir),
    windIsVariable: isVariableWindDirection(json.wdir),
    windSpeedKnots: parseWeatherInt(json.wspd),
    visibility: parseVisibility(json.visib),
    temperatureCelsius: parseWeatherNumber(json.temp),
    dewPointCelsius: parseWeatherNumber(json.dewp),
    cloudCover: parseWeatherString(json.cover),
    rawObservation: parseWeatherString(json.rawOb),
    latitude: parseWeatherNumber(json.lat),
    longitude: parseWeatherNumber(json.lon),
  };
}

// ── locations ────────────────────────────────────────────────────────────────

/**
 * The geocoded coordinates of a Location, narrowed at runtime.
 *
 * Typed as `unknown` on purpose: the shared `Location` interface in types/api.ts doesn't
 * declare the address/coordinates the API actually returns on a reservation's resource,
 * and this feature isn't the place to widen a shared type. A location without coordinates
 * simply has no weather, that is not an error.
 */
export function coordinatesFromLocation(location: unknown): Coordinates | null {
  const record = asRecord(location);
  if (!record) return null;

  const address = asRecord(record.address);
  const coordinates = asRecord(address ? address.coordinates : null) ?? asRecord(record.coordinates);
  if (!coordinates) return null;

  const lat = parseWeatherNumber(coordinates.lat);
  const lng = parseWeatherNumber(coordinates.lng) ?? parseWeatherNumber(coordinates.lon);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/** Rounded so every location inside about a kilometre shares one cache entry. */
export function coordinateKey(coordinates: Coordinates): string {
  return `${coordinates.lat.toFixed(2)},${coordinates.lng.toFixed(2)}`;
}

/** `YYYY-MM-DD` for the sun API, in the flight's own timezone when one is known. */
export function dateKey(date: Date, timeZone?: string | null): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      const year = part("year");
      const month = part("month");
      const day = part("day");
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      // Bad zone, fall through to the viewer's own.
    }
  }
  return format(date, "yyyy-MM-dd");
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => degrees * (Math.PI / 180);

export function distanceInKilometers(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── fetches ──────────────────────────────────────────────────────────────────

/**
 * The nearest reporting station to `coordinates`, or null when the lookup fails, the
 * bounding box is empty, or the browser blocks the request (see the CORS note above).
 *
 * A station that reports a flight category beats a closer one that doesn't, an
 * observation with no `fltCat` can't answer the only question the badge exists to answer.
 */
export async function fetchNearestObservation(
  coordinates: Coordinates,
  signal?: AbortSignal
): Promise<Observation | null> {
  try {
    // Goes through OUR server, not aviationweather.gov directly. That host sends no
    // Access-Control-Allow-Origin header (verified 2026-07-26), so a browser request to
    // it is blocked by CORS and this would always resolve null. GET /weather/metar does
    // the bbox query, the nearest-station pick and the caching server-side and returns a
    // single observation (or null) in the usual { data } envelope.
    const raw = await api<unknown>(
      `/weather/metar?lat=${coordinates.lat}&lon=${coordinates.lng}`,
      { signal }
    );

    return parseObservation(raw);
  } catch {
    // Weather never surfaces an error to the user.
    return null;
  }
}

/**
 * Sun and civil-twilight times for one day at one point (`day` is `YYYY-MM-DD`).
 * Courtesy of https://sunrise-sunset.org/, see SUN_ATTRIBUTION.
 */
export async function fetchSunTimes(
  coordinates: Coordinates,
  day: string,
  signal?: AbortSignal
): Promise<SunTimes | null> {
  const query = new URLSearchParams({
    lat: String(coordinates.lat),
    lng: String(coordinates.lng),
    date: day,
    formatted: "0",
  });

  try {
    const res = await fetch(`${SUN_URL}?${query.toString()}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const body = asRecord(await res.json());
    if (!body || body.status !== "OK") return null;

    const results = asRecord(body.results);
    if (!results) return null;

    const sunTimes: SunTimes = {
      sunrise: parseWeatherDate(results.sunrise),
      sunset: parseWeatherDate(results.sunset),
      civilTwilightBegin: parseWeatherDate(results.civil_twilight_begin),
      civilTwilightEnd: parseWeatherDate(results.civil_twilight_end),
    };

    // An all-null payload (polar day/night, or a shape change) is worth nothing.
    return sunTimes.sunset || sunTimes.civilTwilightEnd ? sunTimes : null;
  } catch {
    return null;
  }
}

// ── gating ───────────────────────────────────────────────────────────────────

/** Weather at all: today or later, and only where the location has been geocoded. */
export function weatherApplies(start: Date, now: Date): boolean {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.getTime() >= startOfToday.getTime();
}

/** Whether a live observation says anything about a flight starting at `start`. */
export function shouldIncludeObservation(start: Date, now: Date): boolean {
  return start.getTime() < now.getTime() + OBSERVATION_WINDOW_MS;
}

// ── labels ───────────────────────────────────────────────────────────────────

/** A clock time, in the flight's own timezone when one is known. */
export function timeLabel(date: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return format(date, "h:mm a");
  }
}

export function windLabel(observation: Observation): string | null {
  const speed = observation.windSpeedKnots;
  if (speed === null) return null;
  if (speed === 0) return "Calm";

  // In a METAR a direction of 000 with a non-zero speed means the direction is variable.
  const direction = observation.windDirectionDegrees;
  if (observation.windIsVariable || direction === null || direction === 0) {
    return `VRB ${speed} kt`;
  }

  return `${String(direction).padStart(3, "0")}° ${speed} kt`;
}

export function visibilityLabel(observation: Observation): string | null {
  return observation.visibility ? `${observation.visibility} sm` : null;
}

/** Pilots will not trust a weather badge that doesn't say how old the observation is. */
export function observationAgeLabel(observation: Observation, now: Date): string | null {
  const observedAt = observation.observedAt;
  if (!observedAt) return null;

  const minutes = Math.floor((now.getTime() - observedAt.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  return `${Math.floor(hours / 24)} d ago`;
}

export function isStaleObservation(observation: Observation, now: Date): boolean {
  if (!observation.observedAt) return true;
  return now.getTime() - observation.observedAt.getTime() > STALE_OBSERVATION_MIN * 60_000;
}

/** "Byron Arpt, CA, US (KC83)". Always say which field the observation came from. */
export function stationLabel(observation: Observation): string | null {
  if (observation.stationName) {
    return observation.stationId
      ? `${observation.stationName} (${observation.stationId})`
      : observation.stationName;
  }
  return observation.stationId;
}

/** If there is nothing worth saying, say nothing at all. */
export function hasReportableConditions(
  observation: Observation | null,
  sunTimes: SunTimes | null
): boolean {
  if (sunTimes?.sunset || sunTimes?.civilTwilightEnd) return true;
  if (!observation) return false;
  return (
    observation.flightCategory !== null ||
    windLabel(observation) !== null ||
    visibilityLabel(observation) !== null
  );
}
