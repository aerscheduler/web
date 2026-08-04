import { CalendarCheck, GraduationCap, PlaneTakeoff, Receipt, Wrench } from "lucide-react";
import { useResourceReport, type ReportRange } from "@/features/queries";
import { DetailCard } from "@/components/detail/detail-page";
import {
  MetricRow,
  MetricTile,
  countValue,
  hoursValue,
  moneyValue,
} from "@/components/detail/metric-tile";
import { ActivityBars } from "@/components/detail/activity-bars";
import {
  seriesPoints,
  sumSeries,
  type DailyCount,
  type PaymentTotals,
} from "@/components/detail/metrics";

/**
 * How hard this tail has been working, and what it earned.
 *
 * The revenue tiles are separately gated: `/reports/resource/:id/countPending…`
 * is admin-only server-side while the utilization metrics go to dispatchers and
 * technicians too. `showMoney` is that line, and asking for money without it is
 * a 403 rather than an empty card.
 */
export function ResourceMetrics({
  resourceId,
  range,
  showMoney,
}: {
  resourceId: number;
  range: ReportRange | undefined;
  showMoney: boolean;
}) {
  const flightTime = useResourceReport<DailyCount[]>(resourceId, "countFlightTime", range);
  const completed = useResourceReport<DailyCount[]>(
    resourceId,
    "countCompletedReservations",
    range
  );
  const instruction = useResourceReport<number>(
    resourceId,
    "countInstructionTimeGiven",
    range
  );
  const squawks = useResourceReport<number>(resourceId, "countUnresolvedSquawks", undefined, {
    rangeRequired: false,
  });
  const payments = useResourceReport<PaymentTotals>(
    resourceId,
    "countPendingAndProcessedPayments",
    range,
    { enabled: showMoney }
  );

  const hours = sumSeries(flightTime.data);
  const flights = sumSeries(completed.data);
  const openSquawks = squawks.data;

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
        <MetricTile
          label="Instruction given"
          icon={GraduationCap}
          value={hoursValue(instruction.data)}
          hint="Dual time flown on this tail"
          loading={instruction.isPending}
          error={instruction.isError}
        />
        <MetricTile
          label="Open squawks"
          icon={Wrench}
          value={countValue(openSquawks)}
          hint={openSquawks === 0 ? "Nothing outstanding" : "Unresolved right now"}
          tone={typeof openSquawks === "number" && openSquawks > 0 ? "warning" : "default"}
          loading={squawks.isPending}
          error={squawks.isError}
        />
        {showMoney && (
          <>
            <MetricTile
              label="Collected"
              icon={Receipt}
              value={moneyValue(payments.data?.processed)}
              hint="Paid invoices on this tail"
              loading={payments.isPending}
              error={payments.isError}
            />
            <MetricTile
              label="Outstanding"
              icon={Receipt}
              value={moneyValue(payments.data?.pending)}
              hint="Billed, not yet paid"
              tone={(payments.data?.pending ?? 0) > 0 ? "warning" : "default"}
              loading={payments.isPending}
              error={payments.isError}
            />
          </>
        )}
      </MetricRow>

      <DetailCard
        title="Utilization"
        description="Hobbs hours per day. Gaps are days it didn't fly."
      >
        {flightTime.isError ? (
          <p className="py-1 text-[13px] text-muted-foreground">
            Couldn&apos;t load utilization.
          </p>
        ) : (
          <ActivityBars
            points={seriesPoints(flightTime.data)}
            formatValue={(count) => hoursValue(count)}
            emptyLabel="This aircraft didn't fly in this window."
          />
        )}
      </DetailCard>
    </div>
  );
}
