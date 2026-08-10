import { parseISO } from "date-fns";
import type { Reservation } from "@/types/api";

export type PackedItem = { r: Reservation; track: number };

/**
 * Greedy interval partition (axis-agnostic): sort by start, then drop each
 * reservation onto the first track whose previous item has already ended.
 * Overlap is measured on absolute instants, so the same packing works for the
 * horizontal lane grid and the vertical week time-grid alike. Callers own the
 * px/percent math for `track`: this only decides how many parallel tracks a
 * cluster needs and which one each item lands in.
 */
export function packTracks(items: Reservation[]): { placed: PackedItem[]; tracks: number } {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const trackEnds: number[] = [];
  const placed: PackedItem[] = [];

  for (const r of sorted) {
    const s = parseISO(r.start).getTime();
    const e = parseISO(r.end).getTime();
    let track = trackEnds.findIndex((end) => end <= s);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(e);
    } else {
      trackEnds[track] = e;
    }
    placed.push({ r, track });
  }

  return { placed, tracks: Math.max(1, trackEnds.length) };
}
