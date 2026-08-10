import { format, parseISO } from "date-fns";
import { resourceLabel, type Reservation, type ReservationType } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BORDER_L_CLASS, TYPE_BADGE_CLASS, personnelSummary, typeLabel } from "./reservation-meta";

/** A reservation-type badge, tinted by the matching --res-* hue token. */
export function TypeBadge({ type, className }: { type: ReservationType; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TYPE_BADGE_CLASS[type], className)}>
      {typeLabel(type)}
    </Badge>
  );
}

/**
 * A member-facing reservation row: colored left border by type, time range,
 * resource name, a type badge and (optionally) a personnel summary.
 *
 * With `onOpen` it becomes a real button that opens the reservation's detail
 * sheet (the same one the dispatch board uses); without it, it's static.
 */
export function ReservationCard({
  r,
  showDate = false,
  onOpen,
  selected = false,
  className,
}: {
  r: Reservation;
  showDate?: boolean;
  onOpen?: (r: Reservation) => void;
  /** This card's record is open in the detail panel, worth marking, since the
   *  panel sits beside the list rather than over it. */
  selected?: boolean;
  className?: string;
}) {
  const start = parseISO(r.start);
  const end = parseISO(r.end);
  const res = r.resource ? resourceLabel(r.resource) : null;
  const people = personnelSummary(r);

  const cardClass = cn(
    "flex items-stretch gap-3 rounded-lg border border-l-4 border-border bg-card p-3",
    BORDER_L_CLASS[r.type],
    onOpen &&
      "w-full text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    // The type stripe already owns the left border, so selection takes the fill
    // and a ring rather than fighting it for the same edge.
    selected && "bg-accent ring-2 ring-primary hover:bg-accent",
    className
  );

  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">{r.title}</span>
        <TypeBadge type={r.type} className="shrink-0" />
      </div>
      <div className="mt-1 text-sm tabular-nums text-muted-foreground">
        {showDate && <span>{format(start, "EEE, MMM d")} · </span>}
        {format(start, "h:mm a")}, {format(end, "h:mm a")}
      </div>
      <div className="mt-0.5 truncate text-sm text-muted-foreground">
        {res ? res.name : "Unassigned"}
        {people ? ` · ${people}` : ""}
      </div>
    </div>
  );

  if (!onOpen) return <div className={cardClass}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onOpen(r)}
      aria-label={`View ${r.title}`}
      className={cardClass}
    >
      {body}
    </button>
  );
}
