/**
 * The one hook every component asks "what zone am I rendering in?".
 *
 * Deliberately a single entry point. If components start resolving zones themselves — reading
 * `location.timeZone` here, `DEVICE_TIME_ZONE` there — the fallback chain stops being one fact
 * and the board drifts back out of agreement with itself within a month.
 *
 * Returns everything a caller needs to render correctly *and* to decide whether to say
 * anything about it at all:
 *
 * - `zone`      the zone to format and position in
 * - `viewerZone` where the person actually is
 * - `differs(instant)` whether those two disagree at that moment — the test for showing a label
 * - `label(instant)` "MDT", for when they do
 *
 * `differs` takes an instant rather than being a boolean because zones drift in and out of
 * agreement: America/Phoenix and America/Denver are identical for half the year. Comparing
 * names would label every time on the page for a Phoenix viewer in January, which is clutter
 * carrying no information — and keeping the feature invisible for the ~99% of people sitting
 * at their own airport is the entire design goal.
 */

import * as React from "react";
import { useAuth } from "@/lib/auth";
import { useTimeZonePreferences } from "@/features/queries";
import {
  DEVICE_TIME_ZONE,
  resolveDisplayZone,
  resolveViewerZone,
  zoneAbbreviation,
  zonesAgreeAt,
  formatTimeInZone,
  formatTimeRangeInZone,
  formatDateInZone,
  spansDaysInZone,
} from "@/lib/timezone";
import type { Location } from "@/types/api";

export interface TimeZoneContext {
  /** The zone to render in — airport time unless the member asked for their own. */
  zone: string;
  /** Where the viewer actually is. */
  viewerZone: string;
  /** The org's primary zone, or null if never configured. */
  orgZone: string | null;
  /** True when the org has no zone set at all, so we are still falling back to the device. */
  unset: boolean;
  /** Do the render zone and the viewer's zone disagree at this instant? */
  differs: (instant: Date | string) => boolean;
  /** "MDT" — only worth showing when `differs` is true. */
  label: (instant: Date | string) => string;
  /** `9:00 AM`, in the render zone. */
  time: (instant: Date | string) => string;
  /** `9:00 AM – 11:00 AM`, with a zone label appended only when it would mean something. */
  range: (start: Date | string, end: Date | string) => string;
  /** `Tue, Jul 28` / `Tuesday, July 28, 2026`, in the render zone. */
  date: (instant: Date | string, style?: "short" | "long") => string;
  /** Does this booking end on a later day than it starts, in the render zone? */
  spansDays: (start: Date | string, end: Date | string) => boolean;
}

/**
 * Resolve the zone for a given location, or for the org as a whole when none is passed.
 *
 * Most callers pass nothing: both live orgs have exactly one field, so the org zone is the
 * answer. The per-location argument exists so a school with two airports in different zones
 * gets the right one per block without a second migration later.
 */
export function useTimeZone(location?: Location | null): TimeZoneContext {
  const { organization } = useAuth();
  const prefs = useTimeZonePreferences();

  const orgZone = organization?.timeZone ?? null;
  const locationZone = location?.timeZone ?? null;

  const viewerZone = React.useMemo(
    () => resolveViewerZone(prefs.data ?? undefined),
    [prefs.data]
  );

  const airportZone = React.useMemo(
    () => resolveDisplayZone({ locationZone, orgZone, viewerZone }),
    [locationZone, orgZone, viewerZone]
  );

  //"Show schedule in my zone" is an explicit opt-out of airport time. It stays labelled
  //whenever the two differ, so choosing it can't quietly reintroduce the ambiguity.
  const zone = prefs.data?.scheduleTimeZoneMode === "user" ? viewerZone : airportZone;

  return React.useMemo<TimeZoneContext>(
    () => ({
      zone,
      viewerZone,
      orgZone,
      unset: !locationZone && !orgZone,
      differs: (instant) => !zonesAgreeAt(instant, zone, viewerZone),
      label: (instant) => zoneAbbreviation(instant, zone),
      time: (instant) => formatTimeInZone(instant, zone),
      range: (start, end) => formatTimeRangeInZone(start, end, zone, viewerZone),
      date: (instant, style) => formatDateInZone(instant, zone, style),
      spansDays: (start, end) => spansDaysInZone(start, end, zone),
    }),
    [zone, viewerZone, orgZone, locationZone]
  );
}

/** The device zone, re-exported so callers don't reach past this module for it. */
export { DEVICE_TIME_ZONE };
