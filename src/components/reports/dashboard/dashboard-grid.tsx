/**
 * The grid: free-form drag and resize, collapsing to one column on a phone.
 *
 * Only the `lg` layout is stored. Narrower breakpoints are DERIVED rather than
 * saved, which is the decision that keeps this maintainable: storing a layout
 * per breakpoint means every tile has three positions to keep consistent, and
 * a phone has no meaningful notion of "two columns across" anyway. So:
 *
 *   lg (≥760)  12 columns, exactly what was saved, drag and resize freely
 *   md (≥480)   6 columns, the same order, halved widths
 *   sm (<480)   1 column, full width, in reading order (top-to-bottom, then
 *               left-to-right), x and y are meaningless at 375px
 *
 * Derivation happens here rather than in react-grid-layout's own compaction
 * because we want the phone order to follow how the dashboard READS, and its
 * default would preserve x-position in a way that scrambles that.
 *
 * Drag and resize are off unless `editing`, so an ordinary viewer cannot nudge
 * the board by mis-clicking a chart.
 */

import { useMemo } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type ResponsiveLayouts,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import type { Visualization } from "@/types/dashboard";
import { VIZ_MIN_SIZE } from "@/types/dashboard";

type Breakpoint = "lg" | "md" | "sm";

/**
 * Breakpoints measure the GRID CONTAINER, not the viewport.
 *
 * `useContainerWidth` reports the width of the pane the grid sits in, and on
 * Reports that pane is the window minus a 240px sidebar and a 240px report rail
 *, measured at 849px on a 1440px screen. Viewport-shaped breakpoints (lg: 1024)
 * put that into `md`, which silently halved the column count and laid four
 * metric cards out two-across.
 */
const BREAKPOINTS: Record<Breakpoint, number> = { lg: 760, md: 480, sm: 0 };
const COLS: Record<Breakpoint, number> = { lg: 12, md: 6, sm: 1 };

/**
 * One row unit.
 *
 * A metric card is one row, and it has to fit a title (16), the window it covers
 * (13), the header's gap (8), a 26px figure, its delta line (16) and the card's
 * own padding (24), about 111px, and 120 leaves the figure room to breathe
 * rather than sitting hard against the window label. Anything less clips, and
 * because the value is vertically centred the clipping shows up as the label
 * printing over the number rather than as an honest cut-off.
 */
const ROW_HEIGHT = 120;

/**
 * Reading order: top-to-bottom, then left-to-right.
 *
 * The order a person scans the board, which is the only sensible way to stack it
 * on a phone, a tile in the top-right belongs above one in the second row, not
 * after everything in column one.
 */
function readingOrder(vizzes: Visualization[]): Visualization[] {
  return [...vizzes].sort(
    (a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x
  );
}

export function DashboardGrid({
  visualizations,
  editing,
  onLayoutChange,
  children,
}: {
  visualizations: Visualization[];
  editing: boolean;
  onLayoutChange: (next: Record<string, { x: number; y: number; w: number; h: number }>) => void;
  /** One node per visualization, keyed by its id. */
  children: (viz: Visualization) => React.ReactNode;
}) {
  const { width, containerRef, mounted } = useContainerWidth();

  const layouts: ResponsiveLayouts<Breakpoint> = useMemo(() => {
    const lg: Layout = visualizations.map((v) => ({
      i: v.id,
      ...v.layout,
      minW: VIZ_MIN_SIZE[v.viz].w,
      minH: VIZ_MIN_SIZE[v.viz].h,
    }));

    const ordered = readingOrder(visualizations);

    // Halve the width and let the grid reflow; a 3-wide card on 12 columns is
    // still a quarter-width card on 6.
    const md: Layout = ordered.map((v) => ({
      i: v.id,
      x: v.layout.x >= 6 ? 3 : 0,
      y: v.layout.y,
      w: Math.max(VIZ_MIN_SIZE[v.viz].w, Math.min(6, Math.round(v.layout.w / 2))),
      h: v.layout.h,
    }));

    // One column, in reading order, each tile as tall as it was.
    let y = 0;
    const sm: Layout = ordered.map((v) => {
      const item = { i: v.id, x: 0, y, w: 1, h: v.layout.h };
      y += v.layout.h;
      return item;
    });

    return { lg, md, sm };
  }, [visualizations]);

  return (
    <div ref={containerRef} data-doc-shot="reports-overview-board">
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: editing, handle: ".drag-handle" }}
          resizeConfig={{ enabled: editing, handles: ["se"] }}
          onLayoutChange={(current: Layout, all: ResponsiveLayouts<Breakpoint>) => {
            if (!editing) return;
            // Only `lg` is the source of truth, md and sm are derived, so
            // saving them would freeze a phone layout nobody chose.
            const lg = all.lg ?? current;
            const next: Record<string, { x: number; y: number; w: number; h: number }> = {};
            for (const item of lg) {
              next[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
            }
            onLayoutChange(next);
          }}
        >
          {visualizations.map((viz) => (
            // `h-full` matters: the grid sets an inline height on this wrapper,
            // and without it the card inside keeps its natural height and its
            // header prints over its own value.
            <div key={viz.id} className="h-full">
              {children(viz)}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
