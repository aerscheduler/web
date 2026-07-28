import { resourceLabel, type Reservation } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/lib/use-timezone";
import { BORDER_L_CLASS, personnelNames, typeLabel } from "./meta";
import { ReservationMenu } from "./reservation-menu";

/**
 * A single reservation row for the vertical agenda lists (mobile day view and
 * mobile month view). Shared so both agendas render identical cards.
 */
export function AgendaRow({
  r,
  onView,
  onEdit,
  onDuplicate,
  onCancel,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onDuplicate?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
}) {
  const tz = useTimeZone();
  const res = r.resource ? resourceLabel(r.resource) : null;
  const names = personnelNames(r);

  return (
    <li
      className={cn(
        "flex items-stretch gap-3 rounded-lg border border-l-4 border-border bg-card p-3 text-left transition-colors hover:bg-accent/40",
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
          {tz.range(r.start, r.end)}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {res ? res.name : "Unassigned"}
          {names.length > 0 ? ` · ${names.slice(0, 2).join(", ")}` : ""}
          {names.length > 2 ? ` +${names.length - 2}` : ""}
        </div>
      </button>
      <div className="flex flex-col items-end justify-between">
        <ReservationMenu
          r={r}
          onView={onView}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onCancel={onCancel}
        />
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
