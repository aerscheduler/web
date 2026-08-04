import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { DailyCount } from "@/components/detail/metrics";
import { cn } from "@/lib/utils";

/**
 * Daily activity across the selected window, as bars.
 *
 * Deliberately small: this is a shape, not a chart to read values off. It
 * carries no y-axis and no gridlines, because at this size they'd be decoration
 * — the number itself is already on a tile above. What it does carry is the
 * first and last date, so "the last 90 days" is anchored to real dates rather
 * than being a floating rectangle.
 *
 * Follows the same rules as the report charts: `--chart-1` for the series, and a
 * day with nothing in it is drawn as an empty slot rather than being closed up,
 * so a two-week gap in someone's flying is visible as a gap.
 */
/**
 * Past this many points a daily bar is too thin to see.
 *
 * At a year's width each day gets about 2px, and `gap-px` eats a third of the
 * chart — so a school that flew on one day of the year got a 2px sliver in a
 * 1,100px field and read the chart as empty. Beyond this the bars are weekly
 * totals, which is both legible and the honest summary of a long window.
 */
const MAX_DAILY_POINTS = 120;

/** Whether a series of this length will be drawn as days or as weekly totals. */
export const activityGranularity = (pointCount: number): "day" | "week" =>
  pointCount > MAX_DAILY_POINTS ? "week" : "day";

export function ActivityBars({
  points,
  /** Formats the accessible value on each bar, e.g. deci-hours to "1.4 h". */
  formatValue,
  emptyLabel = "Nothing in this window",
  className,
}: {
  points: DailyCount[];
  formatValue: (count: number) => string;
  emptyLabel?: string;
  className?: string;
}) {
  const weekly = points.length > MAX_DAILY_POINTS;
  const shown = useMemo(
    () => (weekly ? bucketWeekly(points) : points),
    [points, weekly]
  );
  const max = useMemo(
    () => shown.reduce((m, p) => (p.count > m ? p.count : m), 0),
    [shown]
  );

  if (shown.length === 0 || max <= 0) {
    return <p className="py-1 text-[13px] text-muted-foreground">{emptyLabel}</p>;
  }

  const first = shown[0]!;
  const last = shown[shown.length - 1]!;

  return (
    <div className={cn("select-none", className)}>
      <div className="flex h-20 items-end gap-px" role="img" aria-label={ariaSummary(shown, formatValue, weekly)}>
        {shown.map((p) => {
          const pct = (p.count / max) * 100;
          return (
            <div
              key={p.date}
              className="group relative flex h-full flex-1 items-end"
              title={`${weekly ? `Week of ${safeDay(p.date)}` : safeDay(p.date)} · ${formatValue(p.count)}`}
            >
              <div
                className={cn(
                  "w-full rounded-[1px] transition-colors",
                  p.count > 0
                    ? "bg-[var(--chart-1)] group-hover:bg-[var(--chart-1)]/80"
                    : "bg-transparent"
                )}
                // A day with activity always gets at least a visible sliver, or a
                // light day next to a heavy one rounds down to nothing and reads
                // as "didn't fly".
                style={{ height: p.count > 0 ? `${Math.max(pct, 4)}%` : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{safeDay(first.date)}</span>
        {/* Says which unit a bar is, so a long window can't be misread as a
            sudden collapse in daily activity. */}
        {weekly && <span className="tracking-normal">weekly totals</span>}
        <span>{safeDay(last.date)}</span>
      </div>
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

/**
 * Sum a daily series into calendar weeks, keyed by the first day present in each.
 *
 * Buckets by 7-day blocks from the start of the window rather than by ISO week,
 * so the first and last labels stay the window's own edges — the chart is read
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
