import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { DailyCount } from "@/components/detail/metrics";
import { cn } from "@/lib/utils";

/**
 * Daily activity across the selected window, as bars.
 *
 * Small, but a chart rather than a decoration: it follows the same rules as the
 * report charts so the two don't read as two different products. Rounded
 * gridlines with a labelled y-axis, a baseline, dated x-ticks, `--chart-1` for
 * the series, and a hover readout that names the day and its value. A day with
 * nothing in it is drawn as an empty slot rather than being closed up, so a
 * two-week gap in someone's flying is visible as a gap.
 */
/**
 * Past this many points a daily bar is too thin to see.
 *
 * At a year's width each day gets about 2px, and `gap-px` eats a third of the
 * chart, so a school that flew on one day of the year got a 2px sliver in a
 * 1,100px field and read the chart as empty. Beyond this the bars are weekly
 * totals, which is both legible and the honest summary of a long window.
 */
const MAX_DAILY_POINTS = 120;

/** Whether a series of this length will be drawn as days or as weekly totals. */
export const activityGranularity = (pointCount: number): "day" | "week" =>
  pointCount > MAX_DAILY_POINTS ? "week" : "day";

/**
 * Deci-hours ⇒ an axis tick, carrying only the precision the step needs.
 *
 * A light tail peaks around 1.5 h a day, which lands on a half-hour step, and
 * at zero decimals that axis reads "1 h, 1 h, 2 h".
 */
export const hoursAxisLabel = (deciHours: number, step: number): string =>
  `${(deciHours / 10).toFixed(step < 10 ? 1 : 0)} h`;

/** ~3 rounded gridlines. A tick at 1.37 h helps nobody. */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

export function ActivityBars({
  points,
  /** Formats the hovered value and the accessible summary, e.g. "1.4 h". */
  formatValue,
  /**
   * Formats an axis tick, coarser than `formatValue`. Gets the gridline `step`
   * alongside the value, because how much precision a tick needs is a property
   * of the step, a half-hour step rounded to whole hours prints "1 h" twice
   * and reads as a broken axis. See `hoursAxisLabel`.
   */
  formatAxis,
  emptyLabel = "Nothing in this window",
  className,
}: {
  points: DailyCount[];
  formatValue: (count: number) => string;
  formatAxis?: (count: number, step: number) => string;
  emptyLabel?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const weekly = points.length > MAX_DAILY_POINTS;
  const shown = useMemo(
    () => (weekly ? bucketWeekly(points) : points),
    [points, weekly]
  );
  const peak = useMemo(
    () => shown.reduce((m, p) => (p.count > m ? p.count : m), 0),
    [shown]
  );

  const ticks = useMemo(() => niceTicks(peak), [peak]);
  // Scale to the top gridline, not the peak, so a bar's height can actually be
  // read against the axis printed beside it.
  const top = ticks[ticks.length - 1] || 1;

  if (shown.length === 0 || peak <= 0) {
    return <p className="py-1 text-[13px] text-muted-foreground">{emptyLabel}</p>;
  }

  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : top;
  const axis = (t: number) => (formatAxis ? formatAxis(t, step) : formatValue(t));
  const first = shown[0]!;
  const last = shown[shown.length - 1]!;
  const active = hover != null ? shown[hover] : null;

  return (
    <div className={cn("relative select-none", className)}>
      {/* Reserve the gutter the y-labels sit in, so the plot starts where the
          axis ends rather than underneath it. */}
      <div className="flex gap-2">
        <div className="relative h-20 w-9 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: `${100 - (t / top) * 100}%` }}
            >
              {axis(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines sit behind the bars; the zero line is the baseline the
              bars stand on, so it reads solid rather than as another rule. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute inset-x-0 border-t"
                style={{
                  top: `${100 - (t / top) * 100}%`,
                  borderColor: "var(--chart-grid)",
                }}
              />
            ))}
          </div>

          <div
            className="relative flex h-20 items-end gap-px"
            role="img"
            aria-label={ariaSummary(shown, formatValue, weekly)}
            onMouseLeave={() => setHover(null)}
          >
            {shown.map((p, i) => (
              <div
                key={p.date}
                className="group relative flex h-full flex-1 items-end"
                onMouseEnter={() => setHover(i)}
              >
                {/* Full-height hover target: a 2px bar is not something you can
                    reliably point at, and an empty day still has a value worth
                    saying ("didn't fly"). */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0",
                    hover === i && "bg-muted-foreground/10"
                  )}
                />
                <div
                  className={cn(
                    "relative w-full rounded-[1px] transition-colors",
                    p.count > 0
                      ? "bg-[var(--chart-1)] group-hover:bg-[var(--chart-1)]/80"
                      : "bg-transparent"
                  )}
                  // A day with activity always gets at least a visible sliver, or
                  // a light day next to a heavy one rounds down to nothing and
                  // reads as "didn't fly".
                  style={{
                    height: p.count > 0 ? `${Math.max((p.count / top) * 100, 4)}%` : 0,
                  }}
                />
              </div>
            ))}
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>{safeDay(first.date)}</span>
            {/* Says which unit a bar is, so a long window can't be misread as a
                sudden collapse in daily activity. */}
            {weekly && <span className="tracking-normal">weekly totals</span>}
            <span>{safeDay(last.date)}</span>
          </div>
        </div>
      </div>

      {active && (
        <div
          className={cn(
            "pointer-events-none absolute top-0 z-20 rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-md",
            hover! > shown.length / 2 ? "left-9" : "right-0"
          )}
        >
          <span className="font-medium">
            {weekly ? `Week of ${safeDay(active.date)}` : safeFullDay(active.date)}
          </span>
          <span className="ml-2 tabular-nums">
            {active.count > 0 ? formatValue(active.count) : "–"}
          </span>
        </div>
      )}
    </div>
  );
}

function safeDay(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

function safeFullDay(iso: string): string {
  try {
    return format(parseISO(iso), "EEE, MMM d");
  } catch {
    return iso;
  }
}

/**
 * Sum a daily series into calendar weeks, keyed by the first day present in each.
 *
 * Buckets by 7-day blocks from the start of the window rather than by ISO week,
 * so the first and last labels stay the window's own edges, the chart is read
 * against the range you picked, not against a calendar.
 */
function bucketWeekly(points: DailyCount[]): DailyCount[] {
  const out: DailyCount[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const week = points.slice(i, i + 7);
    out.push({
      date: week[0]!.date,
      count: week.reduce((sum, p) => sum + p.count, 0),
    });
  }
  return out;
}

/** One sentence for a screen reader, since the bars themselves say nothing. */
function ariaSummary(
  points: DailyCount[],
  formatValue: (n: number) => string,
  weekly: boolean
): string {
  const active = points.filter((p) => p.count > 0);
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const unit = weekly ? "weeks" : "days";
  return `${weekly ? "Weekly" : "Daily"} activity: ${formatValue(total)} across ${active.length} of ${points.length} ${unit}.`;
}
