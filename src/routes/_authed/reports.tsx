import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { Building2, FileBarChart, LayoutDashboard } from "lucide-react";
import { useReportCatalog, useReportTimeZone } from "@/features/reports";
import { guardRoute } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportView } from "@/components/reports/shell/report-view";
import { Dashboard } from "@/components/reports/dashboard/dashboard";
import { resolveRange } from "@/lib/report-format";
import type { ReportFilterInput } from "@/types/reports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/reports")({
  beforeLoad: guardRoute("/reports"),
  component: ReportsPage,
});

const OVERVIEW = "__overview__";

/**
 * Reports.
 *
 * A rail of what exists and one pane that renders whichever is selected. There
 * is deliberately no per-report page: every report is described by the server's
 * catalog and rendered by `ReportView`, so the report list grows without this
 * file changing.
 *
 * The catalog is already filtered to what this user may run, so a dispatcher
 * simply does not see a Financial section — there is nothing here to hide.
 *
 * Overview sits above the categories rather than inside one, because it is not a
 * report: it is the summary of all of them, and every figure on it opens the
 * report that produced it.
 */
function ReportsPage() {
  const { organization } = useAuth();
  const catalog = useReportCatalog();
  const [selectedId, setSelectedId] = useState<string>(OVERVIEW);

  // The dashboard owns its own window and comparison now (a panel carries them,
  // and each tile may override). This is only the fallback for a deep link that
  // arrives without one.
  const timeZone = useReportTimeZone();
  const fallbackRange = resolveRange("past30", timeZone);

  /**
   * A deep link from the Overview. The nonce is what forces `ReportView` to
   * remount, so the seeded filters become its initial state rather than having
   * to be pushed into a live component.
   */
  const [link, setLink] = useState<{
    reportId: string;
    filters?: ReportFilterInput[];
    range?: DateRange;
    nonce: number;
  } | null>(null);

  const reports = catalog.data?.reports ?? [];
  const categories = catalog.data?.categories ?? [];

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  const openReport = (
    reportId: string,
    filters: ReportFilterInput[] | undefined,
    range?: DateRange
  ) => {
    // The window comes from the tile that was clicked, since tiles can each
    // carry their own — falling back to the page default when there isn't one.
    setLink({ reportId, filters, range: range ?? fallbackRange, nonce: Date.now() });
    setSelectedId(reportId);
  };

  const pickFromRail = (id: string) => {
    // Choosing a report from the rail is a fresh start, not a continuation of
    // whatever the last deep link asked.
    setLink(null);
    setSelectedId(id);
  };

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

  const seeded = link && link.reportId === selectedId ? link : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Build it how you want it, save it, and export it."
      />

      {catalog.isLoading ? (
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      ) : reports.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={FileBarChart}
            title="No reports available"
            body="Your roles don't give you access to any reports yet. An owner or admin can change that."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* On a phone the rail becomes a single select — a two-level list of
              fifteen entries down the side of a 375px screen is unusable. */}
          <div className="lg:hidden">
            <Select value={selectedId} onValueChange={pickFromRail}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a report" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERVIEW}>Overview</SelectItem>
                {categories.map((category) => (
                  <SelectGroupForCategory
                    key={category.key}
                    label={category.label}
                    reports={reports.filter((r) => r.category === category.key)}
                  />
                ))}
              </SelectContent>
            </Select>
          </div>

          <nav aria-label="Reports" className="hidden w-60 shrink-0 lg:block">
            <ScrollArea className="max-h-[calc(100vh-12rem)]">
              <div className="space-y-4 pr-3">
                <button
                  type="button"
                  onClick={() => pickFromRail(OVERVIEW)}
                  aria-current={selectedId === OVERVIEW ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    selectedId === OVERVIEW
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <LayoutDashboard className="size-4 shrink-0" />
                  Overview
                </button>

                {categories.map((category) => (
                  <div key={category.key}>
                    <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {category.label}
                    </h2>
                    <div className="space-y-0.5">
                      {reports
                        .filter((r) => r.category === category.key)
                        .map((report) => (
                          <button
                            key={report.id}
                            type="button"
                            onClick={() => pickFromRail(report.id)}
                            aria-current={report.id === selectedId ? "page" : undefined}
                            className={cn(
                              "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                              report.id === selectedId
                                ? "bg-muted font-medium text-foreground"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            )}
                          >
                            {report.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </nav>

          <div className="min-w-0 flex-1">
            {selectedId === OVERVIEW ? (
              <Dashboard onOpenReport={openReport} />
            ) : (
              selected && (
                <ReportView
                  key={`${selected.id}:${seeded?.nonce ?? "plain"}`}
                  report={selected}
                  initialFilters={seeded?.filters}
                  initialRange={seeded?.range}
                  onPinned={() => pickFromRail(OVERVIEW)}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Radix Select has no nested grouping helper here, so render a label + items. */
function SelectGroupForCategory({
  label,
  reports,
}: {
  label: string;
  reports: { id: string; name: string }[];
}) {
  if (reports.length === 0) return null;
  return (
    <>
      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {reports.map((r) => (
        <SelectItem key={r.id} value={r.id}>
          {r.name}
        </SelectItem>
      ))}
    </>
  );
}
