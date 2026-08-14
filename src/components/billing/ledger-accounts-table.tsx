import { useMemo, useState } from "react";
import { useTimeZone } from "@/lib/use-timezone";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, Wallet } from "lucide-react";
import { pageRows, useLedgerAccountsPage } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { asFacetStrings } from "@/lib/list-query-state";
import type { LedgerAccount } from "@/types/api";
import { StatCard, StatGrid } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

const STATUS_FACETS: FacetDef[] = [
  {
    kind: "select",
    key: "status",
    label: "Balance",
    allLabel: "All balances",
    multiple: true,
    options: [
      { value: "owing", label: "Owes" },
      { value: "credit", label: "Credit" },
      { value: "zero", label: "Zero" },
    ],
  },
];

function accountColumns(formatDay: (iso: string | null) => string): ColumnDef<LedgerAccount, unknown>[] {
  return [
    {
      id: "name",
      meta: { sortKey: "name" },
      header: "Member",
      accessorFn: (r) => r.name,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
          {row.original.email ? (
            <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: "balance",
      meta: { sortKey: "balanceCents", numeric: true, width: "8.5rem" },
      header: "Balance",
      accessorFn: (r) => r.balanceCents,
      cell: ({ getValue }) => {
        const cents = getValue() as number;
        return (
          <span
            className={
              cents > 0
                ? "tnum font-semibold text-emerald-700 dark:text-emerald-400"
                : cents < 0
                  ? "tnum font-semibold text-amber-700 dark:text-amber-400"
                  : "tnum text-muted-foreground"
            }
          >
            {formatMoney(cents)}
          </span>
        );
      },
    },
    {
      id: "daysOwing",
      meta: { sortKey: "daysOwing", numeric: true, width: "7rem" },
      header: "Days owing",
      accessorFn: (r) => r.daysOwing,
      cell: ({ getValue }) => {
        const days = getValue() as number | null;
        return (
          <span className="tnum text-sm text-muted-foreground">
            {days == null ? "—" : days === 0 ? "Current" : `${days}d`}
          </span>
        );
      },
    },
    {
      id: "lastActivity",
      meta: { sortKey: "lastActivityAt", width: "8.5rem" },
      header: "Last activity",
      accessorFn: (r) => r.lastActivityAt,
      cell: ({ getValue }) => (
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {formatDay(getValue() as string | null)}
        </span>
      ),
    },
  ];
}

function AccountCard({ account, onOpen }: { account: LedgerAccount; onOpen: () => void }) {
  return (
    <Card className="cursor-pointer p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{account.name}</div>
          {account.email ? (
            <div className="truncate text-xs text-muted-foreground">{account.email}</div>
          ) : null}
          {account.daysOwing != null ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {account.daysOwing === 0 ? "Current" : `Owing ${account.daysOwing}d`}
            </div>
          ) : null}
        </div>
        <div
          className={
            account.balanceCents > 0
              ? "tnum shrink-0 font-semibold text-emerald-700 dark:text-emerald-400"
              : account.balanceCents < 0
                ? "tnum shrink-0 font-semibold text-amber-700 dark:text-amber-400"
                : "tnum shrink-0 text-muted-foreground"
          }
        >
          {formatMoney(account.balanceCents)}
        </div>
      </div>
    </Card>
  );
}

/**
 * School-wide member balances for Operations Billing in ledger mode.
 * Click a row to open that person's Billing tab (the desk for credit, refund, and entries).
 */
export function LedgerAccountsTable() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedQ = useDebouncedValue(search);
  const [facets, setFacets] = useState<ListFilterValues>({});
  const status = asFacetStrings(facets.status);
  const filter = {
    q: debouncedQ || undefined,
    status: status.length ? status : undefined,
  };
  const paging = usePaging({
    resetKey: filter,
    defaultSort: { key: "balanceCents", dir: "asc" },
  });
  const q = useLedgerAccountsPage(filter, paging);
  const { rows, total } = pageRows(q);
  const summary = q.data?.summary;
  const tz = useTimeZone();
  const columns = useMemo(
    () => accountColumns((iso) => (iso ? tz.date(iso) : "–")),
    [tz]
  );

  function openAccount(account: LedgerAccount) {
    void navigate({
      to: "/people/$orgUserId",
      params: { orgUserId: String(account.orgUserId) },
      search: { tab: "ledger" },
    });
  }

  const filtersActive = !!debouncedQ || status.length > 0;

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
      data-doc-shot="ledger-accounts-table"
    >
      {q.isPending ? (
        <StatSkeleton count={4} />
      ) : (
        <StatGrid>
          <StatCard
            label="Receivable"
            value={formatMoney(summary?.receivableCents ?? 0)}
            icon={Wallet}
            accent={(summary?.receivableCents ?? 0) > 0 ? "warning" : undefined}
            hint="Members who owe"
          />
          <StatCard
            label="Credit on account"
            value={formatMoney(summary?.creditOnAccountCents ?? 0)}
            icon={Wallet}
            accent="success"
            hint="Prepaid balances"
          />
          <StatCard
            label="Owing"
            value={summary?.owingCount ?? 0}
            icon={Users}
            hint="Negative balances"
          />
          <StatCard
            label="Members"
            value={summary?.memberCount ?? 0}
            icon={Users}
            hint="Current roster"
          />
        </StatGrid>
      )}

      <div className="shrink-0">
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search members…"
          aria-label="Search member accounts"
          facets={STATUS_FACETS}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </div>

      {q.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={4} />
        </Card>
      ) : q.isError ? (
        <Card className="min-h-0 flex-1">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : total === 0 && !filtersActive ? (
        <Card className="min-h-0 flex-1">
          <EmptyState
            icon={Users}
            title="No member accounts yet"
            body="Balances show up here as people join and fly. Guest invoices stay on the Invoices tab."
          />
        </Card>
      ) : (
        <DataTable
          fill
          columns={columns}
          data={rows}
          paging={paging}
          total={total}
          loading={q.isFetching}
          emptyMessage="No members match those filters."
          onRowClick={openAccount}
          mobileCard={(account) => (
            <AccountCard account={account} onOpen={() => openAccount(account)} />
          )}
        />
      )}
    </div>
  );
}
