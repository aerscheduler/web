import { wallClockInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import type { Reservation } from "@/types/api";
import { AgendaRow } from "./agenda-row";
import type { BoardMarks } from "./board-filters";

/** Mobile / narrow layout: a vertical agenda grouped by hour. */
/**
 * "9 AM" for the hour a booking falls in, on the airport's clock.
 *
 * Grouping and the heading have to be derived from the same clock, or a block files itself
 * under an hour its own label contradicts.
 */
function hourBucketLabel(instant: string, zone: string): string {
  const { hour } = wallClockInZone(instant, zone);
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${hour < 12 ? "AM" : "PM"}`;
}

export function AgendaList({
  reservations,
  onView,
  onEdit,
  onDuplicate,
  onCancel,
  matchedIds,
  query,
}: {
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onDuplicate?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  /** Block-filter marking — non-matches dim, never disappear. See `board-filters.ts`. */
  matchedIds?: Set<number> | null;
  query?: string;
}) {
  const marks: BoardMarks = { matchedIds: matchedIds ?? null, query: query ?? "" };
  const tz = useTimeZone();
  const sorted = [...reservations].sort((a, b) => a.start.localeCompare(b.start));
  const groups = new Map<string, Reservation[]>();
  for (const r of sorted) {
    //Hour buckets are the airport's hours; the heading and the block have to agree.
    const key = hourBucketLabel(r.start, tz.zone);
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  if (groups.size === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        No reservations in this range.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 divide-y divide-border overflow-auto">
      {[...groups.entries()].map(([hour, items]) => (
        <div key={hour} className="py-3">
          <div className="sticky top-0 z-10 bg-card px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
            {hour}
          </div>
          <ul className="space-y-2 px-3">
            {items.map((r) => (
              <AgendaRow
                key={r.id}
                r={r}
                onView={onView}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onCancel={onCancel}
                marks={marks}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
