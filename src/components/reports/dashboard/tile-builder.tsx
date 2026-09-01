/**
 * Building a tile: pick a report, a shape, the metrics, and the window.
 *
 * The form narrows as you go, and it narrows using the CATALOG rather than its
 * own knowledge, the metric list comes from the server's `metrics` array, so
 * the builder can only ever offer a choice that renders. Picking a label column
 * for a number card is not a validation error here; it is not offered.
 *
 * Filters reuse the report shell's `FilterBuilder` outright. A second filter UI
 * that drifted from the first is exactly the kind of duplication this whole
 * engine exists to avoid.
 *
 * One form serves three entrances, adding a tile, editing one, and pinning a
 * saved view, because they differ only in where the starting values come from
 * and what happens to the id. A separate "pin" form would be the same fields
 * with the same rules, drifting apart on its own schedule.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilterBuilder } from "@/components/reports/shell/filter-builder";
import { RANGE_LABELS } from "@/lib/report-format";
import { firstProblem } from "@/lib/dashboard-schema";
import { fitToGrid } from "@/lib/dashboard-layout";
import type { ReportCatalog, ReportDefaultRange, ReportFilterInput } from "@/types/reports";
import {
  VIZ_DEFAULT_SIZE,
  VIZ_HINT,
  VIZ_LABEL,
  VIZ_TYPES,
  WIDGET_HINT,
  WIDGET_KEYS,
  WIDGET_LABEL,
  type RangeSpec,
  type Visualization,
  type VizType,
  type WidgetKey,
} from "@/types/dashboard";
import { cn } from "@/lib/utils";

const INHERIT = "__inherit__";

/** How many metrics each shape accepts, mirrors the server's rules. */
export function metricLimit(viz: VizType): number {
  if (viz === "metric" || viz === "bar" || viz === "list") return 1;
  if (viz === "line") return 3;
  return 6;
}

/** Shapes that plot something along an axis, and so need a dimension to plot it against. */
const NEEDS_DIMENSION = new Set<VizType>(["line", "bar", "list"]);

export type TileBuilderMode = "add" | "edit" | "pin";

const HEADING: Record<TileBuilderMode, string> = {
  add: "Add a tile",
  edit: "Edit tile",
  pin: "Pin to dashboard",
};

const SUBMIT: Record<TileBuilderMode, string> = {
  add: "Add tile",
  edit: "Save changes",
  pin: "Pin tile",
};

/**
 * Crop target for the help documentation's screenshots. Inert.
 *
 * Pinning is documented as its own screen (the report is locked, the title is
 * carried over, and the note about the tile being a copy is the point), so it
 * gets its own id rather than sharing the builder's.
 */
const DOC_SHOT: Record<TileBuilderMode, string> = {
  add: "dashboard-tile-builder",
  edit: "dashboard-tile-builder",
  pin: "dashboard-pin-view",
};

export function TileBuilder({
  open,
  onOpenChange,
  catalog,
  mode,
  initial,
  note,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: ReportCatalog | undefined;
  /**
   * Only "edit" keeps the tile's id and position; ", add" and "pin" both mint a
   * new tile and leave placement to the board.
   */
  mode: TileBuilderMode;
  /** The tile being edited, or the values to start a new one from. */
  initial: Visualization | null;
  /** Says where the starting values came from, when they came from somewhere. */
  note?: React.ReactNode;
  /** May be async, the dialog stays open, and shows the error, if it throws. */
  onSave: (viz: Visualization) => void | Promise<void>;
}) {
  // Memoised: this is a dependency of the seeding effect below, and a fresh `[]`
  // on every render would re-seed the form, wiping what is being typed into it.
  const reports = useMemo(() => catalog?.reports ?? [], [catalog]);

  const [reportId, setReportId] = useState("");
  const [viz, setViz] = useState<VizType>("metric");
  const [metrics, setMetrics] = useState<string[]>([]);
  const [dimension, setDimension] = useState<string | undefined>();
  const [range, setRange] = useState<"inherit" | ReportDefaultRange>("inherit");
  const [compare, setCompare] = useState<"inherit" | "previous" | "lastYear" | "none">("inherit");
  const [filters, setFilters] = useState<ReportFilterInput[]>([]);
  const [title, setTitle] = useState("");
  const [widget, setWidget] = useState<WidgetKey | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form each time it opens, so an edit never inherits the last add.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setReportId(initial.reportId);
      setViz(initial.viz);
      setMetrics(initial.metrics);
      setDimension(initial.dimension);
      setRange(typeof initial.range === "string" ? (initial.range as any) : "inherit");
      setCompare(initial.compare);
      setFilters(initial.filters ?? []);
      setTitle(initial.title ?? "");
      // Without this, editing a widget tile opened on the picker with nothing
      // selected and saved a widget tile naming no widget.
      setWidget(initial.widget);
    } else {
      setReportId(reports[0]?.id ?? "");
      setViz("metric");
      setMetrics([]);
      setDimension(undefined);
      setRange("inherit");
      setCompare("inherit");
      setFilters([]);
      setTitle("");
      setWidget(undefined);
    }
    setError(null);
    setSaving(false);
  }, [open, initial, reports]);

  const report = reports.find((r) => r.id === reportId);

  /** Only columns the server marked as metrics, a label here renders an empty box. */
  const available = useMemo(
    () => (report ? report.columns.filter((c) => report.metrics.includes(c.key)) : []),
    [report]
  );

  /**
   * Narrowing happens in the change handlers, NOT in an effect.
   *
   * It used to be an effect keyed on the report and the shape, and it silently
   * ate the values the form was seeded with: opening the dialog set `reportId`
   * and `metrics` in one pass, and the effect ran in that same pass against the
   * PREVIOUS report's metric list, which, the first time it opens, is empty.
   * So every seeded metric was filtered out and both editing a tile and pinning
   * a view arrived with nothing selected and a dead Save button.
   *
   * Doing it here means it only happens when someone actually changes something,
   * which is the only time there is anything to narrow.
   */
  const chooseReport = (id: string) => {
    const next = reports.find((r) => r.id === id);
    setReportId(id);
    // Switching to a report with nothing to break down by would strand the form
    // on a shape that is now impossible, with its own option greyed out.
    if (next && next.dimensions.length === 0 && NEEDS_DIMENSION.has(viz)) setViz("metric");
    setMetrics((current) => current.filter((m) => next?.metrics.includes(m)));
    setDimension((current) =>
      current && next?.dimensions.some((d) => d.key === current) ? current : undefined
    );
    // Filters are written against a report's own columns, so they cannot survive
    // a change of report, "aircraft is N7412K" means nothing on a tax report.
    setFilters([]);
  };

  const chooseViz = (next: VizType) => {
    setViz(next);
    setMetrics((current) => current.slice(0, metricLimit(next)));
    if (next === "metric") setDimension(undefined);
    // Landing on Widget with none chosen leaves the Save button dead with no
    // sign why, so it opens on the first one.
    if (next === "widget") setWidget((current) => current ?? WIDGET_KEYS[0]);
  };

  /**
   * A widget tile has no report behind it, so most of this form does not apply
   * to one: no metric, no dimension, no filters, and the range and comparison
   * are ignored because each widget declares its own window. Hiding those
   * sections is not cosmetic, leaving them up would offer choices that silently
   * do nothing to the tile being built.
   */
  const isWidget = viz === "widget";

  /**
   * Widget is not offered when PINNING.
   *
   * A pin starts from a saved view, and choosing Widget would throw that view
   * away and leave a built-in panel with the view's name on it. There is
   * nothing to warn about because there is nothing the choice could preserve,
   * so the shape simply is not on the list.
   */
  const shapes = mode === "pin" ? VIZ_TYPES.filter((t) => t !== "widget") : VIZ_TYPES;

  const limit = metricLimit(viz);
  const hasDimensions = (report?.dimensions.length ?? 0) > 0;
  const needsDimension = NEEDS_DIMENSION.has(viz);

  const toggleMetric = (key: string) => {
    setMetrics((current) => {
      if (current.includes(key)) return current.filter((m) => m !== key);
      // With a limit of one, picking replaces rather than refusing.
      if (limit === 1) return [key];
      return current.length >= limit ? current : [...current, key];
    });
  };

  const save = async () => {
    const size = VIZ_DEFAULT_SIZE[viz];
    const editing = mode === "edit" && initial;
    const candidate: Visualization = {
      id: editing ? initial.id : `v${Date.now().toString(36)}`,
      ...(title.trim() ? { title: title.trim() } : {}),
      viz,
      // A widget carries a name where every other tile carries a report, and
      // must not carry stale metrics from whatever shape was selected before it.
      reportId: isWidget ? "" : reportId,
      metrics: isWidget ? [] : metrics,
      ...(isWidget && widget ? { widget } : {}),
      ...(!isWidget && dimension ? { dimension } : {}),
      filters: isWidget ? [] : filters,
      range: range === "inherit" ? "inherit" : (range as RangeSpec),
      compare,
      // Keep an edited tile where it is, but never smaller than its shape can be
      // drawn in: turning a number card into a line chart used to keep the
      // card's 3×1 footprint, and the chart came back squeezed into one row.
      // A NEW tile gets a placeholder position; the board places it, because
      // only the board knows what is already on the grid. (A magic "y: 999"
      // sentinel was the previous approach and it silently failed y ≤ 200.)
      layout: editing
        ? fitToGrid(viz, initial.layout)
        : { x: 0, y: 0, w: size.w, h: size.h },
    };

    // Check against the same rules the server enforces, so the message is
    // inline and specific rather than a toast saying the save failed.
    const problem = firstProblem({
      version: 1,
      panels: [{ id: "p", range: "past30", compare: "previous", segment: [], visualizations: [candidate] }],
    });
    if (problem) {
      setError(problem);
      return;
    }

    // Pinning writes to the server from here, so a failure has to land in the
    // form rather than closing it and firing a toast at an empty screen.
    setSaving(true);
    try {
      await onSave(candidate);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Could not save this tile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      dataDocShot={DOC_SHOT[mode]}
      open={open} onOpenChange={onOpenChange}
      title={HEADING[mode]}
      description={note}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={(isWidget ? !widget : !reportId || metrics.length === 0) || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {SUBMIT[mode]}
          </Button></>}
    >

        

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-4">
            {!isWidget && (
            <div className="space-y-1.5">
              <Label>Report</Label>
              {/* Pinning passes a catalog of exactly one report: the tile is
                  this saved view, and swapping the report underneath it would
                  quietly strip the metrics and filters that gave it meaning. */}
              <Select value={reportId} onValueChange={chooseReport} disabled={reports.length <= 1}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a report" />
                </SelectTrigger>
                <SelectContent>
                  {reports.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            <div className="space-y-1.5">
              <Label>Show it as</Label>
              <div className="grid grid-cols-2 gap-2">
                {shapes.map((t) => {
                  // Some reports have nothing to cut by, instructor activity is
                  // already one row per instructor. Offering a chart there leads
                  // to an empty "Across" list and a tile that can never be
                  // saved, so the shape is refused up front with the reason.
                  const impossible = NEEDS_DIMENSION.has(t) && !hasDimensions;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={impossible}
                      onClick={() => chooseViz(t)}
                      className={cn(
                        "rounded-md border p-2 text-left text-sm transition-colors",
                        impossible
                          ? "cursor-not-allowed border-border opacity-50"
                          : viz === t
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border hover:bg-muted/60"
                      )}
                    >
                      {VIZ_LABEL[t]}
                      <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                        {impossible
                          ? `${report?.name ?? "This report"} has nothing to break this down by.`
                          : VIZ_HINT[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isWidget && (
              <div className="space-y-1.5">
                <Label>Which widget</Label>
                <div className="grid gap-2">
                  {WIDGET_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setWidget(k)}
                      className={cn(
                        "rounded-md border p-2 text-left text-sm transition-colors",
                        widget === k
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:bg-muted/60"
                      )}
                    >
                      {WIDGET_LABEL[k]}
                      <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                        {WIDGET_HINT[k]}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  A widget sets its own window, so the board&rsquo;s date range and
                  comparison don&rsquo;t apply to it.
                </p>
              </div>
            )}

            {!isWidget && (
            <div className="space-y-1.5">
              <Label>
                {limit === 1 ? "Metric" : `Metrics`}
                <span className="ml-1 font-normal text-muted-foreground">
                  {limit > 1 && `(up to ${limit})`}
                </span>
              </Label>
              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
                {available.length === 0 && (
                  <p className="px-1 py-1.5 text-sm text-muted-foreground">
                    This report has no numbers that can be totalled.
                  </p>
                )}
                {available.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-1 hover:bg-muted"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={metrics.includes(c.key)}
                      onCheckedChange={() => toggleMetric(c.key)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm leading-tight">{c.label}</span>
                      {c.description && (
                        <span className="block text-xs leading-snug text-muted-foreground">
                          {c.description}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            )}

            {needsDimension && (
              <div className="space-y-1.5">
                <Label>{viz === "bar" ? "Rank by" : viz === "list" ? "Break down by" : "Across"}</Label>
                <Select value={dimension ?? ""} onValueChange={setDimension}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    {(report?.dimensions ?? []).map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isWidget && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date range</Label>
                <Select value={range} onValueChange={(v) => setRange(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Inheriting is the default: most tiles should follow the
                        board's date picker, and only the pinned ones opt out. */}
                    <SelectItem value={INHERIT.replace(INHERIT, "inherit")}>
                      Follow the dashboard
                    </SelectItem>
                    {(Object.keys(RANGE_LABELS) as ReportDefaultRange[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {RANGE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Compare to</Label>
                <Select value={compare} onValueChange={(v) => setCompare(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Follow the dashboard</SelectItem>
                    <SelectItem value="previous">Previous period</SelectItem>
                    <SelectItem value="lastYear">Same period last year</SelectItem>
                    <SelectItem value="none">No comparison</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            )}

            {!isWidget && (
            <div className="space-y-1.5">
              <Label>Filters</Label>
              <FilterBuilder
                definitions={report?.filters ?? []}
                filters={filters}
                onChange={setFilters}
              />
            </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tile-title">Title</Label>
              <Input
                id="tile-title"
                value={title}
                maxLength={60}
                placeholder="Optional, one is generated from the metric"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

          </div>
        </ScrollArea>

        {/* Outside the scroll area on purpose: inside it, a validation message
            sat below the fold and a rejected save read as a dead button. */}
        {error && <p className="pt-1 text-sm text-destructive">{error}</p>}
    </ResponsiveModal>
  );
}
