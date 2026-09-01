/**
 * The dashboard, a panel of visualizations you arrange yourself.
 *
 * Replaces the fixed Overview. The eight cards and two charts that used to be
 * hardcoded are now the DEFAULT layout, so nothing changes for anyone until they
 * choose to change it, and "Reset" brings that layout back.
 *
 * Edit mode is explicit. Drag and resize are off until you turn it on, so a
 * mis-click on a chart cannot rearrange the board, and changes are only written
 * when you save. That also keeps the run request stable while you drag: layout
 * is not part of the query, so moving a tile never refetches it.
 */

import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { Building2, Check, LayoutGrid, Plus, RotateCcw, X } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { canManageOrg } from "@/lib/permissions";
import { DISCARD_DASHBOARD_EDITS } from "./unsaved-prompt";
import {
  useDashboard,
  useDashboardRun,
  useReportCatalog,
  useReportTimeZone,
  useResetDashboard,
  useRetryDashboard,
  useSaveDashboard,
  useShareDashboard,
  useUnshareDashboard,
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
  title = "Overview",
  variant = "pane",
}: {
  onOpenReport: (reportId: string, filters: ReportFilterInput[] | undefined, range?: DateRange) => void;
  /** Lets the Reports page guard the rail, which swaps this component out. */
  onDirtyChange?: (dirty: boolean) => void;
  /** What the board calls itself. The home page introduces it differently. */
  title?: string;
  /**
   * Where the board is mounted, which decides two things that always travel
   * together, so they are one prop rather than two booleans nobody could set
   * inconsistently.
   *
   * "pane" is Reports: a fixed toolbar with the board scrolling underneath it
   * inside a full-height pane, so the window and comparison you are reading by
   * never leave the screen. It carries the needs-attention strip.
   *
   * "page" is the home page: the board flows with the document, because the
   * page scrolls as a whole and a second scroll region inside it traps the
   * wheel.
   */
  variant?: "pane" | "page";
}) {
  const catalog = useReportCatalog();
  const stored = useDashboard();
  const save = useSaveDashboard();
  const reset = useResetDashboard();
  const share = useShareDashboard();
  const unshare = useUnshareDashboard();
  const retry = useRetryDashboard();
  // One clock for the whole board, the school's. See `lib/report-format.ts`.
  const timeZone = useReportTimeZone();
  const confirm = useConfirm();
  // Publishing writes a board onto every colleague's screen, so it is an
  // org-wide setting and gated like one. The server enforces it regardless.
  const { roles } = useAuth();
  const canPublish = canManageOrg(roles);

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
  /** Whose board is on screen: the caller's own, the school's, or the built-in. */
  const source = stored.data?.source ?? "default";

  // Opening Customise and touching nothing isn't progress worth protecting.
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
  // Reports page guards that one, see DISCARD_DASHBOARD_EDITS.
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
    // What Reset lands on depends on whether the school publishes a board, so
    // saying "the default ones" flatly would be wrong half the time.
    const toSchool = !!stored.data?.sharedExists;
    const ok = await confirm({
      title: "Reset the dashboard?",
      description: toSchool
        ? "Your tiles and layout are replaced by the school's dashboard. This can't be undone."
        : "Your tiles and layout are replaced by the default ones. This can't be undone.",
      confirmLabel: "Reset",
      destructive: true,
    });
    if (!ok) return;
    try {
      const fresh = await reset.mutateAsync();
      setDraft(fresh.config);
      setEditing(false);
      toast.success(toSchool ? "Back to the school's dashboard" : "Back to the default dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not reset the dashboard");
    }
  };

  const publish = async () => {
    if (!config) return;
    const replacing = !!stored.data?.sharedExists;
    const ok = await confirm({
      title: replacing ? "Replace the school's dashboard?" : "Set this as the school's dashboard?",
      description: replacing
        ? "Everyone who hasn't built their own board sees this layout instead of the current school one. Anyone with their own dashboard keeps it."
        : "Everyone who hasn't built their own board sees this layout. Anyone with their own keeps it, and so do you: this publishes a copy, so you can go on changing yours without changing theirs.",
      confirmLabel: replacing ? "Replace it" : "Publish it",
    });
    if (!ok) return;
    try {
      await share.mutateAsync(config);
      toast.success("Published as the school's dashboard");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not publish this dashboard");
    }
  };

  const withdraw = async () => {
    const ok = await confirm({
      title: "Withdraw the school's dashboard?",
      description:
        "Anyone following it goes back to the built-in layout. Nobody's own saved dashboard is affected.",
      confirmLabel: "Withdraw",
      destructive: true,
    });
    if (!ok) return;
    try {
      await unshare.mutateAsync();
      toast.success("The school's dashboard has been withdrawn");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not withdraw it");
    }
  };

  /**
   * Needs attention is a WIDGET TILE now, and this is the fallback for boards
   * saved before it was.
   *
   * The strip and the tile show the same thing, so a board carrying the tile
   * must not also carry the strip: on the default layout that printed "Needs
   * attention" twice, once movable and once nailed to the foot of the page.
   *
   * Deleting the strip outright would have been simpler and was wrong. A board
   * somebody customised before widgets existed has no tile to inherit, and the
   * strip is the only place that board shows overdue work at all; taking it
   * away would be a silent feature loss for exactly the users who had bothered
   * to arrange their own dashboard. So the strip yields to the tile and
   * otherwise stays, and anyone can retire it for good by adding the widget.
   */
  const hasAttentionTile = !!config?.panels.some((p) =>
    p.visualizations.some((v) => v.viz === "widget" && v.widget === "attention")
  );
  const showAttention = !!panel && !hasAttentionTile;

  // Null when the strip is not being drawn, which is what disables the query.
  const attentionRange = useMemo(
    () =>
      panel && showAttention
        ? rangeToIso(namedToDateRange(panel.range, timeZone), timeZone)
        : null,
    [panel?.range, timeZone, showAttention]
  );
  const overview = useReportOverview(attentionRange, "none");

  if (stored.isLoading) {
    return <div className="h-96 animate-pulse rounded-lg bg-muted" />;
  }

  // A failed load must not read as a slow one. Without this the skeleton stays
  // up forever and the page looks like it is still thinking, which is exactly
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
    <div
      className={
        variant === "pane"
          ? "flex min-h-0 min-w-0 flex-1 flex-col gap-4"
          : "flex min-w-0 flex-col gap-4"
      }
      data-doc-shot="dashboard-edit-mode"
    >
      {/* Title and blurb first, controls on their own row underneath, the shape
          every report view uses. Sharing one row with the blurb is what made the
          board jump: Customise adds four buttons, the row runs out of width and
          wraps, and everything below drops a line. On its own row the toolbar
          has the width to grow into. */}
      <div className="flex shrink-0 flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {editing
              ? "Drag to move, pull the corner to resize. Nothing is saved until you're done."
              : source === "shared"
                ? // Said plainly, because the next thing this person is likely to
                  // do is move a tile, and they should know that doing so makes
                  // the board theirs rather than changing everybody's.
                  "Your school's dashboard. Customise it and you'll get your own copy."
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
              showing, the same split as a report's toolbar. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditingViz(null); setBuilderOpen(true); }}>
                  <Plus className="size-4" /> Add tile
                </Button>
                {/* Publishing is not an edit to this board, it is a copy of it
                    sent to the school, so it sits with the other board-level
                    actions rather than beside Done. Admins only; the server
                    refuses it regardless of what the toolbar shows. */}
                {canPublish && (
                  <Button variant="ghost" size="sm" onClick={publish} disabled={share.isPending}>
                    <Building2 className="size-4" />
                    {stored.data?.sharedExists ? "Replace school's" : "Set as school's"}
                  </Button>
                )}
                {canPublish && stored.data?.sharedExists && (
                  <Button variant="ghost" size="sm" onClick={withdraw} disabled={unshare.isPending}>
                    <X className="size-4" /> Withdraw school's
                  </Button>
                )}
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

      <div
        className={
          variant === "pane"
            ? "min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5"
            : "space-y-4"
        }
      >
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
                // The full handler, for widgets: each attention row opens its
                // own report on its own window.
                onOpenAnyReport={onOpenReport}
                onEdit={() => { setEditingViz(viz); setBuilderOpen(true); }}
                onRemove={() =>
                  setVisualizations(panel.visualizations.filter((v) => v.id !== viz.id))
                }
              />
            )}
          </DashboardGrid>
        )}

        {showAttention && (
        <AttentionStrip
          items={overview.data?.attention ?? []}
          loading={overview.isLoading}
          //Open on the window the COUNT was taken over, not the dashboard's current
          //range. A strip reading "3 endorsements expiring" that opened a table reading
          //"Nothing matched" is what this fixes, the tiles each declare their own window
          //precisely because "what is overdue" is not a question about the period you
          //happen to be looking at.
          onOpen={(item) =>
            onOpenReport(item.reportId, item.filters, {
              from: new Date(item.window.startDate),
              to: new Date(item.window.endDate),
            })
          }
        />
        )}
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
          // Adding a tile puts you in edit mode, you'll want to place it.
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
