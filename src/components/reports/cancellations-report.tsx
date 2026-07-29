import { CancellationsInsights } from "@/components/operations/cancellations-insights";

/** Cancellation summary on the Reports overview tab. */
export function CancellationsReport({
  startDate,
  endDate,
}: {
  startDate: string | undefined;
  endDate: string | undefined;
}) {
  return <CancellationsInsights startDate={startDate} endDate={endDate} />;
}
