import { Download, Plane, Percent, Wallet } from "lucide-react";
import { useRevenueReport } from "@/features/queries";
import type { RevenueDimension, RevenueRow } from "@/types/api";
import { downloadCsv, reportFilename, type CsvColumn } from "@/lib/csv";
import { formatMoney } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Revenue, grouped by whichever dimension a tab asks for.
 *
 * Deliberately dimension-agnostic: "which aircraft earns most" and "which instructor
 * earns most" are the same table with a different heading, so this component takes a
 * `dimension` and the Reports page adds tabs. The server already returns all four
 * (aircraft, instructor, student, instruction type) — only the aircraft tab is surfaced
 * today, and turning the others on is a `<TabsTrigger>` plus a line here.
 *
 * BILLED vs COLLECTED are shown separately on purpose. An invoice raised in June and
 * paid in August is June's revenue and August's cash; collapsing them into one number is
 * how a report ends up disagreeing with the bank statement. Voided invoices are excluded
 * server-side — they carry a total and would otherwise inflate every row.
 */

const DIMENSION_META: Record<
  RevenueDimension,
  { heading: string; unit: string; hoursLabel: string; blank: string }
> = {
  aircraft: {
    heading: "Aircraft",
    unit: "aircraft",
    hoursLabel: "Hours flown",
    blank: "No invoices in this window.",
  },
  instructor: {
    heading: "Instructor",
    unit: "instructor",
    hoursLabel: "Hours",
    blank: "No invoices in this window.",
  },
  student: {
    heading: "Customer",
    unit: "customer",
    hoursLabel: "Hours",
    blank: "No invoices in this window.",
  },
  instructionType: {
    heading: "Lesson type",
    unit: "lesson type",
    hoursLabel: "Hours",
    blank: "No invoices in this window.",
  },
};

/** Deci-hours → "12.3". */
const hours = (deci: number) => (deci / 10).toFixed(1);

export function RevenueReport({
  dimension,
  startDate,
  endDate,
}: {
  dimension: RevenueDimension;
  startDate: string | undefined;
  endDate: string | undefined;
}) {
  const report = useRevenueReport(dimension, startDate, endDate);
  const meta = DIMENSION_META[dimension];

  const rows = report.data?.rows ?? [];
  const totals = report.data?.totals;
  const max = Math.max(1, ...rows.map((r) => r.billed));

  //Money leaves as DOLLARS, not "$1,234.00" — a formatted string can't be summed in a
  //spreadsheet, which is the first thing anyone does with an export.
  const columns: CsvColumn<RevenueRow>[] = [
    { header: meta.heading, value: (r) => r.label },
    { header: "Detail", value: (r) => r.sublabel ?? "" },
    { header: "Invoices", value: (r) => r.invoices },
    { header: "Billed (USD)", value: (r) => (r.billed / 100).toFixed(2) },
    { header: "Collected (USD)", value: (r) => (r.collected / 100).toFixed(2) },
    { header: "Outstanding (USD)", value: (r) => ((r.billed - r.collected) / 100).toFixed(2) },
    { header: "Hours", value: (r) => hours(r.resourceHours) },
  ];

  const exportCsv = () =>
    downloadCsv(reportFilename(`revenue-by-${dimension}`, startDate, endDate), columns, rows);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Billed"
          value={formatMoney(totals?.billed ?? 0, { cents: false })}
          icon={Wallet}
          accent="primary"
          hint="Invoiced in window"
          loading={report.isLoading}
        />
        <StatCard
          label="Collected"
          value={formatMoney(totals?.collected ?? 0, { cents: false })}
          icon={Wallet}
          accent="success"
          hint="Of that, actually paid"
          loading={report.isLoading}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney((totals?.billed ?? 0) - (totals?.collected ?? 0), { cents: false })}
          icon={Percent}
          accent={totals && totals.billed > totals.collected ? "warning" : "primary"}
          hint="Billed but unpaid"
          loading={report.isLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Revenue by {meta.unit}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={report.isLoading || rows.length === 0}
          >
            <Download className="size-4" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {report.isLoading ? (
            <div className="m-6 h-40 animate-pulse rounded-md bg-muted" />
          ) : rows.length === 0 ? (
            <div className="grid h-40 place-items-center text-sm text-muted-foreground">
              {meta.blank}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">{meta.heading}</th>
                    <th className="px-4 py-2 font-medium">Share</th>
                    <th className="px-4 py-2 text-right font-medium">Invoices</th>
                    <th className="px-4 py-2 text-right font-medium">{meta.hoursLabel}</th>
                    <th className="px-4 py-2 text-right font-medium">Collected</th>
                    <th className="px-4 py-2 text-right font-medium">Billed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {dimension === "aircraft" && (
                            <Plane className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.label}</div>
                            {row.sublabel && (
                              <div className="truncate text-xs text-muted-foreground">
                                {row.sublabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* A bar in the row rather than a separate chart: the ranking IS
                          the answer, and a second element to read would only slow it. */}
                      <td className="w-40 px-4 py-2">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max((row.billed / max) * 100, 2)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {row.invoices}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {hours(row.resourceHours)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {formatMoney(row.collected, { cents: false })}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {formatMoney(row.billed, { cents: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot className="border-t border-border">
                    <tr className="text-sm">
                      <td className="px-4 py-2 font-medium">Total</td>
                      <td />
                      <td className="px-4 py-2 text-right tabular-nums">{totals.invoices}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {hours(totals.resourceHours)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatMoney(totals.collected, { cents: false })}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {formatMoney(totals.billed, { cents: false })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Voided invoices are excluded. <strong>Billed</strong> is what was invoiced in this
        window; <strong>collected</strong> is what has actually been paid, which may have
        been invoiced earlier.
      </p>
    </div>
  );
}
