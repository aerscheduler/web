import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { endOfDay, startOfDay } from "date-fns";
import { lastNDays } from "@/components/billing/date-range-picker";

/**
 * The reporting window a record page's metrics are measured over.
 *
 * Boundaries are snapped to whole days — `startOfDay(from)` to `endOfDay(to)` —
 * because the picker hands back midnight for both ends, and an un-snapped `to`
 * silently excludes everything that happened on the last day you asked for. This
 * matches what Billing sends, so the same window means the same thing on both
 * screens.
 */
export function useDetailRange(defaultDays = 90) {
  const [range, setRange] = useState<DateRange | undefined>(() => lastNDays(defaultDays));

  /**
   * Always a real window, never undefined.
   *
   * Consumers pass this straight into queries whose `enabled` turns on it, and a
   * disabled React Query sits at `isPending` forever — so a caller that returned
   * undefined here would render a card that spins for good rather than an empty
   * one. The picker can legitimately be mid-selection (one click in, no `to`
   * yet) or cleared entirely; both fall back rather than going blank.
   */
  const window = useMemo(() => {
    const from = range?.from ?? lastNDays(defaultDays).from!;
    const to = range?.to ?? range?.from ?? new Date();
    return {
      startDate: startOfDay(from).toISOString(),
      endDate: endOfDay(to).toISOString(),
    };
  }, [range, defaultDays]);

  return { range, setRange, window };
}

export type DetailWindow = ReturnType<typeof useDetailRange>["window"];
