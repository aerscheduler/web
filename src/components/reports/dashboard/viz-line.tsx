/**
 * A metric over a dimension, as lines.
 *
 * Generalised from the Overview's trend chart, which only ever drew time. The
 * decisions carried over from the visualization method still hold and are worth
 * restating, because they are the ones that get "simplified" away:
 *
 *  • Series colours are `--chart-1..3`, assigned by SLOT and never cycled. They
 *    are not the UI accent colours, a chart needs hues that stay apart for a
 *    colour-blind reader, and they were validated as a set against both card
 *    surfaces.
 *  • Legend AND direct end-labels, always. `--chart-3` sits below 3:1 on the
 *    light surface, which obliges visible labels rather than relying on the hue
 *    being seen at all. End labels are laid out together and nudged apart, or two
 *    series finishing at similar values print on top of each other.
 *  • Lines BREAK at missing values. A straight segment across a gap asserts data
 *    that was never recorded.
 *  • One y-axis. Two metrics of different scale belong on two charts.
 *
 * When the dimension is a date the x-axis is real time, so a fortnight with no
 * flying reads as a gap rather than closing up. For any other dimension the
 * points are evenly spaced, because "aircraft" has no distance between values.
 *
 * THE COMPARISON PERIOD is drawn behind the current one as a dashed line per
 * series, on two conditions, and both are load-bearing:
 *
 *  • Only over TIME. The overlay lays the previous window over the current one
 *    at the same offset from the start, which is a sentence that only means
 *    something on a time axis. Pairing the third-busiest aircraft this month
 *    with the third-busiest last month draws a line between two different
 *    aeroplanes, so the server does not even fetch the rows (see
 *    `comparisonNeedsRows`).
 *  • Only up to TWO series. Three metrics plus their comparisons is six lines
 *    on one axis, which is not a chart anybody can read. A third metric turns
 *    the comparison off rather than shrinking it, and the default board is
 *    built two-at-a-time so it keeps the comparison.
 *
 * Alignment is by CALENDAR-DAY OFFSET from each window's own start, not by
 * index into the rows. Index alignment looks identical until the previous
 * period has a day with no flying: that day produces no row, everything after
 * it shifts up one, and the chart then compares Tuesday against Wednesday for
 * the rest of the period while looking perfectly plausible.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { formatReportValue, formatWindow } from "@/lib/report-format";
import { wallClockInZone } from "@/lib/timezone";
import type { ReportColumn } from "@/types/reports";
import { cn } from "@/lib/utils";

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const PAD = { top: 10, right: 60, bottom: 24, left: 50 };

/** Above this many series the comparison is dropped rather than drawn. */
const MAX_SERIES_WITH_COMPARISON = 2;

type Window = { startDate: string; endDate: string };

/**
 * A window's first calendar day, as a local midnight Date.
 *
 * Read in the zone the window was MEASURED in, the school's, for the same
 * reason `formatWindow` is: these instants are the school's midnights, and
 * reading them on the browser's clock moves them a day for anyone east or west
 * of the school. Returned as a local Date purely so it can be differenced
 * against the row labels, which `parseISO` also produces as local dates.
 */
function windowStartDay(window: Window, timeZone: string): Date | null {
  try {
    const { year, month, day } = wallClockInZone(window.startDate, timeZone);
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** ~4 rounded gridlines. A tick at 1.37 h helps nobody. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

/** Axis ticks are rounded, so they never need cents. */
function axisLabel(value: number, type: ReportColumn["type"]): string {
  if (type === "money") {
    return (value / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }
  if (type === "hours") return `${(value / 10).toFixed(0)} h`;
  return formatReportValue(value, type);
}

export function VizLine({
  rows,
  columns,
  metrics,
  dimension,
  previousRows,
  // Aliased on the way in: an unqualified `window` inside a browser component
  // shadows the global one, and the next person to reach for it here gets a
  // report window instead of the DOM.
  window: currentWindow,
  comparison,
  timeZone,
}: {
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  metrics: string[];
  dimension: string;
  /** The comparison window's rows. Only ever sent for a time chart. */
  previousRows?: Record<string, unknown>[] | null;
  window?: Window;
  comparison?: Window | null;
  /** The school's zone, the one both windows were measured on. */
  timeZone?: string;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const byKey = new Map(columns.map((c) => [c.key, c]));
  const series = metrics
    .map((k) => byKey.get(k))
    .filter((c): c is ReportColumn => !!c)
    .slice(0, 3);
  const type = series[0]?.type ?? "number";
  const isTime = dimension === "date";

  const showCompare =
    isTime &&
    series.length <= MAX_SERIES_WITH_COMPARISON &&
    !!previousRows?.length &&
    !!currentWindow &&
    !!comparison &&
    !!timeZone;

  /**
   * Previous values keyed by how many days into its window each row sat, which
   * is the offset the current period is then read at. Empty whenever the
   * comparison is not being drawn, so nothing downstream has to re-check.
   */
  const previousByOffset = useMemo(() => {
    const out = new Map<number, Record<string, number | null>>();
    if (!showCompare) return out;

    const base = windowStartDay(comparison!, timeZone!);
    if (!base) return out;

    for (const row of previousRows!) {
      const raw = row[dimension];
      if (raw == null) continue;
      const when = parseISO(String(raw));
      if (!Number.isFinite(when.getTime())) continue;

      const values: Record<string, number | null> = {};
      for (const s of series) {
        const v = row[s.key];
        values[s.key] = typeof v === "number" ? v : null;
      }
      out.set(differenceInCalendarDays(when, base), values);
    }
    return out;
  }, [showCompare, previousRows, comparison, timeZone, dimension, series]);

  const points = useMemo(() => {
    const base = showCompare ? windowStartDay(currentWindow!, timeZone!) : null;

    const mapped = rows
      .map((row) => {
        const raw = row[dimension];
        const label = raw == null ? "" : String(raw);
        const values: Record<string, number | null> = {};
        for (const s of series) {
          const v = row[s.key];
          values[s.key] = typeof v === "number" ? v : null;
        }
        const when = isTime ? parseISO(label) : null;
        // The same day-offset the previous rows were keyed by, so the two
        // periods line up by position in their window rather than by date.
        const previous =
          base && when && Number.isFinite(when.getTime())
            ? previousByOffset.get(differenceInCalendarDays(when, base)) ?? null
            : null;
        return { label, t: when ? when.getTime() : 0, values, previous };
      })
      .filter((p) => p.label !== "" && (!isTime || Number.isFinite(p.t)));

    return isTime
      ? mapped.sort((a, b) => a.t - b.t)
      : // A categorical axis has no natural order, so rank it by the first
        // metric, otherwise the line zig-zags for no reason.
        mapped.sort((a, b) => (b.values[series[0]?.key ?? ""] ?? 0) - (a.values[series[0]?.key ?? ""] ?? 0));
  }, [rows, dimension, series, isTime, showCompare, currentWindow, timeZone, previousByOffset]);

  const height = Math.max(120, size.h);
  const { xOf, yOf, ticks } = useMemo(() => {
    const plotW = Math.max(1, size.w - PAD.left - PAD.right);
    const plotH = Math.max(1, height - PAD.top - PAD.bottom);

    const times = points.map((p) => p.t);
    const minT = Math.min(...times);
    const span = (Math.max(...times) - minT) || 1;

    // The comparison is scaled by the same axis it is drawn against, so a
    // busier previous period has to raise the ceiling. Leaving it out clipped
    // the dashed line flat along the top, which reads as a plateau rather than
    // as an axis that stops too low.
    let peak = 0;
    for (const p of points) for (const s of series) {
      const v = p.values[s.key];
      if (v != null && v > peak) peak = v;
      const prev = p.previous?.[s.key];
      if (prev != null && prev > peak) peak = prev;
    }
    const t = niceTicks(peak);
    const top = t[t.length - 1] || 1;

    return {
      ticks: t,
      xOf: (i: number) => {
        if (points.length <= 1) return PAD.left + plotW / 2;
        const frac = isTime ? (points[i].t - minT) / span : i / (points.length - 1);
        return PAD.left + frac * plotW;
      },
      yOf: (v: number) => PAD.top + plotH - (v / top) * plotH,
    };
  }, [points, series, size.w, height, isTime]);

  /** End labels, laid out together and pushed apart so they stay readable. */
  const endLabels = useMemo(() => {
    const MIN_GAP = 11;
    const out = series
      .map((s, i) => {
        let last = -1;
        for (let j = 0; j < points.length; j++) if (points[j].values[s.key] != null) last = j;
        return last < 0
          ? null
          : { key: s.key, label: s.label, x: xOf(last) + 6, y: yOf(points[last].values[s.key]!) + 3, i };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
      .sort((a, b) => a.y - b.y);

    for (let i = 1; i < out.length; i++) {
      if (out[i].y - out[i - 1].y < MIN_GAP) out[i].y = out[i - 1].y + MIN_GAP;
    }
    const overflow = out.length ? out[out.length - 1].y - (height - PAD.bottom) : 0;
    if (overflow > 0) for (const l of out) l.y -= overflow;
    return out;
  }, [series, points, xOf, yOf, height]);

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!points.length) return;
      const box = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - box.left;
      let best = 0;
      let dist = Infinity;
      points.forEach((_, i) => {
        const d = Math.abs(xOf(i) - x);
        if (d < dist) { dist = d; best = i; }
      });
      setHover(best);
    },
    [points, xOf]
  );

  const active = hover != null ? points[hover] : null;

  /**
   * `showCompare` says we were ASKED for a comparison; this says one actually
   * landed on the axis. They come apart when the previous window's rows do not
   * align onto any current point, and drawing a legend entry for a line that
   * isn't there is worse than drawing neither.
   */
  const drawsCompare = showCompare && points.some((p) => p.previous);
  const comparisonLabel =
    drawsCompare && comparison && timeZone ? formatWindow(comparison, timeZone) : "";

  if (points.length === 0 || series.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Nothing in this window.
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Legend is always present at two or more series, identity must never
          rest on colour alone. In flow rather than overlaid, or it prints on
          top of the plot it is meant to explain. */}
      {(series.length > 1 || drawsCompare) && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 pb-1">
          {series.length > 1 &&
            series.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                {s.label}
              </span>
            ))}
          {/* One entry for the whole comparison rather than one per series: the
              dashes carry "previous", the colour still carries "which metric",
              and a second swatch per series would double a legend that already
              has to fit on a tile. It names the actual dates for the same reason
              the tile header does, a comparison to an unstated period is not a
              comparison to anything. */}
          {drawsCompare && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                aria-hidden
                className="h-0 w-3 border-t border-dashed border-current opacity-70"
              />
              vs {comparisonLabel}
            </span>
          )}
        </div>
      )}

      <div ref={ref} className="min-h-0 flex-1">
      <svg
        width={size.w || undefined}
        height={height}
        role="img"
        aria-label={`${series.map((s) => s.label).join(", ")} by ${dimension}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={Math.max(PAD.left, size.w - PAD.right)}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={yOf(t) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">
              {axisLabel(t, type)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={height - 6} className="fill-muted-foreground text-[9px]">
          {isTime ? format(points[0].t, "MMM d") : points[0].label}
        </text>
        {points.length > 1 && (
          <text x={Math.max(PAD.left, size.w - PAD.right)} y={height - 6} textAnchor="end" className="fill-muted-foreground text-[9px]">
            {isTime ? format(points[points.length - 1].t, "MMM d") : points[points.length - 1].label}
          </text>
        )}

        {/* The comparison first, so the current period draws over it rather
            than under it. Same hue as its series (the colour says WHICH metric),
            dashed and faded (the texture says WHEN), and no end label: those are
            laid out for the current lines and a second set would collide with
            them. */}
        {drawsCompare &&
          series.map((s, i) => {
            const segments: { i: number; v: number }[][] = [];
            let run: { i: number; v: number }[] = [];
            points.forEach((p, idx) => {
              const v = p.previous?.[s.key];
              if (v != null) run.push({ i: idx, v });
              else if (run.length) { segments.push(run); run = []; }
            });
            if (run.length) segments.push(run);

            return (
              <g key={`prev-${s.key}`} opacity={0.45}>
                {segments.map((seg, j) => (
                  <path
                    key={j}
                    d={seg.map((p, k) => `${k === 0 ? "M" : "L"}${xOf(p.i)},${yOf(p.v)}`).join(" ")}
                    fill="none"
                    stroke={SERIES_COLORS[i]}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </g>
            );
          })}

        {series.map((s, i) => {
          // Break the line at gaps rather than drawing through them.
          const segments: { i: number; v: number }[][] = [];
          let run: { i: number; v: number }[] = [];
          points.forEach((p, idx) => {
            const v = p.values[s.key];
            if (v != null) run.push({ i: idx, v });
            else if (run.length) { segments.push(run); run = []; }
          });
          if (run.length) segments.push(run);

          return (
            <g key={s.key}>
              {segments.map((seg, j) => (
                <path
                  key={j}
                  d={seg.map((p, k) => `${k === 0 ? "M" : "L"}${xOf(p.i)},${yOf(p.v)}`).join(" ")}
                  fill="none"
                  stroke={SERIES_COLORS[i]}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {segments.map((seg, j) =>
                seg.length === 1 ? (
                  <circle key={`d${j}`} cx={xOf(seg[0].i)} cy={yOf(seg[0].v)} r={3.5} fill={SERIES_COLORS[i]} />
                ) : null
              )}
            </g>
          );
        })}

        {size.w > 240 &&
          endLabels.map((l) => (
            <text key={l.key} x={l.x} y={l.y} className="fill-muted-foreground text-[9px] font-medium">
              {l.label}
            </text>
          ))}

        {active && hover != null && (
          <g pointerEvents="none">
            <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--chart-grid)" />
            {series.map((s, i) => {
              const v = active.values[s.key];
              return v == null ? null : (
                <circle key={s.key} cx={xOf(hover)} cy={yOf(v)} r={3.5} fill={SERIES_COLORS[i]} stroke="var(--card)" strokeWidth={2} />
              );
            })}
          </g>
        )}
      </svg>
      </div>

      {active && hover != null && (
        <div
          className={cn(
            "pointer-events-none absolute top-1 z-20 rounded-md border border-border bg-popover px-2 py-1.5 text-[11px] shadow-md",
            xOf(hover) > size.w / 2 ? "left-1" : "right-1"
          )}
        >
          <div className="font-medium">{isTime ? format(active.t, "EEE, MMM d") : active.label}</div>
          {series.map((s, i) => (
            <div key={s.key} className="mt-0.5">
              <div className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {formatReportValue(active.values[s.key], s.type)}
                </span>
              </div>
              {/* The same day of the previous period, indented under its own
                  series. Only when there IS one: printing a dash for it would
                  claim the previous period recorded a zero that day, when what
                  actually happened is that the window does not reach that far. */}
              {drawsCompare && active.previous?.[s.key] != null && (
                <div className="flex items-center gap-1.5 pl-3 text-muted-foreground">
                  <span
                    aria-hidden
                    className="h-0 w-1.5 border-t border-dashed"
                    style={{ borderColor: SERIES_COLORS[i] }}
                  />
                  <span>previous</span>
                  <span className="ml-auto tabular-nums">
                    {formatReportValue(active.previous[s.key], s.type)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
