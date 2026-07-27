import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  addDays,
  endOfDay,
  endOfWeek,
  format,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { CalendarClock, CalendarPlus, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { bookActionLabel } from "@/lib/permissions";
import { useUserReservations } from "@/features/queries";
import type { Reservation } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { CalendarGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReservationCard } from "@/components/me/reservation-card";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";

export const Route = createFileRoute("/_authed/me/schedule")({
  component: MySchedulePage,
});

type Range = "upcoming" | "week" | "past";

const RANGES: { value: Range; label: string }[] = [
  { value: "upcoming", label: "Upcoming 30 days" },
  { value: "week", label: "This week" },
  { value: "past", label: "Past 30 days" },
];

function rangeBounds(range: Range, now: Date): [string, string] {
  switch (range) {
    case "week":
      return [startOfWeek(now).toISOString(), endOfWeek(now).toISOString()];
    case "past":
      return [startOfDay(addDays(now, -30)).toISOString(), endOfDay(now).toISOString()];
    case "upcoming":
    default:
      return [startOfDay(now).toISOString(), endOfDay(addDays(now, 30)).toISOString()];
  }
}

function dayHeading(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEEE, MMMM d");
}

function MySchedulePage() {
  const { organization, userId, roles } = useAuth();
  const bookLabel = bookActionLabel(roles);
  // A technician's calendar holds maintenance, not flights.
  const maintenanceOnly = bookLabel === "Schedule maintenance";
  const [range, setRange] = React.useState<Range>("upcoming");

  const now = React.useMemo(() => new Date(), []);
  const [startISO, endISO] = rangeBounds(range, now);
  const q = useUserReservations(userId, startISO, endISO);

  const reservations = React.useMemo(() => q.data ?? [], [q.data]);
  const groups = React.useMemo(() => groupByDay(reservations), [reservations]);

  // Same detail sheet the dispatch board opens — cancel and the ramp-out /
  // ramp-in / close-out flow behave identically here.
  const { detail, open, setOpen, openDetail, cancelReservation, editing, setEditing, startEdit } =
    useReservationDetail(reservations);

  if (organization === null) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <Card>
          <EmptyState
            icon={UserRound}
            title="You're not in an organization yet"
            body="Accept an invite or ask your school's admin to add you, and your flights will show up here."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={
          maintenanceOnly
            ? "The maintenance you've scheduled."
            : "Your flights, ground and sim sessions."
        }
        actions={
          <Button asChild>
            <Link to="/me/book">
              <CalendarPlus className="size-4" /> Book
            </Link>
          </Button>
        }
      />

      <div
        role="group"
        aria-label="Schedule range"
        className="mb-4 inline-flex rounded-lg border border-border bg-card p-1"
      >
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              range === r.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        {q.isPending ? (
          <CalendarGridSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No flights on your schedule"
            body="Book one to get started."
            action={
              <Button asChild>
                <Link to="/me/book">
                  <CalendarPlus className="size-4" /> {bookLabel}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {groups.map(([key, items]) => (
              <section key={key} className="p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {dayHeading(parseISO(key))}
                </h2>
                <ul className="space-y-2">
                  {items.map((r) => (
                    <li key={r.id}>
                      <ReservationCard r={r} onOpen={openDetail} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={{ date: new Date(editing.start) }}
          editing={editing}
        />
      )}

      <ReservationDetailSheet
        reservation={detail}
        open={open}
        onOpenChange={setOpen}
        onCancel={cancelReservation}
        onEdit={startEdit}
      />
    </div>
  );
}

/** Group reservations into `[dayKeyISO, items]` buckets, ascending by time. */
function groupByDay(reservations: Reservation[]): [string, Reservation[]][] {
  const sorted = [...reservations].sort((a, b) => a.start.localeCompare(b.start));
  const map = new Map<string, Reservation[]>();
  for (const r of sorted) {
    const key = startOfDay(parseISO(r.start)).toISOString();
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()];
}
