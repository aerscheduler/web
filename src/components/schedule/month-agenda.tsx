import { format, isToday, parseISO } from "date-fns";
import type { Reservation } from "@/types/api";
import { AgendaRow } from "./agenda-row";
import type { BoardMarks } from "./board-filters";

type DayGroup = { date: Date; items: Reservation[] };

/**
 * Mobile month view: the visible range flattened into a vertical agenda,
 * grouped under sticky day headings. Only days with reservations appear.
 */
export function MonthAgenda({
  reservations,
  onView,
  onEdit,
  onCancel,
  matchedIds,
  selectedId,
  query,
}: {
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  /** Block-filter marking, non-matches dim, never disappear. See `board-filters.ts`. */
  matchedIds?: Set<number> | null;
  selectedId?: number | null;
  query?: string;
}) {
  const marks: BoardMarks = { matchedIds: matchedIds ?? null, query: query ?? "", selectedId };
  const sorted = [...reservations].sort((a, b) => a.start.localeCompare(b.start));
  const groups = new Map<string, DayGroup>();
  for (const r of sorted) {
    const date = parseISO(r.start);
    const key = format(date, "yyyy-MM-dd");
    const g = groups.get(key);
    if (g) g.items.push(r);
    else groups.set(key, { date, items: [r] });
  }

  if (groups.size === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        No reservations this month.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 divide-y divide-border overflow-auto">
      {[...groups.values()].map(({ date, items }) => (
        <div key={date.toISOString()} className="py-3">
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-card px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{format(date, "EEE, MMM d")}</span>
            {isToday(date) && <span className="text-primary">Today</span>}
          </div>
          <ul className="space-y-2 px-3">
            {items.map((r) => (
              <AgendaRow
                key={r.id}
                r={r}
                onView={onView}
                onEdit={onEdit}
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
