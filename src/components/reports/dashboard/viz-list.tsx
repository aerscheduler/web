/**
 * A breakdown: one metric split into rows, each with its figure and its share.
 *
 * The shape Stripe's "Payments" card uses, and the one a bar chart cannot give
 * you. A bar chart is a RANKING, read off an axis: it answers "which aircraft
 * flew most" well and "how much did N8698V bill" not at all, because reading a
 * value off a bar is estimation. This carries the number itself on every row,
 * and uses length only for the share, which is the thing a number is genuinely
 * bad at and a bar is genuinely good at.
 *
 * Three decisions worth keeping:
 *
 *  • ONE stacked proportion bar across the top, not a bar per row. The question
 *    a breakdown answers is how the whole divides, and a bar per row re-answers
 *    "which is biggest", which the sort order already says.
 *  • Rows are capped and the remainder is KEPT, as "Other", rather than
 *    dropped. A list of the top five whose figures do not add up to the total
 *    printed above it is a card that quietly lies about the total.
 *  • Negative and zero values take no width but keep their row. A credit note
 *    is a real thing a revenue breakdown contains, and silently omitting the
 *    rows that cannot be drawn is how a total stops reconciling.
 */

import { useMemo } from "react";
import { EMPTY_CELL, formatReportValue } from "@/lib/report-format";
import type { ReportColumn } from "@/types/reports";
import { cn } from "@/lib/utils";

/**
 * Rows before the tail is folded into "Other".
 *
 * Five is what fits the default 4x3 tile without scrolling, and is about as
 * many as anyone reads off a breakdown before it stops being a summary.
 */
const MAX_ROWS = 5;

/** The share swatches, in the order rows are drawn. See the chart palette. */
const SHARE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4, var(--chart-1))",
  "var(--chart-5, var(--chart-2))",
  "var(--muted-foreground)",
];

interface Row {
  label: string;
  value: number;
  /** 0..1 of the positive total, or 0 when there is nothing to take a share of. */
  share: number;
  color: string;
}

export function VizList({
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
  const column = columns.find((c) => c.key === metric);
  const type = column?.type ?? "number";

  const { items, total } = useMemo(() => {
    const parsed = rows
      .map((row) => {
        const raw = row[dimension];
        const v = row[metric];
        return {
          label: raw == null || String(raw) === "" ? EMPTY_CELL : String(raw),
          value: typeof v === "number" ? v : null,
        };
      })
      .filter((r): r is { label: string; value: number } => r.value != null)
      .sort((a, b) => b.value - a.value);

    const sum = parsed.reduce((acc, r) => acc + r.value, 0);

    // Shares are taken against the POSITIVE total. Dividing by a sum that
    // credits have pulled down gives shares over 100%, and a bar wider than
    // its own track.
    const positive = parsed.reduce((acc, r) => acc + Math.max(0, r.value), 0);
    const shareOf = (v: number) => (positive > 0 ? Math.max(0, v) / positive : 0);

    const head = parsed.slice(0, MAX_ROWS);
    const tail = parsed.slice(MAX_ROWS);

    const out: Row[] = head.map((r, i) => ({
      label: r.label,
      value: r.value,
      share: shareOf(r.value),
      color: SHARE_COLORS[i] ?? SHARE_COLORS[SHARE_COLORS.length - 1],
    }));

    if (tail.length > 0) {
      const rest = tail.reduce((acc, r) => acc + r.value, 0);
      out.push({
        label: `Other (${tail.length})`,
        value: rest,
        share: shareOf(rest),
        color: SHARE_COLORS[SHARE_COLORS.length - 1],
      });
    }

    return { items: out, total: sum };
  }, [rows, dimension, metric]);

  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Nothing in this window.
      </div>
    );
  }

  const body = (
    <>
      {/* The proportion bar. `flex` rather than percentage widths so the
          segments always fill the track exactly, with no sub-pixel gap opening
          up at the end on a fractional container width. */}
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {items.map((r) =>
          r.share > 0 ? (
            <span
              key={r.label}
              style={{ background: r.color, flexGrow: r.share }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          ) : null
        )}
      </div>

      <ul className="mt-2.5 divide-y divide-border">
        {items.map((r) => (
          <li key={r.label} className="flex items-center gap-2 py-1.5 text-[13px]">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
            <span className="min-w-0 flex-1 truncate" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatReportValue(r.value, type)}
            </span>
          </li>
        ))}
      </ul>

      {/* The total is what makes the rows above it checkable. It is the reason
          the tail is folded into "Other" rather than dropped. */}
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>{column?.label ?? "Total"}</span>
        <span className="ml-auto font-medium tabular-nums">
          {formatReportValue(total, type)}
        </span>
      </div>
    </>
  );

  // A tile in edit mode passes no handler, so the card stays draggable rather
  // than becoming a button that swallows the drag.
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-full w-full flex-col text-left transition-opacity hover:opacity-80",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      {body}
    </button>
  ) : (
    <div className="flex h-full flex-col">{body}</div>
  );
}
