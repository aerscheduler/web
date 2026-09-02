import { useMemo } from "react";
import { cva } from "class-variance-authority";
import { CloudSun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMetarObservation, useSunTimes } from "@/features/queries";
import { cn, parseDate } from "@/lib/utils";
import {
  coordinatesFromLocation,
  dateKey,
  hasReportableConditions,
  isStaleObservation,
  observationAgeLabel,
  shouldIncludeObservation,
  stationLabel,
  SUN_ATTRIBUTION,
  timeLabel,
  visibilityLabel,
  weatherApplies,
  windLabel,
  type Observation,
  type SunTimes,
} from "@/lib/weather";

/** Standard aviation flight-category colours, mapped onto the app's theme tokens. */
const categoryChip = cva("", {
  variants: {
    category: {
      VFR: "border-transparent bg-[color-mix(in_oklch,var(--success)_16%,transparent)] text-[var(--success)]",
      MVFR:
        "border-transparent bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]",
      IFR: "border-transparent bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] text-[var(--destructive)]",
      // No magenta token in the palette; --res-guest is the theme-aware violet.
      LIFR: "border-transparent bg-[color-mix(in_oklch,var(--res-guest)_18%,transparent)] text-[var(--res-guest)]",
    },
  },
});

/**
 * Pre-flight weather for a reservation's location, the web port of the Flutter
 * WeatherBadge (app/lib/widgets/weather_badge.dart).
 *
 * Supplementary information, so it renders NOTHING at all while loading, when the
 * location has no geocoded coordinates, when the flight is in the past, or when either
 * lookup fails. A pilot never sees a spinner or an error here.
 *
 * A surface observation describes the weather right now, so the METAR half is only
 * requested for a flight inside the 12-hour window; sunset and civil twilight are
 * properties of the date and are shown however far out the reservation is (the web board
 * runs a month). The station the observation came from is ALWAYS shown, the nearest
 * reporting field can be miles away, and an unattributed "VFR" is not something a pilot
 * should have to trust.
 */
export function WeatherBadge({
  location,
  start,
  timeZone,
  variant = "inline",
  className,
}: {
  /**
   * The reservation's `resource.location`. Typed `unknown` on purpose: the shared
   * `Location` interface doesn't declare the geocoded address the API actually returns,
   * so the coordinates are narrowed at runtime (`coordinatesFromLocation`).
   */
  location: unknown;
  /** ISO start of the reservation. */
  start: string;
  /** The reservation's IANA zone, so sunset reads in the flight's own local time. */
  timeZone?: string | null;
  /** `inline` is the one-line version; `detail` is the labelled row in the slide-over. */
  variant?: "inline" | "detail";
  className?: string;
}) {
  const coordinates = useMemo(() => coordinatesFromLocation(location), [location]);
  const startDate = parseDate(start);
  const now = new Date();

  const applies = coordinates !== null && startDate !== null && weatherApplies(startDate, now);
  const withObservation = applies && startDate !== null && shouldIncludeObservation(startDate, now);
  const day = applies && startDate !== null ? dateKey(startDate, timeZone) : null;

  const metarQ = useMetarObservation(coordinates, { enabled: withObservation });
  const sunQ = useSunTimes(coordinates, day, { enabled: applies });

  // Outside the 12-hour window the observation is dropped even if a sibling badge already
  // put one in the cache under this station's key, a METAR issued minutes ago says
  // nothing about a flight three weeks out, and `enabled: false` still reads the cache.
  const observation = withObservation ? (metarQ.data ?? null) : null;
  const sunTimes = sunQ.data ?? null;

  // Loading and failure both render nothing. Weather is never worth an error state.
  if (!applies || !hasReportableConditions(observation, sunTimes)) return null;

  const content =
    variant === "detail" ? (
      <DetailBody observation={observation} sunTimes={sunTimes} timeZone={timeZone} now={now} />
    ) : (
      <InlineBody observation={observation} sunTimes={sunTimes} timeZone={timeZone} now={now} />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {variant === "detail" ? (
          // tabIndex so the provenance tooltip is reachable without a mouse.
          // Mirrors SheetDetailField's row, which it cannot use directly: the whole row
          // is the tooltip's trigger, and it has to be able to render nothing at all
          // rather than leave a labelled row with no weather in it.
          <div
            className={cn(
              "flex items-start gap-3 py-2.5 text-[13px] first:pt-0 last:pb-0",
              className
            )}
            tabIndex={0}
          >
            <div className="flex w-[100px] shrink-0 items-center gap-2 text-muted-foreground">
              <CloudSun className="size-3.5 shrink-0" />
              <span>Weather</span>
            </div>
            <div className="min-w-0 flex-1">{content}</div>
          </div>
        ) : (
          <span
            className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", className)}
            tabIndex={0}
          >
            <CloudSun className="size-3.5 shrink-0 text-muted-foreground" />
            {content}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">
        <WeatherTooltip
          observation={observation}
          sunTimes={sunTimes}
          timeZone={timeZone}
          now={now}
        />
      </TooltipContent>
    </Tooltip>
  );
}

type BodyProps = {
  observation: Observation | null;
  sunTimes: SunTimes | null;
  timeZone?: string | null;
  now: Date;
};

/** The one-liner used next to a reservation: category, station, conditions, sunset, age. */
function InlineBody({ observation, sunTimes, timeZone, now }: BodyProps) {
  const conditions = observation
    ? [windLabel(observation), visibilityLabel(observation)].filter(
        (c): c is string => c !== null
      )
    : [];
  const age = observation ? observationAgeLabel(observation, now) : null;

  return (
    <>
      {observation?.flightCategory && (
        <Badge className={categoryChip({ category: observation.flightCategory })}>
          {observation.flightCategory}
        </Badge>
      )}
      {observation?.stationId && <span className="font-medium">{observation.stationId}</span>}
      {conditions.length > 0 && (
        <span className="text-muted-foreground">{conditions.join(" · ")}</span>
      )}
      {sunTimes?.sunset && (
        <span className="text-muted-foreground">
          Sunset {timeLabel(sunTimes.sunset, timeZone)}
        </span>
      )}
      {age && (
        <span
          className={cn(
            "text-muted-foreground",
            observation && isStaleObservation(observation, now) && "text-[var(--warning)]"
          )}
        >
          {age}
        </span>
      )}
    </>
  );
}

/** The stacked version used inside the reservation slide-over. */
function DetailBody({ observation, sunTimes, timeZone, now }: BodyProps) {
  const wind = observation ? windLabel(observation) : null;
  const visibility = observation ? visibilityLabel(observation) : null;
  const station = observation ? stationLabel(observation) : null;
  const age = observation ? observationAgeLabel(observation, now) : null;

  return (
    <div className="space-y-0.5">
      {observation?.flightCategory && (
        <Badge className={categoryChip({ category: observation.flightCategory })}>
          {observation.flightCategory}
        </Badge>
      )}
      {station && <div className="truncate">{station}</div>}
      {wind && <div className="text-muted-foreground">Wind {wind}</div>}
      {visibility && <div className="text-muted-foreground">Visibility {visibility}</div>}
      {sunTimes?.sunset && (
        <div className="text-muted-foreground">Sunset {timeLabel(sunTimes.sunset, timeZone)}</div>
      )}
      {/* 14 CFR 1.1 night runs from the END of evening civil twilight, not from sunset, so
          this (not the sunset above) is the number that counts for night currency. */}
      {sunTimes?.civilTwilightEnd && (
        <div className="text-muted-foreground">
          Night begins {timeLabel(sunTimes.civilTwilightEnd, timeZone)}
        </div>
      )}
      {age && (
        <div
          className={cn(
            "text-xs text-muted-foreground",
            observation && isStaleObservation(observation, now) && "text-[var(--warning)]"
          )}
        >
          Observed {age}
        </div>
      )}
    </div>
  );
}

/** Provenance: which field, the raw METAR, how old it is, and the required sun credit. */
function WeatherTooltip({ observation, sunTimes, timeZone, now }: BodyProps) {
  const station = observation ? stationLabel(observation) : null;
  const age = observation ? observationAgeLabel(observation, now) : null;

  return (
    <div className="space-y-1 text-xs">
      {station && <div className="font-medium">{station}</div>}
      {observation?.rawObservation && (
        <div className="font-mono text-[11px] break-words opacity-90">
          {observation.rawObservation}
        </div>
      )}
      {age && <div className="opacity-80">Observed {age}</div>}
      {sunTimes?.civilTwilightEnd && (
        <div className="opacity-80">
          Night begins {timeLabel(sunTimes.civilTwilightEnd, timeZone)}
        </div>
      )}
      {/* Required by sunrise-sunset.org's terms of use. */}
      {(sunTimes?.sunset || sunTimes?.civilTwilightEnd) && (
        <div className="opacity-70">{SUN_ATTRIBUTION}</div>
      )}
      {observation && <div className="opacity-70">Observation from aviationweather.gov</div>}
    </div>
  );
}
