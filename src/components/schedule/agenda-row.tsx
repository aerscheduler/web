import { resourceLabel, type Reservation } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTimeZone } from "@/lib/use-timezone";
import { highlightMatch } from "@/lib/highlight-match";
import { BORDER_L_CLASS, personnelNames, typeLabel } from "./meta";
import { ReservationMenu } from "./reservation-menu";
import { billingStatus, dimClass, selectedClass, type BoardMarks } from "./board-filters";

const NO_MARKS: BoardMarks = { matchedIds: null, query: "" };

/**
 * A single reservation row for the vertical agenda lists (mobile day view and
 * mobile month view). Shared so both agendas render identical cards.
 */
export function AgendaRow({
  r,
  onView,
  onEdit,
  onCancel,
  marks = NO_MARKS,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  onEdit?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  /** Block-filter marking. Defaults to "nothing filtered" for the member-facing lists. */
  marks?: BoardMarks;
}) {
  const tz = useTimeZone();
  const res = r.resource ? resourceLabel(r.resource) : null;
  const names = personnelNames(r);

  return (
    <li
      className={cn(
        "flex items-stretch gap-3 rounded-lg border border-l-4 border-border bg-card p-3 text-left transition-colors hover:bg-accent/40",
        BORDER_L_CLASS[r.type],
        dimClass(marks, r.id),
        selectedClass(marks, r.id)
      )}
    >
      <button
        type="button"
        onClick={() => onView(r)}
        className="min-w-0 flex-1 text-left focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{highlightMatch(r.title, marks.query)}</span>
          <Badge variant="outline" className="shrink-0">
            {typeLabel(r.type)}
          </Badge>
        </div>
        <div className="mt-1 text-sm tabular-nums text-muted-foreground">
          {tz.range(r.start, r.end)}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {highlightMatch(
            [
              res ? res.name : "Unassigned",
              names.slice(0, 2).join(", "),
              names.length > 2 ? `+${names.length - 2}` : "",
            ]
              .filter(Boolean)
              .join(" · "),
            marks.query
          )}
        </div>
      </button>
      <div className="flex flex-col items-end justify-between">
        <ReservationMenu
          r={r}
          onView={onView}
          onEdit={onEdit}
          onCancel={onCancel}
        />
        {/* One badge for the booking even when it has an invoice per payer. "Unbilled"
            wins while anybody's share is outstanding, a class where three of four
            students have settled is still one the school is chasing. */}
        {(() => {
          const status = billingStatus(r);
          if (status === "notInvoiced" || status === "voided") return null;
          return status === "paid" ? (
            <Badge variant="success">Paid</Badge>
          ) : (
            <Badge variant="warning">Unbilled</Badge>
          );
        })()}
      </div>
    </li>
  );
}
