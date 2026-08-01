/**
 * The table every report renders into.
 *
 * Nothing here knows what report it is showing — columns, types, alignment and
 * the totals row all come from the engine's response. A new report gets this for
 * free, which is the entire point of the registry.
 *
 * The share bar lives IN the row rather than in a separate chart above it: when
 * a report is grouped, the ranking IS the answer, and a second element to read
 * only slows that down.
 */

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPTY_CELL, formatReportValue, isNumericColumn, primaryMeasure } from "@/lib/report-format";
import type { ReportColumn, ReportRow } from "@/types/reports";

export function ReportTable({
  columns,
  rows,
  totals,
  grouped,
  sort,
  onSort,
  loading,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | undefined;
  grouped: boolean;
  sort: { key: string; dir: "asc" | "desc" };
  onSort: (key: string) => void;
  loading?: boolean;
}) {
  const measure = grouped ? primaryMeasure(columns) : null;
  const max = measure
    ? Math.max(
        1,
        ...rows.map((r) => (typeof r[measure.key] === "number" ? (r[measure.key] as number) : 0))
      )
    : 1;

  return (
    // The page's one scroll container: the card bounds this box, so the rows move
    // under a header and over a totals row that both stay put.
    <div className="relative min-h-0 min-w-0 flex-1 overflow-auto">
      {/* Keep the previous table readable while the next one loads rather than
          collapsing to a spinner — paging should not blink. */}
      <table
        className={cn("w-full text-sm transition-opacity", loading && "opacity-50")}
        aria-busy={loading}
      >
        <thead className="sticky top-0 z-10 border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((column) => {
              const numeric = isNumericColumn(column);
              const active = sort.key === column.key;
              const sortable = column.sortable !== false;
              return (
                <th
                  key={column.key}
                  className={cn("whitespace-nowrap px-3 py-2 font-medium", numeric && "text-right")}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      title={column.description}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        numeric && "flex-row-reverse",
                        active && "text-foreground"
                      )}
                    >
                      {column.label}
                      {active ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    <span title={column.description}>{column.label}</span>
                  )}
                </th>
              );
            })}
            {measure && <th className="w-32 px-3 py-2 font-medium">Share</th>}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
              {columns.map((column) => {
                const numeric = isNumericColumn(column);
                const value = formatReportValue(row[column.key], column.type);
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2",
                      numeric && "text-right tabular-nums",
                      value === EMPTY_CELL && "text-muted-foreground"
                    )}
                  >
                    <span className={cn("whitespace-nowrap", numeric && "font-medium")}>
                      {value}
                    </span>
                    {/* Grouped rows say how many records they stand for, so a
                        one-flight aircraft doesn't read like a fifty-flight one.
                        On its own line — inline it wraps mid-phrase and reads as
                        part of the label ("N152TS 2 records"). */}
                    {grouped && column.key === columns[0].key && row.__count != null && (
                      <span className="block text-xs text-muted-foreground">
                        {row.__count} {row.__count === 1 ? "record" : "records"}
                      </span>
                    )}
                  </td>
                );
              })}
              {measure && (
                <td className="px-3 py-2">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{
                        width: `${Math.max(
                          ((typeof row[measure.key] === "number" ? (row[measure.key] as number) : 0) / max) * 100,
                          2
                        )}%`,
                      }}
                    />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>

        {totals && rows.length > 0 && (
          <tfoot className="sticky bottom-0 border-t border-border bg-background">
            <tr>
              {columns.map((column, i) => {
                const numeric = isNumericColumn(column);
                const value = totals[column.key];
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2 font-semibold",
                      numeric && "text-right tabular-nums"
                    )}
                  >
                    {/* A column with no aggregate is blank in the totals row on
                        purpose — there is no honest way to add up a tail number. */}
                    {i === 0 && value == null
                      ? "Total"
                      : value == null
                        ? ""
                        : formatReportValue(value, column.type)}
                  </td>
                );
              })}
              {measure && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
