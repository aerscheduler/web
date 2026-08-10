/**
 * Pinning a saved view to the dashboard.
 *
 * A saved view and a dashboard tile are the same idea seen from two distances:
 * a report configured a particular way. Pinning turns the first into the second
 * so the answer someone worked out once is on the board every morning, instead
 * of being a bookmark they have to remember to open.
 *
 * Two decisions worth knowing:
 *
 *  • The tile is a COPY, not a link. Editing the view later does not change the
 *    tile. A live link is defensible, arguably better for a shared view a
 *    school standardises on, but it needs the view's id in the dashboard
 *    schema and resolution at run time, with its own answers for "the view was
 *    deleted" and "the view is shared and someone else changed it". Copying is
 *    the honest version of what this actually does, and the dialog says so
 *    rather than letting people assume the other one.
 *
 *  • The shape is a SUGGESTION, made visible before anything is saved. A view
 *    grouped by aircraft becomes a bar chart, one grouped by day becomes a line
 *    chart, and an ungrouped one becomes a single number, then the builder
 *    opens with that filled in, so the guess is something you correct rather
 *    than something you discover on the board afterwards.
 */

import { useMemo } from "react";
import { toast } from "sonner";
import { usePinToDashboard, useReportTimeZone } from "@/features/reports";
import { isCompleteFilter } from "@/components/reports/shell/filter-builder";
import { primaryMeasure } from "@/lib/report-format";
import type { ReportCatalog, ReportMeta, SavedReportView } from "@/types/reports";
import type { RangeSpec, Visualization, VizType } from "@/types/dashboard";
import { VIZ_DEFAULT_SIZE } from "@/types/dashboard";
import { TileBuilder, metricLimit } from "./tile-builder";

/**
 * The starting point for a tile built from a saved view.
 *
 * Returns null only when the report has no number that can be totalled at all.
 * a view of it can be a useful table, but there is nothing to put on a tile.
 * Callers check `report.metrics.length` and don't offer the action in that case.
 */
export function tileFromSavedView(view: SavedReportView, report: ReportMeta): Visualization | null {
  // The columns someone chose to look at ARE the metrics they care about; fall
  // back to the report's first when the view only kept label columns.
  const chosen = (view.config.columns ?? []).filter((key) => report.metrics.includes(key));
  const metrics = ordered(chosen.length > 0 ? chosen : report.metrics.slice(0, 1), report);
  if (metrics.length === 0) return null;

  // A grouping the report no longer offers is dropped rather than carried into
  // a tile the server would refuse.
  const groupBy = view.config.groupBy ?? undefined;
  const dimension =
    groupBy && report.dimensions.some((d) => d.key === groupBy) ? groupBy : undefined;

  // Time reads as a line; anything else reads as a ranking; nothing reads as a
  // single figure.
  const viz: VizType = !dimension ? "metric" : dimension === "date" ? "line" : "bar";
  const size = VIZ_DEFAULT_SIZE[viz];

  return {
    id: "pending",
    title: view.name.slice(0, 60),
    viz,
    reportId: view.reportId,
    metrics: metrics.slice(0, metricLimit(viz)),
    ...(dimension ? { dimension } : {}),
    // A half-built filter narrows nothing on the report and must not narrow
    // anything here either, a saved view can hold one.
    filters: (view.config.filters ?? []).filter(isCompleteFilter),
    range: savedRangeToTileRange(view),
    compare: "inherit",
    layout: { x: 0, y: 0, w: size.w, h: size.h },
  };
}

/**
 * Money first, then hours, then counts.
 *
 * Most shapes take one metric, so which one comes FIRST decides what the tile
 * shows. Column order is the report author's reading order, not a ranking, on
 * the revenue report it puts the invoice COUNT ahead of the amount billed, so
 * "Revenue by aircraft" pinned as a bar chart of how many invoices each aircraft
 * generated. `primaryMeasure` is the same rule the report table already uses to
 * decide which column to draw its bars from.
 */
function ordered(keys: string[], report: ReportMeta): string[] {
  const primary = primaryMeasure(report.columns.filter((c) => keys.includes(c.key)));
  return primary ? [primary.key, ...keys.filter((k) => k !== primary.key)] : keys;
}

/**
 * A saved view's window → a tile's.
 *
 * Saved views store the dates that were on screen, so most carry a fixed window
 * like "1–31 July". Pinning that verbatim would produce a tile permanently
 * stuck on July, which is not what anyone means by pinning a view, so a fixed
 * window becomes "follow the dashboard", and the dialog says the dates were
 * dropped. A view that stored a NAMED window keeps it: that one still means
 * something next month.
 */
function savedRangeToTileRange(view: SavedReportView): "inherit" | RangeSpec {
  return typeof view.config.range === "string" ? view.config.range : "inherit";
}

export function hasPinnedDates(view: SavedReportView): boolean {
  return !!view.config.range && typeof view.config.range !== "string";
}

export function PinViewDialog({
  open,
  onOpenChange,
  view,
  report,
  onPinned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: SavedReportView;
  report: ReportMeta;
  /** Lets the page offer to jump to the dashboard the tile just landed on. */
  onPinned?: () => void;
}) {
  const pin = usePinToDashboard();
  const timeZone = useReportTimeZone();
  const initial = useMemo(() => tileFromSavedView(view, report), [view, report]);

  // The builder offers a report picker; here the report is the view's, so it
  // gets a catalog of one and renders as a label.
  const catalog: ReportCatalog = useMemo(
    () => ({ timeZone, categories: [], reports: [report] }),
    [report, timeZone]
  );

  if (!initial) return null;

  return (
    <TileBuilder
      open={open}
      onOpenChange={onOpenChange}
      catalog={catalog}
      mode="pin"
      initial={initial}
      note={
        <>
          Starting from “{view.name}”. The tile is a copy, changing the saved
          view later won’t change it.
          {hasPinnedDates(view) &&
            " Its saved dates follow the dashboard instead; pick a range below to fix the tile to its own window."}
        </>
      }
      onSave={async (viz) => {
        // Any error propagates: the builder keeps the dialog open and shows it,
        // rather than closing onto a toast the user can't act on.
        await pin.mutateAsync(viz);
        toast.success(`Pinned “${viz.title ?? report.name}” to your Overview`, {
          ...(onPinned ? { action: { label: "View", onClick: onPinned } } : {}),
        });
      }}
    />
  );
}
