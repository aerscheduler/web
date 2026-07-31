/**
 * The rows themselves, on the dashboard.
 *
 * Deliberately spare: no sorting, no paging, no column picker. Those belong to
 * the report, and this is a window onto it — the header links there. A table
 * tile that grew its own controls would be a second, worse copy of the report
 * shell, kept in sync by hand.
 *
 * The dimension column (when there is one) leads and stays left-aligned; metrics
 * are right-aligned and tabular so a column of figures lines up.
 */

import { formatReportValue, isNumericColumn } from "@/lib/report-format";
import type { ReportColumn } from "@/types/reports";
import { cn } from "@/lib/utils";

const MAX_ROWS = 50;

export function VizTable({
  rows,
  columns,
  metrics,
  dimension,
  onOpen,
}: {
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  metrics: string[];
  dimension?: string;
  onOpen?: () => void;
}) {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const shown = [...(dimension ? [dimension] : []), ...metrics]
    .map((key) => byKey.get(key))
    .filter((c): c is ReportColumn => !!c);

  const visible = rows.slice(0, MAX_ROWS);

  if (visible.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Nothing in this window.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-left uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              {shown.map((c) => (
                <th
                  key={c.key}
                  className={cn("px-2 py-1.5 font-medium", isNumericColumn(c) && "text-right")}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                {shown.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-2 py-1.5",
                      isNumericColumn(c) && "text-right tabular-nums"
                    )}
                  >
                    {formatReportValue(row[c.key], c.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS && (
        <button
          type="button"
          onClick={onOpen}
          className="pt-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          First {MAX_ROWS} of {rows.length} — open the report for the rest
        </button>
      )}
    </div>
  );
}
