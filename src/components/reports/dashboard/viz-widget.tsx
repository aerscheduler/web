/**
 * The built-in widget tiles.
 *
 * Everything else on the board is a cut of a report, run by the server in one
 * batch. These two are not, and the difference is the reason they exist as a
 * type rather than being bent into the registry:
 *
 *  • "Up next" is a list of individual bookings. It is not an aggregate of
 *    anything, and the useful thing to do with a row is open it, not count it.
 *  • "Needs attention" is a set of counts each taken over its OWN window. What
 *    is overdue is not a question about the period the board happens to be set
 *    to, which is exactly why it must not inherit the panel's range.
 *
 * So each draws itself from its own endpoint. The board only places them. That
 * also means they ignore the range and comparison pickers, deliberately, and
 * the tile header says so rather than printing a window they do not honour.
 */

import { addDays, endOfDay, format, isToday, parseISO, startOfDay } from "date-fns";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useReservations } from "@/features/queries";
import { useReportOverview, useReportTimeZone } from "@/features/reports";
import { rangeToIso, resolveRange } from "@/lib/report-format";
import { Skeleton } from "@/components/ui/skeleton";
import { AttentionStrip } from "./attention-strip";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { resourceLabel, type Reservation } from "@/types/api";
import type { ReportFilterInput, OverviewAttention } from "@/types/reports";
import type { WidgetKey } from "@/types/dashboard";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const RES_TONE: Record<string, string> = {
  dual: "bg-primary",
  instructor: "bg-primary",
  solo: "bg-[var(--success)]",
  ground: "bg-[var(--warning)]",
  sim: "bg-violet-500",
  maintenance: "bg-destructive",
};

export function VizWidget({
  widget,
  editing,
  onOpenReport,
}: {
  widget: WidgetKey;
  editing: boolean;
  onOpenReport: (
    reportId: string,
    filters: ReportFilterInput[] | undefined,
    range?: DateRange
  ) => void;
}) {
  return widget === "upcoming" ? (
    <UpcomingWidget editing={editing} />
  ) : (
    <AttentionWidget editing={editing} onOpenReport={onOpenReport} />
  );
}

/**
 * Needs attention, on the board.
 *
 * Reuses the strip rather than reimplementing it, at its compact density, which
 * is the one that fits a tile. `unstyled` drops the strip's own card, because
 * the tile already IS the card and nesting them draws a border inside a border.
 */
function AttentionWidget({
  editing,
  onOpenReport,
}: {
  editing: boolean;
  onOpenReport: (
    reportId: string,
    filters: ReportFilterInput[] | undefined,
    range?: DateRange
  ) => void;
}) {
  const timeZone = useReportTimeZone();
  // A formality: every item declares the window its own count was taken over
  // and opens the report on THAT. This is only what the endpoint requires.
  const range = rangeToIso(resolveRange("past30", timeZone), timeZone);
  const overview = useReportOverview(range, "none");

  const open = (item: OverviewAttention) =>
    onOpenReport(item.reportId, item.filters, {
      from: new Date(item.window.startDate),
      to: new Date(item.window.endDate),
    });

  return (
    <div className="h-full overflow-y-auto">
      <AttentionStrip
        items={overview.data?.attention ?? []}
        loading={overview.isLoading}
        density="compact"
        unstyled
        // In edit mode a click is placing the tile, not following a link.
        onOpen={editing ? () => {} : open}
      />
    </div>
  );
}

/**
 * Up next: today's remaining bookings, then the days after.
 *
 * Deliberately NOT "today" alone. At six in the evening a today-only panel is
 * empty, which is the moment somebody most wants to know what tomorrow's first
 * flight is. Today's rows lead and are labelled by time; later days carry their
 * date, so the two never read as the same list.
 */
function UpcomingWidget({ editing }: { editing: boolean }) {
  const now = new Date();
  const reservations = useReservations(
    startOfDay(now).toISOString(),
    endOfDay(addDays(now, 7)).toISOString()
  );

  const upcoming = [...(reservations.data ?? [])]
    .filter((r) => parseISO(r.end).getTime() >= now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));

  const detail = useReservationDetail(upcoming);

  if (reservations.isLoading) {
    return (
      <div className="space-y-3 py-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (upcoming.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <CalendarClock className="size-4" />
        </span>
        <div className="text-sm font-medium">Nothing booked</div>
        <div className="max-w-xs text-xs text-muted-foreground">
          Nothing on the schedule for the next seven days.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto">
        <ul className="divide-y divide-border">
          {upcoming.map((r) => (
            <UpcomingRow
              key={r.id}
              r={r}
              selected={detail.detail?.id === r.id && detail.open}
              onOpen={editing ? undefined : () => detail.openDetail(r)}
            />
          ))}
        </ul>
      </div>

      {/* The sheet lives with the widget, so a booking opens from the board the
          same way it opens from the schedule, rather than the board only being
          able to link somewhere else. */}
      <CancelReservationDialog {...detail.cancelDialog} />
      <ReservationDetailSheet
        reservation={detail.detail}
        open={detail.open}
        onOpenChange={detail.setOpen}
        onCancel={detail.cancelReservation}
        onEdit={detail.startEdit}
        onStep={detail.step}
      />
    </>
  );
}

function UpcomingRow({
  r,
  onOpen,
  selected,
}: {
  r: Reservation;
  onOpen?: () => void;
  selected?: boolean;
}) {
  const res = r.resource ? resourceLabel(r.resource) : null;
  const start = parseISO(r.start);
  const today = isToday(start);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className={cn(
          "flex w-full items-center gap-2.5 py-2 text-left transition-colors",
          onOpen && "hover:bg-muted/40",
          selected && "bg-muted/60"
        )}
      >
        <span
          className={`size-2 shrink-0 rounded-full ${RES_TONE[r.type] ?? "bg-muted-foreground"}`}
        />
        {/* Today is a time; anything else has to say which day, or "7:00 AM"
            three rows down reads as this morning. */}
        <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {today ? format(start, "h:mm a") : format(start, "EEE h:mm a")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{r.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {res ? `${res.name} · ` : ""}
            {r.type}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Shown by the tile when a widget is clear, so the tile is never just blank. */
export function WidgetAllClear({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-[var(--success)]" />
      {label}
    </div>
  );
}
