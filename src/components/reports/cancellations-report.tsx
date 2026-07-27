import { format, parseISO } from "date-fns";
import { CalendarX2, Clock, Percent } from "lucide-react";
import { useCancellationReport } from "@/features/queries";
import { cancelledForLabel, cancelledResourceLabel } from "@/types/api";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Why bookings were cancelled, and how often.
 *
 * The school asked for this and, until now, there was nothing to report on: the console
 * recorded the literal string "Cancelled from dispatch board" for every cancellation and
 * the app sent no reason at all. The fixed category on the cancel dialog is what makes
 * this countable; the free-text note is what makes each row worth reading.
 *
 * Two numbers do the work. **Rate** answers "is this a lot?" — 40 cancellations means
 * nothing until you know whether they flew 50 or 500. **Late** is the one with money
 * attached: a week's notice is a scheduling change, an hour's is a lost slot.
 */
export function CancellationsReport({
  startDate,
  endDate,
}: {
  startDate: string | undefined;
  endDate: string | undefined;
}) {
  const report = useCancellationReport(startDate ?? "", endDate ?? "");

  const summary = report.data?.summary;
  const rows = report.data?.cancellations ?? [];

  //Only the categories that actually happened, biggest first — a chart of eight bars
  //where six are zero buries the one that matters.
  const bars = (summary?.byCategory ?? [])
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const max = Math.max(1, ...bars.map((b) => b.count));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Cancellations
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Cancelled"
          value={String(summary?.total ?? 0)}
          icon={CalendarX2}
          accent={summary?.total ? "warning" : "primary"}
          hint="Bookings in window"
          loading={report.isLoading}
        />
        <StatCard
          label="Cancellation rate"
          value={`${Math.round((summary?.rate ?? 0) * 100)}%`}
          icon={Percent}
          hint={`of ${summary?.totalInWindow ?? 0} booked`}
          loading={report.isLoading}
        />
        <StatCard
          label="Short notice"
          value={String(summary?.late ?? 0)}
          icon={Clock}
          accent={summary?.late ? "warning" : "primary"}
          hint={`Under ${summary?.lateWithinHours ?? 24}h notice`}
          loading={report.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">By reason</CardTitle>
        </CardHeader>
        <CardContent>
          {report.isLoading ? (
            <div className="h-32 animate-pulse rounded-md bg-muted" />
          ) : bars.length === 0 ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Nothing was cancelled in this window.
            </div>
          ) : (
            <div className="space-y-2">
              {bars.map((bar) => (
                <div key={bar.value} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
                  <span className="truncate text-sm" title={bar.label}>
                    {bar.label}
                  </span>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max((bar.count / max) * 100, 4)}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {bar.count}
                    {bar.late > 0 && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-500">
                        {bar.late} late
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Every cancellation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report.isLoading ? (
            <div className="m-6 h-32 animate-pulse rounded-md bg-muted" />
          ) : rows.length === 0 ? (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              Nothing was cancelled in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Aircraft</th>
                    <th className="px-4 py-2 font-medium">For</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {format(parseISO(row.start), "MMM d, HH:mm")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {cancelledResourceLabel(row.resource)}
                      </td>
                      <td className="px-4 py-2">{cancelledForLabel(row)}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span>{row.categoryLabel}</span>
                          {row.isLate && (
                            <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                              Late
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[18rem] truncate px-4 py-2 text-muted-foreground">
                        {row.cancellationReason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
