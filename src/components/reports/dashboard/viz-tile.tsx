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
import { WIDGET_LABEL, type Visualization, type VisualizationResult, type WidgetKey } from "@/types/dashboard";
import type { ReportFilterInput, ReportMeta } from "@/types/reports";
import type { DateRange } from "react-day-picker";
import { VizMetric } from "./viz-metric";
import { VizLine } from "./viz-line";
import { VizBar } from "./viz-bar";
import { VizList } from "./viz-list";
import { VizWidget } from "./viz-widget";
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
/** What a widget is showing, in place of the window it does not have. */
const WIDGET_SUBTITLE: Record<WidgetKey, string> = {
  upcoming: "Next 7 days",
  attention: "Across all open work",
};

function autoTitle(viz: Visualization, report: ReportMeta | undefined): string {
  if (viz.title) return viz.title;
  if (viz.viz === "widget" && viz.widget) return WIDGET_LABEL[viz.widget];
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
  onOpenAnyReport,
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
  /** Opens THIS tile's report, on this tile's window. */
  onOpenReport: () => void;
  /**
   * Opens any report, on a window the caller names. A widget needs this: each
   * row of the attention list is a different report over a different window,
   * so the pre-bound handler above cannot express it.
   */
  onOpenAnyReport: (
    reportId: string,
    filters: ReportFilterInput[] | undefined,
    range?: DateRange
  ) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isWidget = viz.viz === "widget";

  const body = () => {
    // Before every result check below: a widget is never in the dashboard run,
    // so `result` is permanently undefined for one and the skeleton would stay
    // up for good.
    if (isWidget && viz.widget) {
      return (
        <VizWidget widget={viz.widget} editing={editing} onOpenReport={onOpenAnyReport} />
      );
    }

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
            previousRows={result.previousRows}
            window={result.window}
            comparison={result.comparison}
            // The same clock the header labels the window on. A chart that
            // aligned two periods on the browser's zone while the header named
            // them in the school's would disagree with its own title.
            timeZone={timeZone}
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
      case "list":
        return (
          <VizList
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
          {/* Never dropped: with mixed ranges, the number means nothing without it.
              A widget is the exception, and printing one there would be a lie:
              it ignores the board's range and declares its own, so it says what
              it is actually showing instead. */}
          <div className="truncate text-[11px] text-muted-foreground">
            {isWidget ? (
              WIDGET_SUBTITLE[viz.widget ?? "attention"]
            ) : (
              <>
                {windowLabel(result?.window, timeZone)}
                {viz.range !== "inherit" && <span className="ml-1 opacity-70">· pinned</span>}
              </>
            )}
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
