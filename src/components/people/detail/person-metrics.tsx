import { CalendarCheck, GraduationCap, PlaneTakeoff, Receipt, Wallet } from "lucide-react";
import type { Role } from "@/types/api";
import { useMemberInvoiceSummary, useOrgUserReport, type ReportRange } from "@/features/queries";
import { isInstructor, isRenter, isStudent } from "@/lib/permissions";
import { DetailCard } from "@/components/detail/detail-page";
import {
  MetricRow,
  MetricTile,
  countValue,
  hoursValue,
  moneyValue,
} from "@/components/detail/metric-tile";
import { ActivityBars } from "@/components/detail/activity-bars";
import { seriesPoints, sumSeries, type DailyCount } from "@/components/detail/metrics";

/**
 * The numbers at the top of someone's page.
 *
 * Which tiles appear follows THEIR roles, not the viewer's: an instructor's page
 * leads with hours taught, a student's with hours received. Everyone sees hours
 * flown and what they've been billed, because those two are what the question
 * "how's this person doing" almost always means.
 *
 * Mounted only when `access.metrics` is true — `/reports/orgUser/*` is
 * self-or-admin server-side, so a dispatcher never gets this far.
 */
export function PersonMetrics({
  orgUserId,
  subjectRoles,
  range,
  showMoney,
}: {
  orgUserId: number;
  /** The roles of the person being looked at. */
  subjectRoles: Role[];
  range: ReportRange | undefined;
  showMoney: boolean;
}) {
  const flightTime = useOrgUserReport<DailyCount[]>(orgUserId, "countFlightTime", range);
  const completed = useOrgUserReport<DailyCount[]>(
    orgUserId,
    "countCompletedReservations",
    range
  );
  const taught = useOrgUserReport<number>(orgUserId, "countInstructionTimeGiven", range, {
    enabled: isInstructor(subjectRoles),
  });
  const received = useOrgUserReport<number>(
    orgUserId,
    "countInstructionTimeReceived",
    range,
    { enabled: isStudent(subjectRoles) }
  );
  const money = useMemberInvoiceSummary(orgUserId, range, { enabled: showMoney });

  const hours = sumSeries(flightTime.data);
  const flights = sumSeries(completed.data);

  return (
    <div className="space-y-4">
      <MetricRow>
        <MetricTile
          label="Hours flown"
          icon={PlaneTakeoff}
          value={hoursValue(hours)}
          hint="Hobbs, closed-out flights"
          loading={flightTime.isPending}
          error={flightTime.isError}
        />
        <MetricTile
          label="Flights completed"
          icon={CalendarCheck}
          value={countValue(flights)}
          hint="Signed off in this window"
          loading={completed.isPending}
          error={completed.isError}
        />
        {isInstructor(subjectRoles) && (
          <MetricTile
            label="Instruction given"
            icon={GraduationCap}
            value={hoursValue(taught.data)}
            hint="Briefing + flight, taught"
            loading={taught.isPending}
            error={taught.isError}
          />
        )}
        {isStudent(subjectRoles) && (
          <MetricTile
            label="Instruction received"
            icon={GraduationCap}
            value={hoursValue(received.data)}
            hint="Dual time logged"
            loading={received.isPending}
            error={received.isError}
          />
        )}
        {showMoney && (
          <>
            <MetricTile
              label="Billed"
              icon={Receipt}
              value={moneyValue(money.data?.revenue)}
              hint={
                money.data
                  ? `${countValue(money.data.paidCount)} invoice${money.data.paidCount === 1 ? "" : "s"} paid`
                  : undefined
              }
              loading={money.isPending}
              error={money.isError}
            />
            <MetricTile
              label="Outstanding"
              icon={Wallet}
              value={moneyValue(money.data?.outstanding)}
              hint={
                money.data
                  ? `${countValue(money.data.outstandingCount)} unpaid`
                  : undefined
              }
              tone={(money.data?.outstanding ?? 0) > 0 ? "warning" : "default"}
              loading={money.isPending}
              error={money.isError}
            />
          </>
        )}
      </MetricRow>

      <DetailCard
        title="Flying activity"
        description={
          isRenter(subjectRoles) && !isStudent(subjectRoles)
            ? "Hobbs hours per day across the window."
            : "Hobbs hours per day — every closed-out flight they were on."
        }
      >
        {flightTime.isError ? (
          <p className="py-1 text-[13px] text-muted-foreground">
            Couldn&apos;t load flying activity.
          </p>
        ) : (
          <ActivityBars
            points={seriesPoints(flightTime.data)}
            formatValue={(count) => hoursValue(count)}
            emptyLabel="No flying in this window."
          />
        )}
      </DetailCard>
    </div>
  );
}
