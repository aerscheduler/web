import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Reservation, Resource, Role } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useUpdateReservation } from "@/features/queries";
import { formatDateInZone, formatTimeRangeInZone } from "@/lib/timezone";
import { SLOT_MIN } from "@/lib/scheduling";
import type { SlotOfferHold } from "@/lib/slot-offer-holds";
import { reservationToInput } from "./reservation-shared";
import {
  dragAbility,
  isUnchanged,
  proposeTimes,
  snapMinutes,
  validateDrop,
  type DragAbility,
  type DragMode,
  type GroundedLookup,
} from "./drag-rules";

/**
 * Dragging bookings around the dispatch board.
 *
 * One hook drives every board, because the two grids differ only in geometry: the day board
 * lays time out along X and resources down Y, the week board lays time down Y and days
 * across X. Each grid hands in a `DragGeometry` describing its own axis, its pixels-per-
 * minute, and how to work out which lane or day sits under the pointer; everything else —
 * the threshold, the snapping, the live validity check, the optimistic write, the undo — is
 * shared so the two can't drift into behaving differently.
 *
 * The rules themselves live in `drag-rules.ts` and are pure. This file is the plumbing.
 */

export interface DropZone {
  /** Day board: the resource whose lane the pointer is over. */
  resourceId?: number | null;
  /** Day board: true when that lane is the catch-all "Unassigned / Other" row. */
  leftover?: boolean;
  /** Week board: the calendar day column the pointer is over, as `yyyy-MM-dd`. */
  dayKey?: string;
}

export interface DragGeometry {
  /** Which screen axis time runs along. */
  axis: "x" | "y";
  /** Pixels per minute along that axis. */
  pxPerMin: number;
  /**
   * The scrolling ancestor, so a drag can pull the board along with it.
   *
   * A ref rather than the element: the geometry object is built during render, when the
   * grid's own ref is still empty on the first pass, and a drag started later has to see
   * the element that eventually mounted.
   */
  scrollRef?: React.RefObject<HTMLElement | null>;
  /** Resolve the lane/day under a pointer position. Omit when the board has one drop zone. */
  hitTest?: (clientX: number, clientY: number) => DropZone | null;
}

export interface ActiveDrag {
  reservation: Reservation;
  mode: DragMode;
  /** Where the block currently sits under the cursor. */
  start: Date;
  end: Date;
  /** The resource it would land on (unchanged unless the pointer crossed lanes). */
  resourceId: number | null;
  /** The proposed slot, formatted on the board's clock — what the live callout reads. */
  label: string;
  /** Non-null when the current position can't be committed — shown live on the block. */
  reason: string | null;
  /** False until the pointer has travelled far enough to be a drag rather than a click. */
  moved: boolean;
  /**
   * Viewport point the live callout hangs off: the cursor during a pointer drag, the
   * focused block during a keyboard nudge. The callout is drawn at the top of the document
   * rather than inside a lane, so it needs a coordinate rather than a DOM parent.
   */
  anchor: { x: number; y: number } | null;
}

/** How far the pointer must travel before a press stops being a click. */
const DRAG_THRESHOLD_PX = 4;
/**
 * How long the "that pointerup was a drop, not a click" flag survives.
 *
 * A drop that lands somewhere with no click handler never spends the flag, and a stale one
 * would swallow the user's *next* click on a completely different block. Clearing it on a
 * timer is the reliable way round that: `pointerup` and `click` are separate tasks whose
 * ordering against a zero-delay timer isn't guaranteed, so the window has to be long enough
 * to outlast the click and short enough to be gone before the next deliberate one.
 */
const CLICK_SWALLOW_MS = 250;
/** How close to the edge of the scroller before the board starts following. */
const EDGE_ZONE_PX = 56;
const EDGE_SPEED_PX = 14;
/** Keyboard nudges batch into one PATCH — arrow keys shouldn't be one request each. */
const KEY_COMMIT_DELAY_MS = 800;

interface PointerSession {
  reservation: Reservation;
  mode: DragMode;
  geom: DragGeometry;
  originX: number;
  originY: number;
  scrollOrigin: number;
  pointerId: number;
}

export function useScheduleDrag(args: {
  zone: string;
  /** Everything currently on the board — the conflict check reads these. */
  reservations: Reservation[];
  /** The lanes on offer, for resolving a cross-lane drop to a real resource. */
  resources: Resource[];
  roles: Role[];
  orgUserId: number | null;
  /**
   * Whether a rostered person is grounded. The board has the roster for its Personnel
   * filter; a reservation's own personnel don't carry the flag.
   */
  groundedCrew?: GroundedLookup;
  /** Pending slot-offer soft holds painted on the board (resource busy). */
  slotOfferHolds?: SlotOfferHold[];
}) {
  const { zone, reservations, resources, roles, orgUserId, groundedCrew, slotOfferHolds } = args;
  const qc = useQueryClient();
  const update = useUpdateReservation();

  const [active, setActive] = React.useState<ActiveDrag | null>(null);
  const [pendingId, setPendingId] = React.useState<number | null>(null);

  //Refs mirror the state the window-level pointer handlers need: those listeners are bound
  //once per drag and would otherwise close over the first render's values.
  const sessionRef = React.useRef<PointerSession | null>(null);
  const activeRef = React.useRef<ActiveDrag | null>(null);
  activeRef.current = active;
  const dataRef = React.useRef({ reservations, resources, zone, groundedCrew, slotOfferHolds });
  dataRef.current = { reservations, resources, zone, groundedCrew, slotOfferHolds };
  const edgeRef = React.useRef(0);
  const rafRef = React.useRef(0);
  /** Tears down the current gesture's window listeners. Null when no drag is in progress. */
  const detachRef = React.useRef<(() => void) | null>(null);
  //Set the instant a drag ends so the click that follows pointerup can be swallowed —
  //otherwise every drop would also open the detail sheet.
  const swallowClickRef = React.useRef(false);
  const swallowTimerRef = React.useRef(0);
  const keyTimerRef = React.useRef(0);

  const swallowNextClick = React.useCallback(() => {
    swallowClickRef.current = true;
    window.clearTimeout(swallowTimerRef.current);
    swallowTimerRef.current = window.setTimeout(() => {
      swallowClickRef.current = false;
    }, CLICK_SWALLOW_MS);
  }, []);

  const abilityFor = React.useCallback(
    (r: Reservation): DragAbility => dragAbility(r, roles, orgUserId, new Date(), groundedCrew),
    [roles, orgUserId, groundedCrew]
  );

  // ── cache writes ───────────────────────────────────────────────────────────

  /**
   * Move the block immediately, everywhere it's drawn.
   *
   * Patches every cached reservation list rather than one known key: the board holds one
   * entry per date range, the detail sheet holds a single row, and `/me` holds the member's
   * own list — all of which can be on screen at once, and a block that snaps back for half
   * a second while a request flies is exactly the jitter drag-and-drop is supposed to avoid.
   */
  const patchCaches = React.useCallback(
    (id: number, patch: Partial<Reservation>) => {
      qc.setQueriesData({ queryKey: ["reservations"] }, (old: unknown) => {
        if (Array.isArray(old)) {
          return (old as Reservation[]).map((row) => (row.id === id ? { ...row, ...patch } : row));
        }
        if (old && typeof old === "object" && (old as Reservation).id === id) {
          return { ...(old as Reservation), ...patch };
        }
        return old;
      });
    },
    [qc]
  );

  const applyMove = React.useCallback(
    async (
      r: Reservation,
      next: { start: Date; end: Date; resourceId: number | null },
      opts: { undoOf?: Reservation } = {}
    ) => {
      const targetResource =
        next.resourceId == null
          ? undefined
          : dataRef.current.resources.find((x) => x.id === next.resourceId) ?? r.resource;

      setPendingId(r.id);
      patchCaches(r.id, {
        start: next.start.toISOString(),
        end: next.end.toISOString(),
        ...(targetResource ? { resource: targetResource } : {}),
      });

      try {
        await update.mutateAsync({
          id: r.id,
          input: reservationToInput(r, next),
        });

        const when = `${formatDateInZone(next.start, zone)}, ${formatTimeRangeInZone(
          next.start,
          next.end,
          zone
        )}`;

        if (opts.undoOf) {
          toast.success(`Moved back to ${when}`);
          return;
        }

        toast.success(`${r.title} → ${when}`, {
          description: r.series
            ? "Only this occurrence moved; the rest of the repeat is unchanged."
            : undefined,
          action: {
            label: "Undo",
            onClick: () => {
              void applyMove(
                r,
                {
                  start: new Date(r.start),
                  end: new Date(r.end),
                  resourceId: r.resource?.id ?? null,
                },
                { undoOf: r }
              );
            },
          },
        });
      } catch (err) {
        //Put the board back to whatever the server actually holds — a failed move must not
        //leave the optimistic position sitting there looking committed.
        void qc.invalidateQueries({ queryKey: ["reservations"] });
        void qc.invalidateQueries({ queryKey: ["slot-offers"] });
        toast.error(
          err instanceof ApiError ? err.message : "Couldn't move the reservation — put back."
        );
      } finally {
        setPendingId(null);
      }
    },
    [patchCaches, qc, update, zone]
  );

  // ── shared drag maths ──────────────────────────────────────────────────────

  /** Recompute the proposed slot + validity for a delta and a drop zone. */
  const evaluate = React.useCallback(
    (
      r: Reservation,
      mode: DragMode,
      deltaMin: number,
      zoneHit: DropZone | null,
      moved: boolean,
      anchor: { x: number; y: number } | null
    ): ActiveDrag => {
      const d = dataRef.current;
      const next = proposeTimes({
        r,
        mode,
        deltaMin,
        zone: d.zone,
        //Only a whole-block move can change which day (week board) it lands on; dragging an
        //edge is a duration change and must stay anchored to its own day.
        targetDayKey: mode === "move" ? zoneHit?.dayKey ?? null : null,
      });

      const currentResourceId = r.resource?.id ?? null;
      const overLeftover = Boolean(zoneHit?.leftover);
      const targetResourceId =
        mode === "move" && zoneHit && "resourceId" in zoneHit
          ? zoneHit.resourceId ?? null
          : currentResourceId;
      const targetResource =
        targetResourceId == null
          ? null
          : d.resources.find((x) => x.id === targetResourceId) ?? r.resource ?? null;

      const check = validateDrop({
        r,
        next,
        targetResource,
        targetResourceId,
        overLeftoverRow: overLeftover && targetResourceId !== currentResourceId,
        others: d.reservations,
        slotOfferHolds: d.slotOfferHolds,
        zone: d.zone,
        groundedCrew: d.groundedCrew,
      });

      return {
        reservation: r,
        mode,
        start: next.start,
        end: next.end,
        resourceId: targetResourceId,
        label: formatTimeRangeInZone(next.start, next.end, d.zone),
        reason: check.ok ? null : check.reason,
        moved,
        anchor,
      };
    },
    []
  );

  const finish = React.useCallback(
    (d: ActiveDrag | null) => {
      setActive(null);
      activeRef.current = null;
      sessionRef.current = null;
      edgeRef.current = 0;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (!d || !d.moved) return;

      swallowNextClick();

      if (d.reason) {
        toast.error(d.reason);
        return;
      }
      if (isUnchanged(d.reservation, { start: d.start, end: d.end }, d.resourceId)) return;

      void applyMove(d.reservation, {
        start: d.start,
        end: d.end,
        resourceId: d.resourceId,
      });
    },
    [applyMove, swallowNextClick]
  );

  //`finish` closes over the mutation, so its identity changes as that mutation's state does.
  //The window listeners below are bound once per drag and must not be re-bound on every
  //pointermove, so they reach it through a ref instead of a dependency.
  const finishRef = React.useRef(finish);
  finishRef.current = finish;
  const swallowRef = React.useRef(swallowNextClick);
  swallowRef.current = swallowNextClick;

  // ── pointer drag ───────────────────────────────────────────────────────────

  /**
   * A press that becomes a drag on something that cannot move. Same path locked bookings
   * use: wait until the pointer actually travels, then say why, and swallow the click that
   * would otherwise open details.
   */
  const refuse = React.useCallback((e: React.PointerEvent, reason: string) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let explained = false;
    const watch = (ev: PointerEvent) => {
      if (explained || Math.hypot(ev.clientX - x0, ev.clientY - y0) <= DRAG_THRESHOLD_PX) return;
      explained = true;
      toast.info(reason);
    };
    const stop = () => {
      window.removeEventListener("pointermove", watch);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      //Armed on RELEASE, not on the first move: the flag is short-lived by design, and a
      //slow drag would outlive one armed when the pointer first travelled — leaving the
      //trailing click to open the details of a booking the user was trying to move.
      if (explained) swallowRef.current();
    };
    window.addEventListener("pointermove", watch);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }, []);

  const begin = React.useCallback(
    (e: React.PointerEvent, r: Reservation, mode: DragMode, geom: DragGeometry) => {
      if (e.button !== 0) return;
      const ability = abilityFor(r);
      const allowed =
        mode === "move" ? ability.move : mode === "resize-start" ? ability.resizeStart : ability.resizeEnd;

      if (!allowed) {
        //Refusing silently is what makes a board feel broken — so the refusal is explained
        //at the moment they try, not only to whoever thinks to hover.
        //
        //But only once they've actually TRIED to drag. A press that never moves is a click,
        //and answering "you can't move this" to someone who was opening the details would
        //be noise. So watch this one gesture: if it travels past the threshold, that was a
        //drag attempt — say why it went nowhere and eat the trailing click.
        if (!ability.reason) return;
        refuse(e, ability.reason);
        return;
      }
      //A booking already being written must not be dragged again on top of itself.
      if (pendingId === r.id) return;

      //Suppresses the text selection a drag would otherwise paint across the board — which
      //also suppresses focus, so it's moved onto the block explicitly: a dispatcher who
      //grabs a block and then reaches for the arrow keys has to land on the same block.
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).closest<HTMLElement>('[role="button"],button')?.focus();

      const scrollEl = geom.scrollRef?.current ?? null;
      const session: PointerSession = {
        reservation: r,
        mode,
        geom,
        originX: e.clientX,
        originY: e.clientY,
        scrollOrigin: scrollEl ? (geom.axis === "x" ? scrollEl.scrollLeft : scrollEl.scrollTop) : 0,
        pointerId: e.pointerId,
      };
      sessionRef.current = session;
      setActive({
        reservation: r,
        mode,
        start: new Date(r.start),
        end: new Date(r.end),
        resourceId: r.resource?.id ?? null,
        label: formatTimeRangeInZone(r.start, r.end, dataRef.current.zone),
        reason: null,
        moved: false,
        anchor: { x: e.clientX, y: e.clientY },
      });

      //Listeners are attached HERE, synchronously, rather than from an effect keyed on the
      //active drag. An effect only runs after React commits, so a gesture whose whole
      //down → move → up sequence lands in one task — a fast flick, or any automated input —
      //would finish before the listeners existed and the block would simply not move.
      const onMove = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;

        const el = s.geom.scrollRef?.current ?? null;
        const scrolled = el
          ? (s.geom.axis === "x" ? el.scrollLeft : el.scrollTop) - s.scrollOrigin
          : 0;

        const dx = ev.clientX - s.originX;
        const dy = ev.clientY - s.originY;
        const along = (s.geom.axis === "x" ? dx : dy) + scrolled;
        const travelled = Math.hypot(dx, dy);
        const moved = (activeRef.current?.moved ?? false) || travelled > DRAG_THRESHOLD_PX;

        const deltaMin = snapMinutes(along / s.geom.pxPerMin);
        const hit = s.geom.hitTest?.(ev.clientX, ev.clientY) ?? null;

        //Edge-follow: keep the pointer where it is and let the board scroll under it.
        if (el) {
          const box = el.getBoundingClientRect();
          const near = s.geom.axis === "x" ? ev.clientX : ev.clientY;
          const lo = s.geom.axis === "x" ? box.left : box.top;
          const hi = s.geom.axis === "x" ? box.right : box.bottom;
          edgeRef.current =
            near < lo + EDGE_ZONE_PX ? -EDGE_SPEED_PX : near > hi - EDGE_ZONE_PX ? EDGE_SPEED_PX : 0;
        }

        const next = evaluate(s.reservation, s.mode, deltaMin, hit, moved, {
          x: ev.clientX,
          y: ev.clientY,
        });
        //Mirrored into the ref immediately: pointerup can arrive in the same task as this
        //move, before React has re-rendered, and the drop must commit what the last move
        //computed rather than the previous frame's position.
        activeRef.current = next;
        setActive(next);
      };

      const detach = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        detachRef.current = null;
      };

      function onUp(ev: PointerEvent) {
        const s = sessionRef.current;
        if (s && ev.pointerId !== s.pointerId) return;
        detach();
        finishRef.current(activeRef.current);
      }

      function onCancel() {
        //Abandoning still has to eat the trailing click, or letting go after an Escape opens
        //the detail sheet for the booking you just decided not to move.
        if (activeRef.current?.moved) swallowRef.current();
        detach();
        sessionRef.current = null;
        edgeRef.current = 0;
        activeRef.current = null;
        setActive(null);
      }

      function onKey(ev: KeyboardEvent) {
        //Escape abandons the drag where it started, the way every other drag surface behaves.
        if (ev.key === "Escape") {
          ev.preventDefault();
          onCancel();
        }
      }

      const tick = () => {
        const s = sessionRef.current;
        const el = s?.geom.scrollRef?.current ?? null;
        if (el && edgeRef.current !== 0) {
          if (s!.geom.axis === "x") el.scrollLeft += edgeRef.current;
          else el.scrollTop += edgeRef.current;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      detachRef.current = detach;
      rafRef.current = requestAnimationFrame(tick);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
    },
    [abilityFor, evaluate, pendingId, refuse]
  );

  //Nothing else can reach these listeners, so unmounting mid-drag has to.
  React.useEffect(() => () => detachRef.current?.(), []);

  // ── keyboard ───────────────────────────────────────────────────────────────

  /**
   * Nudge a focused block by one slot without a mouse.
   *
   * Keeping this on the same preview + commit path as the pointer means the keyboard route
   * gets the same conflict check and the same explanation, rather than a second, quieter
   * set of rules. Presses accumulate into one PATCH so holding an arrow key doesn't fire a
   * request per repeat.
   */
  const nudge = React.useCallback(
    (r: Reservation, mode: DragMode, slots: number) => {
      const ability = abilityFor(r);
      const allowed =
        mode === "move" ? ability.move : mode === "resize-start" ? ability.resizeStart : ability.resizeEnd;
      if (!allowed) {
        if (ability.reason) toast.info(ability.reason);
        return;
      }
      if (pendingId === r.id) return;

      const prev = activeRef.current;
      //Accumulate against the live preview when one is already open for this block.
      const base =
        prev && prev.reservation.id === r.id && prev.mode === mode
          ? { ...prev.reservation, start: prev.start.toISOString(), end: prev.end.toISOString() }
          : r;

      //No cursor to hang the callout off, so it anchors under the block the caller is
      //stepping — which is the focused element, by construction.
      const focused = document.activeElement as HTMLElement | null;
      const box = focused?.getBoundingClientRect();
      const anchor = box && box.width > 0 ? { x: box.left + box.width / 2, y: box.bottom } : null;

      const stepped = evaluate(base, mode, slots * SLOT_MIN, null, true, anchor);
      //Report against the ORIGINAL row, so the eventual commit sends one change, not a chain.
      const draft: ActiveDrag = { ...stepped, reservation: r };
      setActive(draft);

      window.clearTimeout(keyTimerRef.current);
      keyTimerRef.current = window.setTimeout(() => {
        setActive(null);
        if (draft.reason) {
          toast.error(draft.reason);
          return;
        }
        if (isUnchanged(r, { start: draft.start, end: draft.end }, draft.resourceId)) return;
        void applyMove(r, { start: draft.start, end: draft.end, resourceId: draft.resourceId });
      }, KEY_COMMIT_DELAY_MS);
    },
    [abilityFor, applyMove, evaluate, pendingId]
  );

  React.useEffect(
    () => () => {
      window.clearTimeout(keyTimerRef.current);
      window.clearTimeout(swallowTimerRef.current);
    },
    []
  );

  // ── what the grids render ──────────────────────────────────────────────────

  /**
   * The reservation as it should currently be DRAWN — the live drag position while one is
   * in flight, otherwise the row itself. Substituting the whole object (rather than
   * patching geometry at the call site) is what lets a block cross lanes and day columns
   * mid-drag: the grids group and pack from these values, so it lands in the right row
   * without either grid knowing a drag is happening.
   */
  const previewOf = React.useCallback(
    (r: Reservation): Reservation => {
      const d = activeRef.current;
      if (!d || d.reservation.id !== r.id || !d.moved) return r;
      const resource =
        d.resourceId == null
          ? r.resource
          : dataRef.current.resources.find((x) => x.id === d.resourceId) ?? r.resource;
      return { ...r, start: d.start.toISOString(), end: d.end.toISOString(), resource };
    },
    []
  );

  /** True once, immediately after a real drag — lets a block swallow the trailing click. */
  const consumeClick = React.useCallback(() => {
    if (!swallowClickRef.current) return false;
    swallowClickRef.current = false;
    window.clearTimeout(swallowTimerRef.current);
    return true;
  }, []);

  return {
    active,
    pendingId,
    /** True while a drag is in progress or its write is in flight — pauses board refresh. */
    isBusy: active != null || pendingId != null,
    abilityFor,
    begin,
    refuse,
    nudge,
    previewOf,
    consumeClick,
  };
}

export type ScheduleDrag = ReturnType<typeof useScheduleDrag>;
