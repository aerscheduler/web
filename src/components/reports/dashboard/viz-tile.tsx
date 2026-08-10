/**
 * The card a visualization lives in: header, body, and the dispatch between them.
 *
 * The header always states the WINDOW. Once tiles carry their own ranges, that
 * stops being decoration. "Revenue" reading $12,480 is meaningless when the
 * card next to it says the same word over a different period. It is the one
 * label that must never be dropped for space.
 */

import { GripVertical, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatWindow } from "@/lib/report-format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Visualization, VisualizationResult } from "@/types/dashboard";
import type { ReportMeta } from "@/types/reports";
import { VizMetric } from "./viz-metric";
import { VizLine } from "./viz-line";
import { VizBar } from "./viz-bar";
import { VizTable } from "./viz-table";
import { cn } from "@/lib/utils";

/**
 * "Jul 2, Jul 31", in the zone the window was MEASURED in.
 *
 * This used to format the server's instants with the browser's clock, so a
 * window computed over the school's days printed as "Jul 1, Jul 31" while the
 * report it opened said "Jul 2, Jul 31" for the very same span. Same reason as
 * the window maths itself: one clock, and it is the school's.
 */
const windowLabel = formatWindow;

/** Falls back to a description built from what the visualization actually asks for. */
function autoTitle(viz: Visualization, report: ReportMeta | undefined): string {
  if (viz.title) return viz.title;
  const labels = viz.metrics.map(
    (m) => report?.columns.find((c) => c.key === m)?.label ?? m
  );
  const dimension = viz.dimension
    ? report?.dimensions.find((d) => d.key === viz.dimension)?.label
    : null;
  return dimension ? `${labels.join(", ")} by ${dimension.toLowerCase()}` : labels.join(", ");
}

export function VizTile({
  viz,
  report,
  result,
  loading,
  editing,
  timeZone,
  onOpenReport,
  onEdit,
  onRemove,
}: {
  viz: Visualization;
  report: ReportMeta | undefined;
  result: VisualizationResult | undefined;
  loading: boolean;
  editing: boolean;
  /** Passed in rather than read here, so one board can't label two clocks. */
  timeZone: string;
  onOpenReport: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const body = () => {
    if (loading && !result) return <Skeleton className="h-full w-full" />;
    if (result?.error) {
      return (
        <div className="grid h-full place-items-center px-3 text-center text-xs text-muted-foreground">
          {result.error}
        </div>
      );
    }
    if (!result) return <Skeleton className="h-full w-full" />;

    switch (viz.viz) {
      case "metric":
        return (
          <VizMetric
            metric={viz.metrics[0]}
            columns={result.columns}
            totals={result.totals}
            previousTotals={result.previousTotals}
            onOpen={editing ? undefined : onOpenReport}
          />
        );
      case "line":
        return (
          <VizLine
            rows={result.rows}
            columns={result.columns}
            metrics={viz.metrics}
            dimension={viz.dimension!}
          />
        );
      case "bar":
        return (
          <VizBar
            rows={result.rows}
            columns={result.columns}
            metric={viz.metrics[0]}
            dimension={viz.dimension!}
            onOpen={editing ? undefined : onOpenReport}
          />
        );
      case "table":
        return (
          <VizTable
            rows={result.rows}
            columns={result.columns}
            metrics={viz.metrics}
            dimension={viz.dimension}
            onOpen={editing ? undefined : onOpenReport}
          />
        );
    }
  };

  return (
    <Card
      className={cn(
        "group/viz flex h-full flex-col overflow-hidden p-3",
        editing && "ring-1 ring-border"
      )}
    >
      <div className="flex items-start gap-1.5 pb-2">
        {editing && (
          // The whole card isn't draggable, a drag handle keeps text
          // selectable and stops a click on a bar becoming a drag.
          <span className="drag-handle -ml-1 cursor-grab pt-0.5 text-muted-foreground active:cursor-grabbing">
            <GripVertical className="size-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">
            {autoTitle(viz, report)}
          </div>
          {/* Never dropped: with mixed ranges, the number means nothing without it. */}
          <div className="truncate text-[11px] text-muted-foreground">
            {windowLabel(result?.window, timeZone)}
            {viz.range !== "inherit" && <span className="ml-1 opacity-70">· pinned</span>}
          </div>
        </div>

        {editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6 shrink-0">
                <MoreVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRemove} className="text-destructive">
                <Trash2 className="size-3.5" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="min-h-0 flex-1">{body()}</div>
    </Card>
  );
}
