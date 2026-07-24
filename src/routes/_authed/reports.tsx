import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CalendarClock,
  GraduationCap,
  PlaneTakeoff,
  TowerControl,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useOrgReport, type ReportRange } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { ReportPayments, ReportPoint } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/states";
import { DateRangePicker, lastNDays } from "@/components/billing/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/reports")({
  component: ReportsPage,
});

function sumSeries(points: ReportPoint[] | undefined): number {
  return (points ?? []).reduce((s, p) => s + p.count, 0);
}

/** deci-hours → "12.3 h" */
function hours(deci: number | undefined): string {
  return `${((deci ?? 0) / 10).toFixed(1)} h`;
}

function ReportsPage() {
  const { organization } = useAuth();
  const [range, setRange] = useState<DateRange | undefined>(() => lastNDays(30));

  const startISO = range?.from ? startOfDay(range.from).toISOString() : undefined;
  const endISO = range?.to
    ? endOfDay(range.to).toISOString()
    : range?.from
      ? endOfDay(range.from).toISOString()
      : undefined;

  const reportRange: ReportRange | undefined =
    startISO && endISO ? { startDate: startISO, endDate: endISO } : undefined;

  const flightTime = useOrgReport<ReportPoint[]>("countFlightTime", reportRange);
  const instrGiven = useOrgReport<number>("countInstructionTimeGiven", reportRange);
  const instrRecv = useOrgReport<number>("countInstructionTimeReceived", reportRange);
  const scheduled = useOrgReport<ReportPoint[]>("countScheduledReservations", reportRange);
  const completed = useOrgReport<ReportPoint[]>("countCompletedReservations", reportRange);
  const payments = useOrgReport<ReportPayments>("countPendingAndProcessedPayments", reportRange);
  const activeMembers = useOrgReport<number>("countActiveOrgUsers", reportRange);
  const newMembers = useOrgReport<number>("countNewOrgUsers", reportRange);
  const squawks = useOrgReport<number>("countUnresolvedSquawks", undefined, { rangeRequired: false });
  const grounded = useOrgReport<number>("countGroundedResources", undefined, { rangeRequired: false });

  const flightHoursTotal = useMemo(() => sumSeries(flightTime.data), [flightTime.data]);

  if (!organization) {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Operational and financial insights for your school." />
        <Card className="p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Pick or join a school to see its reports."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="How the school is flying — over your selected window."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {/* Activity */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Flight time"
            value={hours(flightHoursTotal)}
            icon={PlaneTakeoff}
            accent="primary"
            hint="Hobbs hours flown"
            loading={flightTime.isLoading}
          />
          <StatCard
            label="Instruction given"
            value={hours(instrGiven.data)}
            icon={GraduationCap}
            hint="Briefed dual time"
            loading={instrGiven.isLoading}
          />
          <StatCard
            label="Instruction received"
            value={hours(instrRecv.data)}
            icon={GraduationCap}
            hint="Received by students"
            loading={instrRecv.isLoading}
          />
          <StatCard
            label="Scheduled flights"
            value={String(sumSeries(scheduled.data))}
            icon={CalendarClock}
            hint="Booked in window"
            loading={scheduled.isLoading}
          />
          <StatCard
            label="Completed flights"
            value={String(sumSeries(completed.data))}
            icon={CalendarCheck}
            accent="success"
            hint="Flown & closed out"
            loading={completed.isLoading}
          />
          <StatCard
            label="Active members"
            value={String(activeMembers.data ?? 0)}
            icon={Users}
            hint="Flew in window"
            loading={activeMembers.isLoading}
          />
        </div>
      </section>

      {/* Daily flight hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Flight hours by day</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyBars points={flightTime.data} loading={flightTime.isLoading} />
        </CardContent>
      </Card>

      {/* Money + roster + fleet */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Money &amp; fleet
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Collected"
            value={formatMoney(payments.data?.processed ?? 0, { cents: false })}
            icon={Wallet}
            accent="success"
            hint="Paid invoices"
            loading={payments.isLoading}
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(payments.data?.pending ?? 0, { cents: false })}
            icon={Wallet}
            accent="warning"
            hint="Unpaid invoices"
            loading={payments.isLoading}
          />
          <StatCard
            label="New members"
            value={String(newMembers.data ?? 0)}
            icon={UserPlus}
            hint="Joined in window"
            loading={newMembers.isLoading}
          />
          <StatCard
            label="Grounded aircraft"
            value={String(grounded.data ?? 0)}
            icon={TowerControl}
            accent={grounded.data ? "warning" : "primary"}
            hint="Currently down"
            loading={grounded.isLoading}
          />
          <StatCard
            label="Open squawks"
            value={String(squawks.data ?? 0)}
            icon={AlertTriangle}
            accent={squawks.data ? "warning" : "primary"}
            hint="Unresolved"
            loading={squawks.isLoading}
          />
        </div>
      </section>
    </div>
  );
}

/** A lightweight per-day bar chart of flight hours (count is deci-hours). */
function DailyBars({ points, loading }: { points: ReportPoint[] | undefined; loading: boolean }) {
  const data = points ?? [];
  const max = Math.max(1, ...data.map((p) => p.count));

  if (loading) {
    return <div className="h-40 animate-pulse rounded-md bg-muted" />;
  }
  if (data.length === 0 || data.every((p) => p.count === 0)) {
    return (
      <div className="grid h-40 place-items-center text-sm text-muted-foreground">
        No flight time in this window.
      </div>
    );
  }

  return (
    <div className="flex h-40 items-end gap-0.5 overflow-x-auto">
      {data.map((p) => {
        const h = Math.round((p.count / max) * 100);
        return (
          <div
            key={p.date}
            className="group relative flex min-w-[6px] flex-1 items-end"
            style={{ height: "100%" }}
            title={`${format(parseISO(p.date), "MMM d")} — ${(p.count / 10).toFixed(1)} h`}
          >
            <div
              className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(h, p.count > 0 ? 3 : 0)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
