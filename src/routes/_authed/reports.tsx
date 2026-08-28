import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { Building2, FileBarChart } from "lucide-react";
import { useReportCatalog, useReportTimeZone } from "@/features/reports";
import { useReportsReadiness } from "@/features/onboarding";
import { hasEnoughData, ReportsWelcome } from "@/components/reports/welcome/reports-welcome";
import { guardRoute } from "@/lib/permissions";
import {
  REPORTS_FIXED_PANES,
  REPORTS_OVERVIEW,
  REPORTS_SCHEDULED,
} from "@/lib/reports-sections";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { EmptyState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { ReportView } from "@/components/reports/shell/report-view";
import { SchedulesPage } from "@/components/reports/shell/schedules-page";
import { Dashboard } from "@/components/reports/dashboard/dashboard";
import { DISCARD_DASHBOARD_EDITS } from "@/components/reports/dashboard/unsaved-prompt";
import { useConfirm } from "@/components/confirm-dialog";
import { resolveRange } from "@/lib/report-format";
import type { ReportFilterInput } from "@/types/reports";

export const Route = createFileRoute("/_authed/reports")({
  beforeLoad: guardRoute("/reports"),
  /**
   * Which pane the rail is on, kept in the URL.
   *
   * "Send me the link to the utilization report" is a sentence people say, and
   * while the selection lived in component state every link to this page meant
   * Overview and nothing else.
   *
   * The same key convention as the console's other rails: Settings runs off
   * `?tab=`, Maintenance off `?view=`, and in both the rail item's value IS the
   * search value. Absent still means Overview, so a plain /reports is unchanged.
   */
  validateSearch: (s: Record<string, unknown>): { report?: string } => ({
    report: typeof s.report === "string" ? s.report : undefined,
  }),
  component: ReportsPage,
});

/**
 * The two panes that are not reports, as `?report=` values.
 *
 * Readable names rather than the old `__overview__` sentinels, now that they are
 * in a URL somebody pastes. Neither may become an id in the server's report
 * registry: the rail's value is the search value, so a report called "overview"
 * would be a report nobody could open. Shared with the command palette via
 * `lib/reports-sections.ts`.
 */
const OVERVIEW = REPORTS_OVERVIEW;
/** Not a report. A list of what the school emails out, sitting with Overview
 *  above the categories for the same reason: it is about all of them. */
const SCHEDULES = REPORTS_SCHEDULED;

/**
 * Reports.
 *
 * A rail of what exists and one pane that renders whichever is selected. There
 * is deliberately no per-report page: every report is described by the server's
 * catalog and rendered by `ReportView`, so the report list grows without this
 * file changing.
 *
 * The catalog is already filtered to what this user may run, so a dispatcher
 * simply does not see a Financial section, there is nothing here to hide.
 *
 * Overview sits above the categories rather than inside one, because it is not a
 * report: it is the summary of all of them, and every figure on it opens the
 * report that produced it.
 */
function ReportsPage() {
  const { organization } = useAuth();
  const catalog = useReportCatalog();
  const confirm = useConfirm();
  const navigate = Route.useNavigate();
  const { report: requested } = Route.useSearch();

  // A school with nothing to report on gets shown what these dashboards WILL look
  // like, not an accurate board of zeros. `hasEnoughData` is the whole switch, so
  // this page goes back to normal on its own, see components/reports/welcome.
  const readiness = useReportsReadiness(!!organization);
  const [skippedWelcome, setSkippedWelcome] = useState(false);

  // Leaving Overview for a report is a state swap, not a navigation, so the
  // router's blocker never sees it, but it unmounts the dashboard and takes any
  // unsaved layout with it. The dashboard tells us when that would cost work.
  const [dashboardDirty, setDashboardDirty] = useState(false);

  /** True to carry on; false when they'd rather keep editing. */
  const mayLeaveOverview = async () =>
    !dashboardDirty || (await confirm(DISCARD_DASHBOARD_EDITS));

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

  /**
   * The pane in hand.
   *
   * An id this catalog does not hold falls back to Overview rather than to a
   * blank pane. A link to a financial report opened by a dispatcher is a report
   * that genuinely is not theirs, and the page they can see is the honest answer.
   *
   * Held as asked while the catalog is still loading, though: resolving it
   * against an empty list would drop a deep link on Overview for a moment and
   * then move it, which reads as the link having failed.
   */
  const selectedId = useMemo(() => {
    if (!requested || requested === OVERVIEW) return OVERVIEW;
    if (requested === SCHEDULES || catalog.isLoading) return requested;
    return reports.some((r) => r.id === requested) ? requested : OVERVIEW;
  }, [requested, catalog.isLoading, reports]);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  // Overview and Scheduled reports lead as an ungrouped run, above the category
  // headings: neither is a report, and both are about all of them.
  const sections = useMemo<RailSection[]>(
    () => [
      {
        items: REPORTS_FIXED_PANES.map((pane) => ({
          value: pane.value,
          label: pane.label,
          icon: pane.icon,
        })),
      },
      ...categories.map((category) => ({
        label: category.label,
        items: reports
          .filter((r) => r.category === category.key)
          .map((r) => ({ value: r.id, label: r.name })),
      })),
    ],
    [categories, reports]
  );

  /**
   * Move the rail, which now means navigating.
   *
   * `replace`, so working down a rail of twenty reports does not bury the page
   * you arrived from under twenty history entries. Back therefore still leaves
   * Reports, which is where the dashboard's unsaved-edits blocker is mounted.
   */
  const show = (id: string) => {
    void navigate({ search: (prev) => ({ ...prev, report: id }), replace: true });
  };

  const openReport = async (
    reportId: string,
    filters: ReportFilterInput[] | undefined,
    range?: DateRange
  ) => {
    if (!(await mayLeaveOverview())) return;
    // The window comes from the tile that was clicked, since tiles can each
    // carry their own, falling back to the page default when there isn't one.
    setLink({ reportId, filters, range: range ?? fallbackRange, nonce: Date.now() });
    show(reportId);
  };

  const pickFromRail = async (id: string) => {
    if (id !== selectedId && !(await mayLeaveOverview())) return;
    // Choosing a report from the rail is a fresh start, not a continuation of
    // whatever the last deep link asked.
    setLink(null);
    show(id);
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

  const showWelcome =
    !skippedWelcome && !readiness.loading && !catalog.isLoading && !hasEnoughData(readiness);

  if (showWelcome) {
    return (
      <TableView className="gap-5">
        <TableView.Header>
          <PageHeader title="Reports" subtitle="What you'll get, and what unlocks it." />
        </TableView.Header>
        <ReportsWelcome readiness={readiness} onSkip={() => setSkippedWelcome(true)} />
      </TableView>
    );
  }

  const seeded = link && link.reportId === selectedId ? link : null;

  return (
    // Full-height page: the header and the rail stay put and each pane scrolls
    // inside itself, so choosing a report never means scrolling back up to the
    // list. See `components/table-view.tsx`.
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Reports"
          subtitle="Build it how you want it, save it, and export it."
        />
      </TableView.Header>

      {catalog.isLoading ? (
        // An explicit height as well as flex-1: the box has no content, so below
        // md, where the page is no longer bounded, flex-1 alone measures zero
        // and the loading state is invisible.
        <div className="min-h-64 flex-1 animate-pulse rounded-lg bg-muted md:min-h-0" />
      ) : reports.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={FileBarChart}
            title="No reports available"
            body="Your roles don't give you access to any reports yet. An owner or admin can change that."
          />
        </Card>
      ) : (
        <div className={RAIL_ROW}>
          <SectionRail
            label="Reports"
            // The help docs photograph this rail once per role. One id for all
            // three: it is the same rail, and what differs is who is signed in.
            docShot="reports-rail"
            sections={sections}
            value={selectedId}
            onChange={pickFromRail}
            placeholder="Choose a report"
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selectedId === SCHEDULES ? (
              <SchedulesPage />
            ) : selectedId === OVERVIEW ? (
              <Dashboard onOpenReport={openReport} onDirtyChange={setDashboardDirty} />
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
    </TableView>
  );
}
