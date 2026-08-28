import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Gift } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaging } from "@/lib/paging";
import { formatMonthly } from "@/lib/subscription";
import {
  useBillingTermsOverview,
  useDeveloperOrganizations,
  type OrgDirectoryRow,
} from "@/features/queries";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { MODELS, StateBadge, modelLabel, shortDate } from "@/components/developer/billing-terms-shared";

/**
 * Every school we have, as a real list.
 *
 * This replaced a numeric "open by organization id" box. That box was only usable by
 * somebody who already knew the id, which is nobody: support arrives holding an email
 * address or half a school's name. Searching happens on the server across name, code,
 * id AND the name or email of anybody in the school, so pasting the address a ticket
 * came from lands on the school it belongs to.
 *
 * Rows are a link to the school's own page rather than an expanding panel. The old tab
 * appended an editor to the bottom of the page, which put the thing you had just asked
 * for below the fold and gave you nothing to press to get back.
 */

const FACETS: FacetDef[] = [
  {
    kind: "select",
    key: "kind",
    label: "Type",
    allLabel: "All schools",
    options: [
      { value: "real", label: "Real schools" },
      { value: "demo", label: "Demo sandboxes" },
    ],
  },
  {
    kind: "select",
    key: "model",
    label: "Pricing",
    allLabel: "Any model",
    options: MODELS.map((m) => ({ value: m.value, label: m.label, hint: m.hint })),
  },
  {
    kind: "boolean",
    key: "blockedOnly",
    label: "Paywalled",
    trueLabel: "Blocked right now",
    neutralLabel: "Any status",
  },
];

/** What we are giving away, as a strip above the list. */
function Comped() {
  const overview = useBillingTermsOverview();
  if (overview.isLoading) return <Skeleton className="h-16 w-full" />;
  if (!overview.data) return null;

  const { comped } = overview.data;
  return (
    <div className="flex flex-wrap gap-6 rounded-lg border bg-muted/30 p-3 text-sm">
      <div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Gift className="size-3.5" />
          Comped monthly
        </div>
        <div className="text-lg font-medium tabular-nums">{formatMonthly(comped.cents)}</div>
      </div>
      <div>
        <div className="text-muted-foreground">Aircraft</div>
        <div className="text-lg font-medium tabular-nums">{comped.units}</div>
      </div>
      <div>
        <div className="text-muted-foreground">Schools</div>
        <div className="text-lg font-medium tabular-nums">{comped.orgs}</div>
      </div>
    </div>
  );
}

export function OrganizationsTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ListFilterValues>({});
  // Debounced so a search is one request per pause, not one per keystroke: this
  // endpoint prices every matched school, so a keystroke is not a cheap query.
  const q = useDebouncedValue(search, 250);

  const kind = typeof filters.kind === "string" ? filters.kind : undefined;
  const model = typeof filters.model === "string" ? filters.model : undefined;
  const blockedOnly = filters.blockedOnly === true;

  const paging = usePaging({ resetKey: JSON.stringify({ q, kind, model, blockedOnly }) });
  const list = useDeveloperOrganizations({
    q: q.trim() || undefined,
    kind,
    model,
    blockedOnly,
    limit: paging.query.limit,
    offset: paging.query.offset,
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;

  const open = (org: OrgDirectoryRow) =>
    void navigate({ to: "/developer/organizations/$orgId", params: { orgId: String(org.id) } });

  const columns = useMemo<ColumnDef<OrgDirectoryRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "School",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <span className="truncate">{row.original.name}</span>
              {row.original.isDemo && <Badge variant="outline">Demo</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              #{row.original.id} · {row.original.code}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StateBadge state={row.original.priced.state} />,
      },
      {
        id: "model",
        header: "Model",
        cell: ({ row }) => modelLabel(row.original.priced.model),
      },
      {
        id: "monthly",
        header: "Monthly",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMonthly(row.original.priced.monthlyCents)}</span>
        ),
      },
      {
        id: "fleet",
        header: "Aircraft",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.priced.billableUnits} of {row.original.aircraftCount}
          </span>
        ),
      },
      {
        id: "members",
        header: "People",
        cell: ({ row }) => <span className="tabular-nums">{row.original.memberCount}</span>,
      },
      {
        id: "freeUntil",
        header: "Free until",
        cell: ({ row }) => {
          const { freeUntil, freeUntilReason } = row.original.priced;
          if (!freeUntil) return <span className="text-muted-foreground">—</span>;
          return (
            <span>
              {shortDate(freeUntil)}
              {freeUntilReason ? (
                <span className="text-muted-foreground"> ({freeUntilReason})</span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "lastActive",
        header: "Last active",
        cell: ({ row }) =>
          row.original.lastActiveAt ? (
            new Date(row.original.lastActiveAt).toLocaleDateString()
          ) : (
            <span className="text-muted-foreground">never</span>
          ),
      },
    ],
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Comped />

      <ListSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search name, code, id, or anyone's email…"
        aria-label="Search organizations"
        facets={FACETS}
        filterValues={filters}
        onFilterChange={setFilters}
      />

      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : (
        <DataTable<OrgDirectoryRow>
          fill
          columns={columns}
          data={rows}
          paging={paging}
          total={total}
          loading={list.isFetching}
          onRowClick={open}
          emptyMessage={
            <EmptyState
              icon={Building2}
              title="No schools match"
              body="Search by name, join code, organization id, or the email of anybody in the school."
            />
          }
          mobileCard={(o) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{o.name}</span>
                <StateBadge state={o.priced.state} />
              </div>
              <div className="text-xs text-muted-foreground">
                #{o.id} · {o.code} · {o.memberCount} people · {o.aircraftCount} aircraft
              </div>
              <div className="text-sm tabular-nums">{formatMonthly(o.priced.monthlyCents)} / month</div>
            </div>
          )}
        />
      )}
    </div>
  );
}
