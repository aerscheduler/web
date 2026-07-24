import { format, parseISO } from "date-fns";
import { resourceLabel, type Reservation } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BORDER_L_CLASS, personnelNames, typeLabel } from "./meta";
import { ReservationMenu } from "./reservation-menu";

/** Mobile / narrow layout: a vertical agenda grouped by hour. */
export function AgendaList({
  reservations,
  onView,
  onCancel,
  onNoShow,
}: {
  reservations: Reservation[];
  onView: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  onNoShow: (r: Reservation) => void;
}) {
  const sorted = [...reservations].sort((a, b) => a.start.localeCompare(b.start));
  const groups = new Map<string, Reservation[]>();
  for (const r of sorted) {
    const key = format(parseISO(r.start), "h a");
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
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
                onCancel={onCancel}
                onNoShow={onNoShow}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AgendaRow({
  r,
  onView,
  onCancel,
  onNoShow,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  onNoShow: (r: Reservation) => void;
}) {
  const res = r.resource ? resourceLabel(r.resource) : null;
  const names = personnelNames(r);

  return (
    <li
      className={cn(
        "flex items-stretch gap-3 rounded-lg border border-l-4 border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent/40",
        BORDER_L_CLASS[r.type]
      )}
    >
      <button
        type="button"
        onClick={() => onView(r)}
        className="min-w-0 flex-1 text-left focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{r.title}</span>
          <Badge variant="outline" className="shrink-0">
            {typeLabel(r.type)}
          </Badge>
        </div>
        <div className="mt-1 text-sm tabular-nums text-muted-foreground">
          {format(parseISO(r.start), "h:mm a")} – {format(parseISO(r.end), "h:mm a")}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {res ? res.name : "Unassigned"}
          {names.length > 0 ? ` · ${names.slice(0, 2).join(", ")}` : ""}
          {names.length > 2 ? ` +${names.length - 2}` : ""}
        </div>
      </button>
      <div className="flex flex-col items-end justify-between">
        <ReservationMenu r={r} onView={onView} onCancel={onCancel} onNoShow={onNoShow} />
        {r.invoice &&
          (r.invoice.paidAt ? (
            <Badge variant="success">Paid</Badge>
          ) : (
            <Badge variant="warning">Unbilled</Badge>
          ))}
      </div>
    </li>
  );
}
