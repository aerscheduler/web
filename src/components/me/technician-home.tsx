import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { ChevronRight, CircleCheck, Plus, Wrench } from "lucide-react";
import type { MaintenanceReminder, Squawk, WorkOrder } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, fixesAircraftOnly, isTechnician } from "@/lib/permissions";
import { useMaintenanceReminders, useSquawks, useWorkOrders } from "@/features/queries";
import { dueAmount, dueTone } from "@/lib/maintenance";
import { dateKeyInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import { workOrderAircraftName } from "@/lib/work-orders";
import { cn } from "@/lib/utils";
import { STAGE_GROUPS } from "@/components/maintenance/work-order-table";
import { WorkStatusIcon } from "@/components/maintenance/work-status-icon";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home for the person who works on the aircraft rather than flying them: their jobs, and what
 * the fleet owes. The phone has had this since the shop shipped (`home_my_day.dart`, the
 * technician persona, and `home_my_jobs.dart`); the console Home kept showing a technician a
 * pilot's day, with an account balance and currencies they have no use for.
 *
 * The persona rule is the phone's: a technician who also instructs, studies or rents keeps
 * their flying day (bookings, balance, currencies) and gets the shop work beside it; one who
 * only fixes aircraft gets the shop work instead.
 */
export function useTechnicianHome() {
  const { roles, orgUserId } = useAuth();
  const technician = isTechnician(roles);
  const jobsOn = technician && canOpenWorkOrders(roles) && orgUserId != null;

  // The jobs are their own door on the server (owners, admins, technicians), so a refusal there
  // costs Home only this card, never the bookings.
  const jobsQ = useWorkOrders(
    { state: "open", technicianOrgUserId: orgUserId ?? undefined },
    { enabled: jobsOn }
  );
  const squawksQ = useSquawks({ resolved: false }, { enabled: technician });
  // By the server's computed band, the same one the Inspections board filters on. Not `warned`,
  // which is when the email went out rather than whether anything is due.
  const remindersQ = useMaintenanceReminders(
    { resolved: false, status: ["overdue", "dueSoon"] },
    { enabled: technician }
  );

  const jobs = React.useMemo(() => inBoardOrder(jobsQ.data ?? []), [jobsQ.data]);
  const squawks = squawksQ.data ?? [];
  const reminders = remindersQ.data ?? [];

  return {
    /** Shows the shop half of Home at all. */
    technician,
    /** Only fixes aircraft: the shop half replaces the flying day. */
    techOnly: fixesAircraftOnly(roles),
    jobsOn,
    jobsQ,
    jobs,
    squawksQ,
    squawks,
    remindersQ,
    reminders,
  };
}

export type TechnicianHome = ReturnType<typeof useTechnicianHome>;

/** The open jobs in the order the job board reads them: in the hangar first, oldest first. */
function inBoardOrder(jobs: WorkOrder[]): WorkOrder[] {
  return STAGE_GROUPS.flatMap((g) =>
    jobs.filter((w) => g.statuses.includes(w.status)).sort((a, b) => a.number - b.number)
  );
}

const JOBS_SHOWN = 6;
const QUEUE_SHOWN = 6;

/** The header both cards share: the title, and the board behind it on the right. */
function CardHeading({ title, count, link }: { title: string; count?: number; link: React.ReactNode }) {
  return (
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>
        {title}
        {count != null && count > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{count}</span>}
      </CardTitle>
      {link}
    </CardHeader>
  );
}

const ROW = "flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/**
 * The open jobs this technician is on, each opening its job. The work they came in for, so it
 * leads Home for a technician who only fixes aircraft.
 */
export function MyJobsCard({ home, onNew }: { home: TechnicianHome; onNew: () => void }) {
  const { jobsQ, jobs } = home;
  // Late against the organization's own day: the promised date is a day at the airport, not in UTC.
  const tz = useTimeZone();
  const today = dateKeyInZone(new Date(), tz.zone);

  return (
    // min-w-0: a grid item is as wide as its widest unbroken line, so a long request pushed the
    // whole card past a phone's edge instead of truncating.
    <Card data-testid="home-my-jobs" className="min-w-0">
      <CardHeading
        title="My jobs"
        count={jobs.length}
        link={
          <Link
            to="/maintenance"
            search={{ view: "work-orders", assigned: "me" }}
            className="text-sm font-medium text-primary hover:underline"
          >
            Job board
          </Link>
        }
      />
      <CardContent className="pt-0">
        {jobsQ.isPending ? (
          <RowsSkeleton />
        ) : jobsQ.isError ? (
          <ErrorState error={jobsQ.error} onRetry={() => jobsQ.refetch()} />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No open jobs assigned to you"
            body="When a work order puts you on a job, it shows here until the aircraft goes home."
            docs="run-a-work-order"
            action={
              <Button variant="outline" onClick={onNew}>
                <Plus className="size-4" /> Open a work order
              </Button>
            }
          />
        ) : (
          <>
            <ul className="-mx-2 divide-y divide-border" aria-label="My jobs">
              {jobs.slice(0, JOBS_SHOWN).map((w) => (
                <JobRow key={w.id} job={w} today={today} />
              ))}
            </ul>
            {jobs.length > JOBS_SHOWN && (
              <Link
                to="/maintenance"
                search={{ view: "work-orders", assigned: "me" }}
                className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
              >
                See all {jobs.length}
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function JobRow({ job: w, today }: { job: WorkOrder; today: string }) {
  const stage = STAGE_GROUPS.find((g) => g.statuses.includes(w.status));
  const late = !!w.promisedOn && w.promisedOn < today;
  const grounded = w.aircraft.grounded === true || w.ownerRequest?.grounded === true;
  return (
    <li data-testid={`home-job-${w.id}`}>
      <Link to="/maintenance/work-orders/$workOrderId" params={{ workOrderId: String(w.id) }} className={ROW}>
        <WorkStatusIcon status={stage?.icon ?? "todo"} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[12px] text-muted-foreground">{w.label}</span>
            <span className="font-mono font-medium">{workOrderAircraftName(w)}</span>
            <span className="text-sm text-muted-foreground">{w.statusLabel}</span>
            {grounded && <span className="text-sm font-medium text-warning">Grounded</span>}
          </div>
          <p className="truncate text-sm">{w.complaint || "No request written"}</p>
        </div>
        {w.promisedOn && (
          <span className={cn("shrink-0 pt-0.5 text-xs tabular-nums", late ? "font-medium text-warning" : "text-muted-foreground")}>
            {late ? "Late, " : ""}
            {format(parseISO(w.promisedOn), "MMM d")}
          </span>
        )}
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

type QueueEntry =
  | { kind: "inspection"; rank: number; order: number; r: MaintenanceReminder }
  | { kind: "squawk"; rank: number; order: number; s: Squawk };

/**
 * The phone's queue order: overdue inspections, then squawks that ground an aircraft, then
 * squawks nobody has looked at yet, then inspections coming due, then the rest.
 */
export function maintenanceQueue(squawks: Squawk[], reminders: MaintenanceReminder[]): QueueEntry[] {
  const entries: QueueEntry[] = [
    ...reminders.map((r) => ({
      kind: "inspection" as const,
      rank: r.due?.status === "overdue" ? 0 : 3,
      order: r.due?.urgency ?? Number.MAX_SAFE_INTEGER,
      r,
    })),
    ...squawks.map((s) => ({
      kind: "squawk" as const,
      rank: s.grounding ? 1 : s.verifiedAt == null ? 2 : 4,
      // Newest first within a rank: the one just written up is the one somebody is asking about.
      order: -Date.parse(s.reportedAt ?? s.createdAt),
      s,
    })),
  ];
  // Ties by name, as the Inspections board breaks them: every overdue item can share urgency 0.
  const name = (e: QueueEntry) => (e.kind === "inspection" ? (e.r.due?.name ?? e.r.template?.name ?? "") : (e.s.title ?? ""));
  return entries.sort(
    (a, b) => a.rank - b.rank || a.order - b.order || name(a).localeCompare(name(b), undefined, { numeric: true })
  );
}

/** Open squawks and inspections coming due, worst first, each opening its record. */
export function MaintenanceQueueCard({ home, onLogSquawk }: { home: TechnicianHome; onLogSquawk: () => void }) {
  const { squawksQ, remindersQ, squawks, reminders } = home;
  const queue = React.useMemo(() => maintenanceQueue(squawks, reminders), [squawks, reminders]);
  const loading = squawksQ.isPending || remindersQ.isPending;
  const failed = squawksQ.isError ? squawksQ : remindersQ.isError ? remindersQ : null;

  return (
    <Card data-testid="home-maintenance-queue" className="min-w-0">
      <CardHeading
        title="Maintenance queue"
        count={queue.length}
        link={
          <Link to="/maintenance" search={{ view: "open" }} className="text-sm font-medium text-primary hover:underline">
            Maintenance
          </Link>
        }
      />
      <CardContent className="pt-0">
        {loading ? (
          <RowsSkeleton />
        ) : failed ? (
          <ErrorState error={failed.error} onRetry={() => failed.refetch()} />
        ) : queue.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title="Nothing waiting"
            body="No open squawks, and no inspection overdue or coming due."
            action={
              <Button variant="outline" onClick={onLogSquawk}>
                <Plus className="size-4" /> Log a squawk
              </Button>
            }
          />
        ) : (
          <>
            <ul className="-mx-2 divide-y divide-border" aria-label="Maintenance queue">
              {queue.slice(0, QUEUE_SHOWN).map((e) =>
                e.kind === "squawk" ? <SquawkRow key={`s-${e.s.id}`} s={e.s} /> : <InspectionRow key={`r-${e.r.id}`} r={e.r} />
              )}
            </ul>
            {queue.length > QUEUE_SHOWN && (
              <Link
                to="/maintenance"
                search={{ view: "open" }}
                className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
              >
                See all {queue.length}
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A squawk as the board words it: the title, then where it stands and the tail. */
function SquawkRow({ s }: { s: Squawk }) {
  const lead = s.grounding ? "Grounding" : s.verifiedAt ? "Verified" : "Open";
  const reported = s.reportedAt ?? s.createdAt;
  return (
    <li data-testid={`home-squawk-${s.id}`}>
      <Link to="/maintenance/squawks/$squawkId" params={{ squawkId: String(s.id) }} className={ROW}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{s.title || "Squawk"}</p>
          <p className="text-sm text-muted-foreground">
            <span className={cn(s.grounding || !s.verifiedAt ? "font-medium text-warning" : undefined)}>{lead}</span>
            {s.resource && <> · {resourceLabel(s.resource).name}</>}
          </p>
        </div>
        {reported && <span className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{format(parseISO(reported), "MMM d")}</span>}
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function InspectionRow({ r }: { r: MaintenanceReminder }) {
  const overdue = r.due?.status === "overdue";
  const tone = dueTone(r.due);
  return (
    <li data-testid={`home-inspection-${r.id}`}>
      <Link to="/maintenance/inspections/$inspectionId" params={{ inspectionId: String(r.id) }} className={ROW}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.due?.name ?? r.template?.name ?? "Inspection"}</p>
          <p className="text-sm text-muted-foreground">
            <span className={cn("font-medium", overdue ? "text-destructive" : "text-warning")}>{overdue ? "Overdue" : "Due soon"}</span>
            {r.resource && <> · {resourceLabel(r.resource).name}</>}
            {r.work && <> · {r.work.status === "inProgress" ? "In the shop" : "Booked in"} on {r.work.job.label}</>}
          </p>
        </div>
        <span className={cn("shrink-0 pt-0.5 text-xs tabular-nums", tone === "danger" ? "font-medium text-destructive" : "text-muted-foreground")}>
          {dueAmount(r.due)}
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
