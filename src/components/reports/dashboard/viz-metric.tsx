/**
 * One number, its change, and the window it covers.
 *
 * The window label is not decoration. Once tiles can carry their own ranges, a
 * card reading "$12,480" with no period is actively misleading, the whole point
 * of the feature is having "this week" and "this month" side by side, and they
 * are indistinguishable without it.
 *
 * Delta rules are unchanged from the Overview: no percentage when the baseline
 * was zero or missing, and no colour on a measure that has no good direction.
 */

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPTY_CELL, formatReportValue } from "@/lib/report-format";
import type { ReportColumn, ReportColumnType } from "@/types/reports";

/** Metrics where "up" is bad. Everything else is neutral or good-when-higher. */
const LOWER_IS_BETTER = new Set([
  "outstanding",
  "cancellations",
  "late",
  "lateRate",
  "openSquawks",
  "daysToPay",
  "daysOpen",
  "notClosedOut",
  "nonRevenueHours",
]);

/** Money baselines get compact so they fit beside a three-digit delta. */
function compact(value: number | null, type: ReportColumnType): string {
  if (value == null) return EMPTY_CELL;
  if (type === "money" && Math.abs(value) >= 100_000) return `$${(value / 100_000).toFixed(1)}k`;
  return formatReportValue(value, type);
}

export function VizMetric({
  metric,
  columns,
  totals,
  previousTotals,
  onOpen,
}: {
  metric: string;
  columns: ReportColumn[];
  totals: Record<string, unknown>;
  previousTotals: Record<string, unknown> | null;
  onOpen?: () => void;
}) {
  const column = columns.find((c) => c.key === metric);
  const type = column?.type ?? "number";

  const raw = totals[metric];
  const value = typeof raw === "number" ? raw : null;
  const prevRaw = previousTotals?.[metric];
  const previous = typeof prevRaw === "number" ? prevRaw : null;

  // No baseline, or a zero one, means there is nothing to compute against.
  // "+∞%" and "+4000% from one flight" are both noise.
  const delta =
    value != null && previous != null && previous !== 0 ? (value - previous) / Math.abs(previous) : null;

  const rose = delta != null && delta > 0;
  const flat = delta != null && Math.abs(delta) < 0.005;
  const good = LOWER_IS_BETTER.has(metric) ? !rose : rose;
  const DeltaIcon = flat ? Minus : rose ? TrendingUp : TrendingDown;

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="text-[26px] font-semibold leading-none tracking-[-0.01em] tabular-nums">
        {formatReportValue(value, type)}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {delta == null ? (
          <span className="text-muted-foreground">
            {previousTotals ? "No comparison" : (column?.description ?? "")}
          </span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium tabular-nums",
                flat
                  ? "text-muted-foreground"
                  : good
                    ? "text-[var(--success)]"
                    : "text-destructive"
              )}
            >
              <DeltaIcon className="size-3.5" />
              {flat ? "no change" : `${Math.abs(delta * 100).toFixed(0)}%`}
            </span>
            <span className="truncate text-muted-foreground">from {compact(previous, type)}</span>
          </>
        )}
      </div>

      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-2 self-start text-xs text-primary opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover/viz:opacity-100"
        >
          Open report
        </button>
      )}
    </div>
  );
}
