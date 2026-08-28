import { createFileRoute, redirect } from "@tanstack/react-router";
import { BadgeDollarSign, Building2, Users } from "lucide-react";
import { isDeveloperSync } from "@/lib/auth";
import { useOrgBillingTerms } from "@/features/queries";
import { DetailBack, RecordNotFound } from "@/components/detail/detail-page";
import { PageHeader } from "@/components/page-header";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { TableView } from "@/components/table-view";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OrgBillingTerms } from "@/components/developer/org-billing-terms";
import { OrgMembersTable } from "@/components/developer/org-members-table";
import { shortDate } from "@/components/developer/billing-terms-shared";

/**
 * One school, on its own route.
 *
 * Un-nested (`developer_`) so it is a full page rather than a pane inside the
 * developer rail: it has its own sections, and nesting would put a rail inside a rail.
 * The URL is `/developer/organizations/:orgId`, so it can be pasted into a ticket, and
 * browser Back works. `DetailBack` is an explicit link rather than history.back() for
 * the reason detail-page.tsx gives, a deep link is routinely the first page of a
 * session and there is no history to go back to.
 *
 * Billing terms is the first section because it is why this page exists, but the shape
 * is deliberately open: anything we currently answer by opening a psql shell against
 * one school belongs here as another rail entry.
 */
export const Route = createFileRoute("/_authed/developer_/organizations/$orgId")({
  beforeLoad: () => {
    if (!isDeveloperSync()) throw redirect({ to: "/me" });
  },
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: DeveloperOrgPage,
});

const SECTIONS: RailSection[] = [
  {
    label: "Commercial",
    items: [{ value: "billing-terms", label: "Billing terms", icon: BadgeDollarSign }],
  },
  {
    label: "The school",
    items: [{ value: "members", label: "People", icon: Users }],
  },
];

const DEFAULT_TAB = "billing-terms";

function DeveloperOrgPage() {
  const { orgId: orgIdParam } = Route.useParams();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  const id = Number.parseInt(orgIdParam, 10);
  const q = useOrgBillingTerms(Number.isFinite(id) ? id : null);

  const known = SECTIONS.flatMap((s) => s.items).map((i) => i.value);
  const active = search.tab && known.includes(search.tab) ? search.tab : DEFAULT_TAB;

  const pick = (tab: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab }), replace: true });
  };

  // `isLoading` rather than `isPending`: in React Query v5 `isPending` stays true for a
  // query that finished with nothing, so a skeleton keyed on it spins forever on a bad
  // id. Same trap the member page documents.
  if (q.isLoading) {
    return (
      <TableView className="gap-5">
        <TableView.Header>
          <DetailBack to="/developer" label="Developer" />
          <Skeleton className="h-8 w-64" />
        </TableView.Header>
        <div className={RAIL_ROW}>
          <div className="hidden w-60 shrink-0 flex-col gap-2 lg:flex">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-md" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </TableView>
    );
  }

  if (!Number.isFinite(id) || q.isError || !q.data) {
    return (
      <div className="space-y-4">
        <DetailBack to="/developer" label="Developer" />
        <RecordNotFound
          icon={Building2}
          title="Organization not found"
          body="That link doesn't point at a school. It may have been deleted."
          backTo="/developer"
          backLabel="Back to Developer"
        />
      </div>
    );
  }

  const { organization } = q.data;

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <DetailBack to="/developer" label="Developer" />
        <PageHeader
          title={organization.name}
          subtitle={`#${organization.id} · ${organization.code} · signed up ${shortDate(organization.createdAt)}`}
          actions={organization.isDemo ? <Badge variant="outline">Demo sandbox</Badge> : undefined}
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label={organization.name} sections={SECTIONS} value={active} onChange={pick} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {active === "billing-terms" && <OrgBillingTerms orgId={id} />}
          {active === "members" && <OrgMembersTable orgId={id} />}
        </div>
      </div>
    </TableView>
  );
}
