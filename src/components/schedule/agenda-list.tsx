import { format, parseISO } from "date-fns";
import type { Reservation } from "@/types/api";
import { AgendaRow } from "./agenda-row";

/** Mobile / narrow layout: a vertical agenda grouped by hour. */
export function AgendaList({
  reservations,
  onView,
  onEdit,
  onDuplicate,
  onCancel,
}: {
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onDuplicate?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
}) {
  const sorted = [...reservations].sort((a, b) => a.start.localeCompare(b.start));
  const groups = new Map<string, Reservation[]>();
  for (const r of sorted) {
    const key = format(parseISO(r.start), "h a");
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
    <div className="divide-y divide-border">
      {[...groups.entries()].map(([hour, items]) => (
        <div key={hour} className="py-3">
          <div className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
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
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
