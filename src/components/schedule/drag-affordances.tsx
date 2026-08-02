import type * as React from "react";
import type { Reservation } from "@/types/api";
import { cn } from "@/lib/utils";
import { isDraggable, type DragAbility } from "./drag-rules";

/**
 * The bits of drag UI both boards draw. They live together so the day lane grid and the
 * week time grid can't drift into explaining the same refusal two different ways — which is
 * the whole risk with a feature whose value is that it says *why* it won't move.
 */

/** Thickness of a grab strip, in px. Wide enough to hit, narrow enough not to eat the block. */
export const HANDLE_PX = 7;

/**
 * The floating label a held block carries: the slot it would land on, or — when the drop
 * would be rejected — the reason, in the same place the time would have been.
 *
 * A tooltip can't do this job: the cursor is busy, and the answer has to be visible at the
 * moment the block is over the bad slot, not after it's been let go.
 */
export function DragCallout({ reason, label }: { reason: string | null; label: string }) {
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute left-0 top-full z-40 mt-1 w-max max-w-[20rem] rounded-md border px-2 py-1 text-[11px] shadow-md",
        reason
          ? "border-destructive/40 bg-destructive text-destructive-foreground"
          : "border-border bg-popover text-popover-foreground"
      )}
    >
      <span className="tabular-nums">{label}</span>
      {reason && <span className="block font-medium">{reason}</span>}
    </div>
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
