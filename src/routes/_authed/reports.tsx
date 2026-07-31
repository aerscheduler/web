import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileBarChart } from "lucide-react";
import { useReportCatalog } from "@/features/reports";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/reports")({
  beforeLoad: guardRoute("/reports"),
  component: ReportsPage,
});

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
 */
function ReportsPage() {
  const { organization } = useAuth();
  const catalog = useReportCatalog();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reports = catalog.data?.reports ?? [];
  const categories = catalog.data?.categories ?? [];

  // Open on the first report rather than an empty pane — the rail already shows
  // what else there is, so an empty state here would just be a wasted click.
  useEffect(() => {
    if (!selectedId && reports.length > 0) setSelectedId(reports[0].id);
  }, [reports, selectedId]);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

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
              fourteen reports down the side of a 375px screen is unusable. */}
          <div className="lg:hidden">
            <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a report" />
              </SelectTrigger>
              <SelectContent>
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

          <nav
            aria-label="Reports"
            className="hidden w-60 shrink-0 lg:block"
          >
            <ScrollArea className="max-h-[calc(100vh-12rem)]">
              <div className="space-y-4 pr-3">
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
                            onClick={() => setSelectedId(report.id)}
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
            {selected && <ReportView key={selected.id} report={selected} />}
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
