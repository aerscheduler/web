/**
 * Where a tile goes, and how big it is allowed to be.
 *
 * Placement is shared because a tile can now arrive from two directions, the
 * builder on the dashboard, and "Pin to dashboard" from a saved view on a report
 * the board isn't even on screen for. Both have to answer the same question
 * ("where does this land?") and they must answer it identically, or pinning
 * drops a tile on top of an existing one.
 *
 * The bounds here mirror `server/src/reports/dashboard/schema.ts`. They are not
 * the enforcement (the server validates every write) they are what keeps us
 * from sending something we already know it will reject.
 */

import type { GridPosition, Visualization, VizType } from "@/types/dashboard";
import { VIZ_MIN_SIZE } from "@/types/dashboard";

export const GRID_COLUMNS = 12;
/** `layout.y` is bounded server-side; a board this tall is already unusable. */
export const MAX_ROW = 200;
/** `panel.visualizations` is capped server-side. */
export const MAX_TILES_PER_PANEL = 40;

/**
 * Grow a position to something the chosen shape can actually be drawn in.
 *
 * This matters most when a tile CHANGES type: edit a number card into a line
 * chart and it keeps the card's 3×1 footprint, which is below the line chart's
 * minimum. The grid enforces the minimum while dragging but nothing enforced it
 * on save, so the tile came back as a 120px-tall chart squeezed into one row.
 */
export function fitToGrid(viz: VizType, layout: GridPosition): GridPosition {
  const min = VIZ_MIN_SIZE[viz];
  const w = Math.min(GRID_COLUMNS, Math.max(layout.w, min.w));
  const h = Math.max(layout.h, min.h);
  return {
    w,
    h,
    // Keep the tile on the grid: a 6-wide tile cannot start at column 9.
    x: Math.max(0, Math.min(layout.x, GRID_COLUMNS - w)),
    y: Math.max(0, Math.min(layout.y, MAX_ROW)),
  };
}

/**
 * Put a new tile below everything already placed.
 *
 * The builder can't work this out, only the board knows what is already on it.
 * Bottom rather than "first gap" on purpose: a new tile should appear somewhere
 * predictable that you then drag, not tucked into a hole you have to hunt for.
 */
export function placeAtBottom(existing: Visualization[], viz: Visualization): Visualization {
  const bottom = existing.reduce((max, v) => Math.max(max, v.layout.y + v.layout.h), 0);
  return { ...viz, layout: fitToGrid(viz.viz, { ...viz.layout, x: 0, y: bottom }) };
}
