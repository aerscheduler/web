import type { NavigateOptions } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import type { ReportFilterInput } from "@/types/reports";

type NavigateFn = (options: NavigateOptions) => void;

/**
 * Where an Overview "Needs attention" row should land.
 *
 * Most items open the report behind the count. Booking requests are an
 * operational queue, so they open the desk sheet on the schedule instead.
 */
export function navigateFromAttention(
  navigate: NavigateFn,
  reportId: string,
  filters: ReportFilterInput[] | undefined,
  range?: DateRange,
  extra?: Omit<NavigateOptions, "to" | "search">
) {
  if (reportId === "booking-requests") {
    void navigate({ to: "/schedule", search: { panel: "booking-requests" }, ...extra });
    return;
  }

  void navigate({
    to: "/reports",
    // Reports route expects structured filter objects in search; cast for cross-route navigation.
    search: {
      report: reportId,
      from: range?.from?.toISOString(),
      to: (range?.to ?? range?.from)?.toISOString(),
      filters: filters?.length ? filters : undefined,
    } as never,
    ...extra,
  });
}
