import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  PlaneTakeoff,
  ShieldCheck,
  UserX,
  Settings2,
} from "lucide-react";
import { usePlanes, useMembers, useCurrencyTypes } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canAccess, guardRoute } from "@/lib/permissions";
import { rolesOf, resourceLabel } from "@/types/api";
import type { Resource, OrganizationUser } from "@/types/api";
import { DocsHint } from "@/components/docs-hint";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTable, ListTableSkeleton, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { TableView } from "@/components/table-view";

export const Route = createFileRoute("/_authed/compliance")({
  beforeLoad: guardRoute("/compliance"),
  component: CompliancePage,
});

function CompliancePage() {
  const { roles } = useAuth();
  const planes = usePlanes({ grounded: true });
  const members = useMembers({ grounded: true });
  const currencyTypes = useCurrencyTypes();
  const canManageCurrencyRules = canAccess("/settings", roles);

  const groundedAircraft = planes.data ?? [];
  const groundedMembers = members.data ?? [];
  const noGoCount = groundedAircraft.length + groundedMembers.length;

  const loading = planes.isLoading || members.isLoading || currencyTypes.isLoading;
  const error = planes.error ?? members.error ?? currencyTypes.error;

  return (
    // Fills the page like the other list pages: the header, the counts and the tracked
    // currencies stay put, and the no-go list scrolls inside the space between them.
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Go / No-Go"
          subtitle="Who and what can't fly right now, grounded aircraft, grounded members, and the currencies you track."
          actions={
            canManageCurrencyRules ? (
              // Currency RULES are org configuration (scope, expiry, renewal), so they
              // live in Settings. This board consumes their status; it doesn't define them.
              <Button asChild variant="outline">
                <Link to="/settings" search={{ tab: "currencies" }}>
                  <Settings2 className="size-4" /> Manage currency rules
                </Link>
              </Button>
            ) : undefined
          }
        />

        <StatGrid>
          <StatCard
            label="No-go items"
            value={noGoCount}
            icon={AlertTriangle}
            accent={noGoCount > 0 ? "warning" : "success"}
            hint={noGoCount === 0 ? "All clear" : "Need attention"}
            loading={planes.isLoading || members.isLoading}
          />
          <StatCard
            label="Grounded aircraft"
            value={groundedAircraft.length}
            icon={PlaneTakeoff}
            accent={groundedAircraft.length ? "warning" : "success"}
            loading={planes.isLoading}
            to="/aircraft"
            search={{ grounded: true }}
          />
          <StatCard
            label="Grounded members"
            value={groundedMembers.length}
            icon={UserX}
            accent={groundedMembers.length ? "warning" : "success"}
            loading={members.isLoading}
            to="/people"
            search={{ grounded: true }}
          />
          <StatCard
            label="Currencies tracked"
            value={currencyTypes.data?.length ?? 0}
            icon={ShieldCheck}
            loading={currencyTypes.isLoading}
            {...(canManageCurrencyRules
              ? { to: "/settings" as const, search: { tab: "currencies" } }
              : {})}
          />
        </StatGrid>
      </TableView.Header>

      <TableView.Body className="flex flex-col">
        {loading ? (
          <ListTableSkeleton fill columns={NO_GO_COLUMNS} groups={2} rows={2} toolbar={false} className="min-h-0 flex-1" />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void planes.refetch();
              void members.refetch();
              void currencyTypes.refetch();
            }}
          />
        ) : noGoCount === 0 ? (
          <Card className="p-0">
            <EmptyState
              graphic="compliance-clear"
              title="Everything's cleared to fly"
              body="No grounded aircraft or members right now. Ground an aircraft from the Aircraft page, or a member from People, and it shows up here."
              docs="go-no-go-board"
            />
          </Card>
        ) : (
          <NoGoList aircraft={groundedAircraft} members={groundedMembers} />
        )}
      </TableView.Body>

      {/* currency types tracked */}
      <section className="shrink-0 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-muted-foreground">Currencies tracked</h2>
          <DocsHint topic="go-no-go-board" side="right" />
        </div>
        {currencyTypes.data && currencyTypes.data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currencyTypes.data.map((t) => (
              <Link
                key={t.id}
                to="/compliance/rules/$currencyTypeId"
                params={{ currencyTypeId: String(t.id) }}
                aria-label={`Open ${t.name} currency rule`}
                className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge key={t.id} variant="secondary" className="gap-1.5 py-1">
                  <ShieldCheck className="size-3.5" /> {t.name}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="p-0">
            <EmptyState
              graphic="compliance-setup"
              title="Track medicals, flight reviews & checkouts"
              body="Add the currencies your operation enforces so nobody flies out of currency."
              docs="currency-rule-details"
              action={
                canManageCurrencyRules ? (
                  <Button asChild size="sm">
                    <Link to="/settings" search={{ tab: "currencies" }}>
                      <Settings2 className="size-4" /> Set up currency rules
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}
      </section>
    </TableView>
  );
}

const NO_GO_COLUMNS: ListTableColumn[] = [
  // What was written when they were grounded: the reason is the row's whole point.
  { id: "reason", header: "Reason", width: "minmax(0,1.2fr)" },
];

/**
 * What can't fly, as one list: grounded aircraft, then grounded members. A ListTable since
 * 2026-09-30 (two columns of cards, which sawed against each other and each scrolled on its
 * own). Both groups are "grounded" in the product's one sense: off the line until somebody
 * returns them to service, whatever the reason.
 */
function NoGoList({ aircraft, members }: { aircraft: Resource[]; members: OrganizationUser[] }) {
  const navigate = useNavigate();
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const groups: ListTableGroup[] = [
    {
      id: "aircraft",
      label: "Grounded aircraft",
      marker: <PlaneTakeoff className="size-3.5 text-warning" aria-hidden />,
      count: aircraft.length,
      rows: [...aircraft]
        .sort((a, b) => byName(resourceLabel(a).name, resourceLabel(b).name))
        .map((r): ListTableRow => {
          const plane = r.type?.plane;
          const { name, kind } = resourceLabel(r);
          return {
            id: `aircraft-${r.id}`,
            testId: `no-go-aircraft-${r.id}`,
            label: `${name}, grounded`,
            // A real link (cmd-click, new tab), named as the old card was.
            title: (
              <Link to="/aircraft/$resourceId" params={{ resourceId: String(r.id) }} aria-label={`Open ${name}`} className="font-mono underline-offset-2 hover:underline">
                {name}
              </Link>
            ),
            subtitle: [plane?.make, plane?.model].filter(Boolean).join(" ") || kind,
            onOpen: () => void navigate({ to: "/aircraft/$resourceId", params: { resourceId: String(r.id) } }),
            cells: { reason: <ReasonText reason={plane?.groundedReason} /> },
          };
        }),
    },
    {
      id: "members",
      label: "Grounded members",
      marker: <UserX className="size-3.5 text-warning" aria-hidden />,
      count: members.length,
      rows: [...members]
        .sort((a, b) => byName(a.user?.name ?? `Member #${a.id}`, b.user?.name ?? `Member #${b.id}`))
        .map((m): ListTableRow => {
          const name = m.user?.name ?? `Member #${m.id}`;
          const roles = rolesOf(m);
          return {
            id: `member-${m.id}`,
            testId: `no-go-member-${m.id}`,
            label: `${name}, grounded`,
            leading: <WorkspaceUserAvatar person={{ id: m.id, name, profileImage: m.profileImage ?? null }} />,
            title: (
              <Link to="/people/$orgUserId" params={{ orgUserId: String(m.id) }} aria-label={`Open ${name}`} className="underline-offset-2 hover:underline">
                {name}
              </Link>
            ),
            subtitle: roles.length ? roles.map((r) => r[0]!.toUpperCase() + r.slice(1)).join(", ") : "Member",
            onOpen: () => void navigate({ to: "/people/$orgUserId", params: { orgUserId: String(m.id) } }),
            cells: { reason: <ReasonText reason={m.groundedReason} /> },
          };
        }),
    },
  ];
  return (
    <ListTable
      fill
      className="min-h-0 flex-1"
      label="Grounded aircraft and members"
      docShot="go-no-go-list"
      columns={NO_GO_COLUMNS}
      groups={groups}
      titleHeader="Who or what"
      showHeader
    />
  );
}

/**
 * System reasons written in the grounded member's own voice, said here in the third person:
 * the money sweep writes "You have unpaid invoices." (server `UNPAID_INVOICES_GROUNDED_REASON`),
 * which beside somebody else's name reads as addressed to the admin.
 */
const REASON_FOR_STAFF: Record<string, string> = {
  "You have unpaid invoices.": "Unpaid invoices",
};

/** The reason on file, or a quiet note that none was written. Same words as the person page. */
function ReasonText({ reason }: { reason: string | null | undefined }) {
  const text = reason?.trim();
  return text ? (
    <span title={text}>{REASON_FOR_STAFF[text] ?? text}</span>
  ) : (
    <span className="text-muted-foreground">No reason recorded</span>
  );
}
