import type * as React from "react";
import { createPortal } from "react-dom";
import type { Reservation } from "@/types/api";
import { cn } from "@/lib/utils";
import { isDraggable, type DragAbility } from "./drag-rules";
import type { ActiveDrag } from "./use-schedule-drag";

/**
 * The bits of drag UI both boards draw. They live together so the day lane grid and the
 * week time grid can't drift into explaining the same refusal two different ways — which is
 * the whole risk with a feature whose value is that it says *why* it won't move.
 */

/** Thickness of a grab strip, in px. Wide enough to hit, narrow enough not to eat the block. */
export const HANDLE_PX = 7;

/** Gap between the cursor and the callout, and the margin it keeps off the viewport edge. */
const CALLOUT_OFFSET_PX = 18;
const CALLOUT_MARGIN_PX = 12;
const CALLOUT_MAX_W_PX = 320;

/**
 * The live label a held block carries: the slot it would land on, or — when the drop would
 * be rejected — the reason, in place of the time.
 *
 * A **portal to the document, positioned `fixed` against the viewport**, for two reasons.
 * It used to live inside the block, which put it inside a lane: it could be clipped by the
 * board's scroll container, and — because a lane is sized to the tracks it holds — it read
 * as though the row had grown to make space for it. Neither is true of a popover. Out here
 * it can't affect any layout, can't be clipped, and can flip off the viewport edges.
 *
 * A tooltip can't do this job either: the cursor is busy holding a block, and the answer has
 * to be readable while the block is over the bad slot, not after it's been let go.
 */
export function DragCallout({ drag }: { drag: { active: ActiveDrag | null } }) {
  const active = drag.active;
  if (!active || !active.moved || !active.anchor || typeof document === "undefined") return null;

  const { x, y } = active.anchor;
  //Flip to the left / above rather than run off the edge. The height isn't known before
  //layout, so the vertical flip uses a generous estimate — being early is harmless, and a
  //callout half off the bottom of the screen is not.
  const flipX = x + CALLOUT_OFFSET_PX + CALLOUT_MAX_W_PX > window.innerWidth - CALLOUT_MARGIN_PX;
  const flipY = y + CALLOUT_OFFSET_PX + 96 > window.innerHeight - CALLOUT_MARGIN_PX;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: flipX ? undefined : x + CALLOUT_OFFSET_PX,
        right: flipX ? Math.max(CALLOUT_MARGIN_PX, window.innerWidth - x + CALLOUT_OFFSET_PX) : undefined,
        top: flipY ? undefined : y + CALLOUT_OFFSET_PX,
        bottom: flipY ? Math.max(CALLOUT_MARGIN_PX, window.innerHeight - y + CALLOUT_OFFSET_PX) : undefined,
        maxWidth: CALLOUT_MAX_W_PX,
      }}
      className={cn(
        "pointer-events-none z-[100] w-max rounded-md border px-2.5 py-1.5 text-xs shadow-lg",
        active.reason
          ? "border-destructive/40 bg-destructive text-destructive-foreground"
          : "border-border bg-popover text-popover-foreground"
      )}
    >
      <span className="block tabular-nums font-medium">{active.label}</span>
      {active.reason && <span className="mt-0.5 block">{active.reason}</span>}
    </div>,
    document.body
  );
}

/**
 * A grab strip on one end of a block.
 *
 * Only ever rendered for an edge that may actually move, so the resize cursor never
 * promises something the booking's state won't allow — a ramped-out flight shows one handle
 * (the return time) and no other.
 */
export function ResizeHandle({
  axis,
  side,
  onPointerDown,
}: {
  /** The axis TIME runs along: `x` on the day board, `y` on the week board. */
  axis: "x" | "y";
  /** Which end of the booking this handle drags. */
  side: "start" | "end";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const horizontal = axis === "x";
  return (
    <span
      data-drag-exempt
      onPointerDown={onPointerDown}
      style={horizontal ? { width: HANDLE_PX, touchAction: "none" } : { height: HANDLE_PX, touchAction: "none" }}
      className={cn(
        "absolute z-10 opacity-0 transition-opacity group-hover:opacity-100",
        //A thin rule down the middle of the strip, so the grabbable edge is visible and not
        //just a place the cursor happens to change over.
        horizontal
          ? "inset-y-0 cursor-col-resize before:absolute before:inset-y-1 before:left-1/2 before:w-px before:-translate-x-1/2 before:rounded before:bg-current"
          : "inset-x-0 cursor-row-resize before:absolute before:inset-x-1 before:top-1/2 before:h-px before:-translate-y-1/2 before:rounded before:bg-current",
        horizontal
          ? side === "start"
            ? "left-0"
            : "right-0"
          : side === "start"
            ? "top-0"
            : "bottom-0"
      )}
      aria-hidden
    />
  );
}

/**
 * What a screen reader hears on a block.
 *
 * The refusal reason is part of the label rather than a tooltip-only aside, because "why
 * can't I move this" is the question the board most often has to answer, and hovering isn't
 * an answer available to everyone.
 */
export function dragAriaLabel(
  r: Reservation,
  timeRange: string,
  ability: DragAbility | undefined,
  hint: string
): string {
  const base = `${r.title}, ${timeRange}`;
  if (!ability) return base;
  if (isDraggable(ability)) {
    return `${base}. ${hint}${ability.reason ? ` ${ability.reason}` : ""}`;
  }
  return `${base}. Can't be rescheduled: ${ability.reason ?? "not editable."}`;
}
