import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  addDays,
  endOfDay,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useReservations } from "@/features/queries";
import { resourceLabel, type Reservation } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/schedule")({
  component: SchedulePage,
});

const TYPE_LABEL: Record<string, string> = {
  dual: "Dual",
  instructor: "Instruction",
  solo: "Solo",
  ground: "Ground",
  sim: "Sim",
  maintenance: "Maintenance",
};
const TYPE_TONE: Record<string, string> = {
  dual: "border-l-primary",
  instructor: "border-l-primary",
  solo: "border-l-[var(--success)]",
  ground: "border-l-[var(--warning)]",
  sim: "border-l-violet-500",
  maintenance: "border-l-destructive",
};

function SchedulePage() {
  const [day, setDay] = useState<Date>(() => new Date());
  const q = useReservations(startOfDay(day).toISOString(), endOfDay(day).toISOString());
  const items = [...(q.data ?? [])].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Dispatch board for the day"
        actions={
          <Button disabled title="Coming soon">
            <Plus className="size-4" /> New reservation
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card shadow-sm">
          <button
            aria-label="Previous day"
            onClick={() => setDay((d) => addDays(d, -1))}
            className="grid size-9 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-44 px-2 text-center text-sm font-medium">
            {isToday(day) ? "Today" : format(day, "EEE, MMM d")}
            <span className="ml-1.5 text-muted-foreground">{format(day, "yyyy")}</span>
          </div>
          <button
            aria-label="Next day"
            onClick={() => setDay((d) => addDays(d, 1))}
            className="grid size-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {!isSameDay(day, new Date()) && (
          <Button variant="outline" size="sm" onClick={() => setDay(new Date())}>
            Today
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          {q.data ? `${items.length} reservation${items.length === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Clear skies"
            body="No reservations scheduled for this day."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((r) => (
              <ReservationRow key={r.id} r={r} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ReservationRow({ r }: { r: Reservation }) {
  const res = r.resource ? resourceLabel(r.resource) : null;
  const p = r.personnel;
  const names = [
    ...(p?.instructors ?? []).map((x) => x.user?.name),
    ...(p?.students ?? []).map((x) => x.user?.name),
    ...(p?.renters ?? []).map((x) => x.user?.name),
    ...(p?.guests ?? []).map((g) => g.name),
  ].filter(Boolean);

  return (
    <li className={cn("flex items-stretch gap-4 border-l-2 py-3.5 pl-4 pr-4", TYPE_TONE[r.type] ?? "border-l-muted")}>
      <div className="w-24 shrink-0 pt-0.5 text-sm tabular-nums">
        <div className="font-medium">{format(parseISO(r.start), "h:mm a")}</div>
        <div className="text-xs text-muted-foreground">{format(parseISO(r.end), "h:mm a")}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{r.title}</span>
          <Badge variant="secondary">{TYPE_LABEL[r.type] ?? r.type}</Badge>
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {res ? res.name : "No resource"}
          {names.length > 0 ? ` · ${names.slice(0, 3).join(", ")}` : ""}
          {names.length > 3 ? ` +${names.length - 3}` : ""}
        </div>
      </div>
      {r.invoice && (
        <div className="hidden shrink-0 self-center sm:block">
          {r.invoice.paidAt ? (
            <Badge variant="success">Paid</Badge>
          ) : (
            <Badge variant="warning">Unbilled</Badge>
          )}
        </div>
      )}
    </li>
  );
}
