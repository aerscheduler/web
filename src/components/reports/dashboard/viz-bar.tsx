/**
 * A ranking: one metric, cut by a dimension, biggest first.
 *
 * Horizontal bars rather than vertical columns, because the categories are
 * names — tail numbers, instructors, lesson types — and a horizontal bar gives
 * the label a full line to sit on instead of turning it 45° under an axis.
 *
 * Ranking is a MAGNITUDE job, not an identity one, so this is a single hue
 * rather than a categorical palette: eight differently-coloured bars would imply
 * eight kinds of thing, when they are eight of the same thing at different
 * sizes. The value is direct-labelled at the end of each bar, so nothing has to
 * be read off an axis.
 */

import { formatReportValue } from "@/lib/report-format";
import type { ReportColumn } from "@/types/reports";
import { cn } from "@/lib/utils";

const MAX_BARS = 12;

export function VizBar({
  rows,
  columns,
  metric,
  dimension,
  onOpen,
}: {
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  metric: string;
  dimension: string;
  onOpen?: () => void;
}) {
  const metricColumn = columns.find((c) => c.key === metric);
  const type = metricColumn?.type ?? "number";

  const ranked = [...rows]
    .map((r) => ({
      label: r[dimension] == null ? "—" : String(r[dimension]),
      value: typeof r[metric] === "number" ? (r[metric] as number) : null,
    }))
    .filter((r) => r.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const shown = ranked.slice(0, MAX_BARS);
  const hidden = ranked.length - shown.length;
  // Scale to the largest bar rather than the axis maximum: a ranking is read by
  // comparing bars to each other, not to a round number.
  const max = Math.max(1, ...shown.map((r) => r.value ?? 0));

  if (shown.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Nothing in this window.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {shown.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={onOpen}
            className={cn(
              "group grid w-full grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left",
              onOpen && "hover:bg-muted/60"
            )}
          >
            <span className="truncate text-xs" title={row.label}>
              {row.label}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-[var(--chart-1)]"
                style={{ width: `${Math.max(((row.value ?? 0) / max) * 100, 2)}%` }}
              />
            </span>
            <span className="text-xs font-medium tabular-nums">
              {formatReportValue(row.value, type)}
            </span>
          </button>
        ))}
      </div>
      {/* Never silently truncate: say what was cut and where the rest lives. */}
      {hidden > 0 && (
        <p className="pt-1.5 text-xs text-muted-foreground">
          Top {MAX_BARS} of {ranked.length} — open the report for the rest
        </p>
      )}
    </div>
  );
}
