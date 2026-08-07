/**
 * The dashboard — a panel of visualizations you arrange yourself.
 *
 * Replaces the fixed Overview. The eight cards and two charts that used to be
 * hardcoded are now the DEFAULT layout, so nothing changes for anyone until they
 * choose to change it — and "Reset" brings that layout back.
 *
 * Edit mode is explicit. Drag and resize are off until you turn it on, so a
 * mis-click on a chart cannot rearrange the board, and changes are only written
 * when you save. That also keeps the run request stable while you drag: layout
 * is not part of the query, so moving a tile never refetches it.
 */

import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { Check, LayoutGrid, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/confirm-dialog";
import { DISCARD_DASHBOARD_EDITS } from "./unsaved-prompt";
import {
  useDashboard,
  useDashboardRun,
  useReportCatalog,
  useReportTimeZone,
  useResetDashboard,
  useRetryDashboard,
  useSaveDashboard,
} from "@/features/reports";
import { RANGE_LABELS } from "@/lib/report-format";
import { placeAtBottom } from "@/lib/dashboard-layout";
import type { ReportDefaultRange, ReportFilterInput } from "@/types/reports";
import type { DashboardConfig, Visualization } from "@/types/dashboard";
import { DashboardGrid } from "./dashboard-grid";
import { VizTile } from "./viz-tile";
import { TileBuilder } from "./tile-builder";
import { AttentionStrip } from "./attention-strip";
import { useReportOverview } from "@/features/reports";
import { rangeToIso, resolveRange } from "@/lib/report-format";

export function Dashboard({
  onOpenReport,
  onDirtyChange,
}: {
  onOpenReport: (reportId: string, filters: ReportFilterInput[] | undefined, range?: DateRange) => void;
  /** Lets the Reports page guard the rail, which swaps this component out. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const catalog = useReportCatalog();
  const stored = useDashboard();
  const save = useSaveDashboard();
  const reset = useResetDashboard();
  const retry = useRetryDashboard();
  // One clock for the whole board — the school's. See `lib/report-format.ts`.
  const timeZone = useReportTimeZone();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<DashboardConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingViz, setEditingViz] = useState<Visualization | null>(null);

  // The server's document is the source of truth until the user edits.
  useEffect(() => {
    if (stored.data && !editing) setDraft(stored.data.config);
  }, [stored.data, editing]);

  // Tell them what the server refused to serve, rather than quietly showing less.
  useEffect(() => {
    for (const message of stored.data?.dropped ?? []) toast.warning(message);
  }, [stored.data?.dropped]);

  const config = draft ?? stored.data?.config ?? null;
  const panel = config?.panels[0] ?? null;

  // Opening Customise and touching nothing isn't progress worth protecting —
  // only a draft that actually differs from what the server holds.
  const dirty =
    editing &&
    !!stored.data &&
    JSON.stringify(config) !== JSON.stringify(stored.data.config);

  useEffect(() => {
    onDirtyChange?.(dirty);
    // Leaving via the rail unmounts us; the page must not stay armed afterwards.
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  // Covers leaving the route entirely (the sidebar, back/forward) and closing
  // the tab. Leaving Overview for a report doesn't change the route, so the
  // Reports page guards that one — see DISCARD_DASHBOARD_EDITS.
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: () => dirty,
    shouldBlockFn: async () => !(await confirm(DISCARD_DASHBOARD_EDITS)),
  });

  const run = useDashboardRun(config);
  const results = useMemo(
    () => new Map((run.data?.results ?? []).map((r) => [r.id, r])),
    [run.data]
  );

  const patchPanel = (patch: Partial<typeof panel>) => {
    if (!config || !panel) return;
    setDraft({ ...config, panels: [{ ...panel, ...patch } as typeof panel, ...config.panels.slice(1)] });
  };

  const setVisualizations = (vizzes: Visualization[]) => patchPanel({ visualizations: vizzes });

  const commit = async () => {
    if (!config) return;
    try {
      await save.mutateAsync(config);
      setEditing(false);
      toast.success("Dashboard saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save the dashboard");
    }
  };

  const cancel = () => {
    setDraft(stored.data?.config ?? null);
    setEditing(false);
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: "Reset the dashboard?",
      description: "Your tiles and layout are replaced by the default ones. This can't be undone.",
      confirmLabel: "Reset",
      destructive: true,
    });
    if (!ok) return;
    try {
      const fresh = await reset.mutateAsync();
      setDraft(fresh.config);
      setEditing(false);
      toast.success("Back to the default dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not reset the dashboard");
    }
  };

  // The needs-attention strip is not a tile — it is a fixed strip of counts
  // rather than one visualization — so it keeps its own small request.
  const attentionRange = useMemo(
    () => (panel ? rangeToIso(namedToDateRange(panel.range, timeZone), timeZone) : null),
    [panel?.range, timeZone]
  );
  const overview = useReportOverview(attentionRange, "none");

  if (stored.isLoading) {
    return <div className="h-96 animate-pulse rounded-lg bg-muted" />;
  }

  // A failed load must not read as a slow one. Without this the skeleton stays
  // up forever and the page looks like it is still thinking — which is exactly
  // what happened when the dev proxy pointed at a server without the endpoint.
  if (stored.isError || !config || !panel) {
    return (
      <Card className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {(stored.error as Error)?.message ?? "Could not load your dashboard."}
        </p>
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    // Same bargain as a report: the toolbar is fixed and the board scrolls under
    // it, so the window and comparison you are reading by never leave the screen.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4" data-doc-shot="dashboard-edit-mode">
      {/* Title and blurb first, controls on their own row underneath — the shape
          every report view uses. Sharing one row with the blurb is what made the
          board jump: Customise adds four buttons, the row runs out of width and
          wraps, and everything below drops a line. On its own row the toolbar
          has the width to grow into. */}
      <div className="flex shrink-0 flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            {editing
              ? "Drag to move, pull the corner to resize. Nothing is saved until you're done."
              : "Every figure opens the report behind it."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeof panel.range === "string" ? panel.range : "past30"}
            onValueChange={(v) => patchPanel({ range: v as ReportDefaultRange })}
          >
            <SelectTrigger className="h-9 w-auto min-w-[9rem] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABELS) as ReportDefaultRange[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {RANGE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={panel.compare} onValueChange={(v) => patchPanel({ compare: v as any })}>
            <SelectTrigger className="h-9 w-auto min-w-[11rem] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="previous">vs previous period</SelectItem>
              <SelectItem value="lastYear">vs last year</SelectItem>
              <SelectItem value="none">No comparison</SelectItem>
            </SelectContent>
          </Select>

          {/* What you do with the board sits right, away from what the board is
              showing — the same split as a report's toolbar. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditingViz(null); setBuilderOpen(true); }}>
                  <Plus className="size-4" /> Add tile
                </Button>
                <Button variant="ghost" size="sm" onClick={resetAll}>
                  <RotateCcw className="size-4" /> Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={cancel}>
                  <X className="size-4" /> Cancel
                </Button>
                <Button size="sm" onClick={commit} disabled={save.isPending}>
                  <Check className="size-4" /> Done
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <LayoutGrid className="size-4" /> Customise
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
        {panel.visualizations.length === 0 ? (
          <Card className="grid h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
            No tiles yet. {editing ? "Add one to get started." : "Choose Customise to add one."}
          </Card>
        ) : (
          <DashboardGrid
            visualizations={panel.visualizations}
            editing={editing}
            onLayoutChange={(next) =>
              setVisualizations(
                panel.visualizations.map((v) => (next[v.id] ? { ...v, layout: next[v.id] } : v))
              )
            }
          >
            {(viz) => (
              <VizTile
                viz={viz}
                report={catalog.data?.reports.find((r) => r.id === viz.reportId)}
                result={results.get(viz.id)}
                loading={run.isLoading}
                editing={editing}
                timeZone={timeZone}
                onOpenReport={() => {
                  const result = results.get(viz.id);
                  onOpenReport(
                    viz.reportId,
                    viz.filters,
                    result
                      ? { from: new Date(result.window.startDate), to: new Date(result.window.endDate) }
                      : undefined
                  );
                }}
                onEdit={() => { setEditingViz(viz); setBuilderOpen(true); }}
                onRemove={() =>
                  setVisualizations(panel.visualizations.filter((v) => v.id !== viz.id))
                }
              />
            )}
          </DashboardGrid>
        )}

        <AttentionStrip
          items={overview.data?.attention ?? []}
          loading={overview.isLoading}
          //Open on the window the COUNT was taken over, not the dashboard's current
          //range. A strip reading "3 endorsements expiring" that opened a table reading
          //"Nothing matched" is what this fixes — the tiles each declare their own window
          //precisely because "what is overdue" is not a question about the period you
          //happen to be looking at.
          onOpen={(item) =>
            onOpenReport(item.reportId, item.filters, {
              from: new Date(item.window.startDate),
              to: new Date(item.window.endDate),
            })
          }
        />
      </div>

      <TileBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        catalog={catalog.data}
        mode={editingViz ? "edit" : "add"}
        initial={editingViz}
        onSave={(viz) => {
          const exists = panel.visualizations.some((v) => v.id === viz.id);
          setVisualizations(
            exists
              ? panel.visualizations.map((v) => (v.id === viz.id ? viz : v))
              : [...panel.visualizations, placeAtBottom(panel.visualizations, viz)]
          );
          // Adding a tile puts you in edit mode — you'll want to place it.
          setEditing(true);
        }}
      />
    </div>
  );
}

/** The attention strip still takes real dates; panels speak in named ranges. */
function namedToDateRange(
  range: DashboardConfig["panels"][number]["range"],
  timeZone: string
): DateRange | undefined {
  if (typeof range === "string") return resolveRange(range as ReportDefaultRange, timeZone);
  return { from: new Date(range.startDate), to: new Date(range.endDate) };
}
