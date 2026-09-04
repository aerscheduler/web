/**
 * Home.
 *
 * One surface: the report dashboard, and nothing above it but a greeting.
 *
 * It used to be two. A hand-built "Today" band of live figures and panels sat
 * on top of the board, and the two never reconciled: the band and the tiles
 * were different visual languages stacked on one page, the band's numbers had
 * no window label while the tiles all did, and the panels in it were bespoke
 * cards that could not be moved, resized, removed, or added to. The page read
 * as two dashboards that happened to share a scrollbar.
 *
 * So the panels became TILES. "Up next" and "Needs attention" are widget tiles
 * on the same grid as everything else, which means they are placed by the same
 * drag, saved in the same document, and can be taken off by anyone who does not
 * want them. See `viz-widget.tsx` for why they are a type rather than reports.
 *
 * The board is the same per-user document Reports shows, so a tile arranged in
 * either place is arranged in both. There is one board, not two.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ArrowUpRight, PlaneTakeoff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CardFlourish } from "@/components/ui/card-flourish";
import { Dashboard } from "@/components/reports/dashboard/dashboard";
import type { ReportFilterInput } from "@/types/reports";
import { guardRoute } from "@/lib/permissions";
import { navigateFromAttention } from "@/lib/attention-navigation";

export const Route = createFileRoute("/_authed/dashboard")({
  beforeLoad: guardRoute("/dashboard"),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, organization } = useAuth();
  const navigate = useNavigate();

  if (organization === null) return <NoOrg />;

  /**
   * A figure on the board opening the report behind it.
   *
   * On Reports this is a state swap; here it crosses a route, so the window and
   * filters travel in the URL. See the search contract on `/reports`: without
   * them the report opens on its own default window rather than the one the
   * number was counted over, and quietly disagrees with the tile that was
   * clicked. That matters most for the attention widget, whose rows each carry
   * their own window on purpose.
   */
  const openReport = (
    reportId: string,
    filters: ReportFilterInput[] | undefined,
    range?: DateRange
  ) => {
    navigateFromAttention(navigate, reportId, filters, range);
  };

  return (
    <div className="pb-8">
      <PageHeader
        title={`Good ${daypart()}, ${firstName(user?.name)}`}
        subtitle={`${organization?.name ?? "Your organization"} · ${format(new Date(), "EEEE, MMM d")}`}
      />

      {/* The dashboard IS the rest of onboarding. While setup is unfinished this
          leads the page; it retires itself for good once everything's done. */}
      <SetupChecklist className="mb-5" />

      <Dashboard variant="page" title="Your overview" onOpenReport={openReport} />
    </div>
  );
}

function NoOrg() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <Card className="relative isolate max-w-sm overflow-hidden">
        <CardFlourish />
        <CardContent className="py-8">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <PlaneTakeoff className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Let&rsquo;s get your operation flying</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account isn&rsquo;t attached to a flight school yet. Set one up in about two
            minutes, or ask an admin to invite you, then reload.
          </p>
          <Button asChild className="mt-6">
            <Link to="/onboarding">
              Set up your operation <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] ?? "there";
}
function daypart() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
