import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { CircleDollarSign, Wallet } from "lucide-react";
import { pageRows, useMemberLedgerPage } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  LEDGER_RECEIPT_TYPES,
  LEDGER_TYPE_FACET_OPTIONS,
  ledgerEntryLabel,
  ledgerPostedByLabel,
} from "@/lib/ledger-labels";
import { asFacetStrings } from "@/lib/list-query-state";
import type { LedgerEntry } from "@/types/api";
import { DocsHint } from "@/components/docs-hint";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { AddFundsDialog } from "@/components/me-money/add-funds-dialog";
import {
  LedgerAddCreditDialog,
  LedgerAdjustmentDialog,
  LedgerRefundDialog,
} from "@/components/people/detail/ledger-desk-dialogs";
import { LedgerEntryDetailSheet } from "@/components/people/detail/ledger-entry-detail-sheet";
import { LedgerReceiptSheet } from "@/components/people/detail/ledger-receipt-dialog";
import { LedgerReassignDialog } from "@/components/people/detail/ledger-reassign-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatMoney } from "@/lib/utils";

const EMPTY_LEDGER =
  "No ledger entries yet. Add funds or fly, and they'll show up here.";

const LEDGER_FACETS: FacetDef[] = [
  {
    kind: "select",
    key: "type",
    label: "Type",
    allLabel: "All types",
    multiple: true,
    options: [...LEDGER_TYPE_FACET_OPTIONS],
  },
  { kind: "dateRange", key: "dateRange", label: "Date range" },
];

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "–";
}

function canReassignFlightCharge(entry: LedgerEntry): boolean {
  if (entry.type !== "flight_charge") return false;
  if (entry.reversesId != null) return false;
  if (entry.reversedBy != null) return false;
  return true;
}

function ledgerColumns(opts: {
  onReceipt: (entry: LedgerEntry) => void;
  onReassign?: (entry: LedgerEntry) => void;
}): ColumnDef<LedgerEntry, unknown>[] {
  return [
    {
      id: "created",
      meta: { sortKey: "createdAt", width: "8.5rem" },
      header: "Date",
      accessorFn: (r) => r.createdAt,
      cell: ({ getValue }) => (
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {fmtDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: "type",
      meta: { sortKey: "type", width: "7.5rem" },
      header: "Type",
      accessorFn: (r) => ledgerEntryLabel(r.type),
      cell: ({ row }) => (
        <span className="text-sm font-medium">{ledgerEntryLabel(row.original.type)}</span>
      ),
    },
    {
      id: "memo",
      header: "Memo",
      accessorFn: (r) => r.memo ?? "",
      cell: ({ row }) => (
        <span className="block max-w-[22rem] truncate text-sm text-muted-foreground">
          {row.original.memo || "–"}
          {row.original.refundMethod
            ? ` · ${row.original.refundMethod === "stripe" ? "card" : "check/cash"}`
            : ""}
        </span>
      ),
    },
    {
      id: "postedBy",
      header: "Posted by",
      accessorFn: (r) => ledgerPostedByLabel(r),
      cell: ({ row }) => (
        <span className="block max-w-[12rem] truncate text-sm text-muted-foreground">
          {ledgerPostedByLabel(row.original)}
        </span>
      ),
    },
    {
      id: "amount",
      meta: { sortKey: "amountCents", numeric: true },
      header: "Amount",
      accessorFn: (r) => r.amountCents,
      cell: ({ row }) => {
        const cents = row.original.amountCents;
        return (
          <div
            className={cn(
              "tnum text-right font-medium",
              cents > 0 && "text-emerald-700 dark:text-emerald-400"
            )}
          >
            {cents > 0 ? "+" : ""}
            {formatMoney(cents)}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const entry = row.original;
        const receipt = LEDGER_RECEIPT_TYPES.has(entry.type);
        const reassign = opts.onReassign && canReassignFlightCharge(entry);
        if (!receipt && !reassign) return null;
        return (
          <div className="flex justify-end gap-1">
            {receipt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  opts.onReceipt(entry);
                }}
              >
                Receipt
              </Button>
            )}
            {reassign && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  opts.onReassign!(entry);
                }}
              >
                Reassign
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}

function LedgerCard({
  entry,
  onReceipt,
  onReassign,
  onOpen,
}: {
  entry: LedgerEntry;
  onReceipt: (entry: LedgerEntry) => void;
  onReassign?: (entry: LedgerEntry) => void;
  onOpen?: () => void;
}) {
  const canReceipt = LEDGER_RECEIPT_TYPES.has(entry.type);
  const canReassign = onReassign != null && canReassignFlightCharge(entry);
  return (
    <Card className="cursor-pointer p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{ledgerEntryLabel(entry.type)}</div>
          <div className="tnum mt-0.5 text-xs text-muted-foreground">
            {fmtDate(entry.createdAt)} · {ledgerPostedByLabel(entry)}
            {entry.memo ? ` · ${entry.memo}` : ""}
          </div>
          {(canReceipt || canReassign) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {canReceipt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReceipt(entry);
                  }}
                >
                  Receipt
                </Button>
              )}
              {canReassign && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReassign(entry);
                  }}
                >
                  Reassign
                </Button>
              )}
            </div>
          )}
        </div>
        <div
          className={cn(
            "tnum shrink-0 text-sm font-semibold",
            entry.amountCents > 0 && "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {entry.amountCents > 0 ? "+" : ""}
          {formatMoney(entry.amountCents)}
        </div>
      </div>
    </Card>
  );
}

/**
 * Searchable, paged account ledger. Used on /me Billing and People → Billing.
 * Returns null when the org is not in ledger mode.
 */
export function MemberLedgerTable({
  orgUserId,
  isSelf,
  canManage,
  fill = false,
  showTitle = false,
}: {
  orgUserId: number;
  isSelf?: boolean;
  canManage?: boolean;
  fill?: boolean;
  /** People tab: show the Account ledger heading and desk actions here. */
  showTitle?: boolean;
}) {
  const [search, setSearch] = useState("");
  const debouncedQ = useDebouncedValue(search);
  const [facets, setFacets] = useState<ListFilterValues>({});
  const [addFunds, setAddFunds] = useState(false);
  const [credit, setCredit] = useState(false);
  const [adjustment, setAdjustment] = useState(false);
  const [refund, setRefund] = useState(false);
  const [receiptEntryId, setReceiptEntryId] = useState<number | null>(null);
  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [reassignEntry, setReassignEntry] = useState<LedgerEntry | null>(null);

  const typeFilter = asFacetStrings(facets.type);
  const startDate = typeof facets.startDate === "string" ? facets.startDate : undefined;
  const endDate = typeof facets.endDate === "string" ? facets.endDate : undefined;
  const filter = {
    q: debouncedQ,
    type: typeFilter.length ? typeFilter : undefined,
    startDate,
    endDate,
  };
  const paging = usePaging({
    resetKey: filter,
    defaultSort: { key: "createdAt", dir: "desc" },
  });
  const q = useMemberLedgerPage(orgUserId, filter, paging);
  const { rows: entries, total } = pageRows(q);
  const balanceCents = q.data?.balanceCents ?? 0;
  const ledgerOn = q.data?.ledgerEnabled === true;
  const filtersActive = !!debouncedQ || typeFilter.length > 0 || !!startDate || !!endDate;

  const columns = useMemo(
    () =>
      ledgerColumns({
        onReceipt: (entry) => {
          setDetailEntry(null);
          setReceiptEntryId(entry.id);
        },
        onReassign: canManage ? (entry) => setReassignEntry(entry) : undefined,
      }),
    [canManage]
  );
  const stepEntry = useCallback(
    (delta: -1 | 1) => {
      if (detailEntry == null) return;
      const i = entries.findIndex((e) => e.id === detailEntry.id);
      if (i === -1) return;
      const next = entries[Math.min(entries.length - 1, Math.max(0, i + delta))];
      if (next && next.id !== detailEntry.id) setDetailEntry(next);
    },
    [entries, detailEntry]
  );

  if (!q.isPending && q.data && !ledgerOn) {
    return null;
  }

  const table = q.isPending ? (
    <Card className={cn(fill && "min-h-0 flex-1 overflow-hidden")}>
      <TableSkeleton rows={fill ? 8 : 6} cols={5} />
    </Card>
  ) : q.isError ? (
    <Card className={cn(fill && "min-h-0 flex-1")}>
      <ErrorState error={q.error} onRetry={() => q.refetch()} />
    </Card>
  ) : total === 0 && !filtersActive ? (
    <Card className={cn(fill && "min-h-0 flex-1")}>
      <EmptyState icon={Wallet} title="No ledger entries yet" body={EMPTY_LEDGER} />
    </Card>
  ) : (
    <DataTable
      fill={fill}
      columns={columns}
      data={entries}
      paging={paging}
      total={total}
      loading={q.isFetching}
      mobileCard={(entry) => (
        <LedgerCard
          entry={entry}
          onOpen={() => {
            setReceiptEntryId(null);
            setDetailEntry(entry);
          }}
          onReceipt={(e) => {
            setDetailEntry(null);
            setReceiptEntryId(e.id);
          }}
          onReassign={canManage ? (e) => setReassignEntry(e) : undefined}
        />
      )}
      onRowClick={(entry) => {
        setReceiptEntryId(null);
        setDetailEntry(entry);
      }}
      isRowSelected={(entry) =>
        entry.id === detailEntry?.id || entry.id === receiptEntryId
      }
      emptyMessage="No entries match your search."
    />
  );

  const actions =
    isSelf || canManage ? (
      <div className="flex flex-wrap gap-2">
        {isSelf && (
          <Button size={showTitle ? "sm" : "default"} onClick={() => setAddFunds(true)}>
            <CircleDollarSign className="size-4" /> Add funds
          </Button>
        )}
        {canManage && (
          <>
            {balanceCents > 0 && (
              <Button size={showTitle ? "sm" : "default"} onClick={() => setRefund(true)}>
                Refund
              </Button>
            )}
            <Button
              size={showTitle ? "sm" : "default"}
              variant="outline"
              onClick={() => setCredit(true)}
            >
              Add credit
            </Button>
            <Button
              size={showTitle ? "sm" : "default"}
              variant="outline"
              onClick={() => setAdjustment(true)}
            >
              Adjustment
            </Button>
          </>
        )}
      </div>
    ) : null;

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-3", fill && "min-w-0 flex-1 overflow-hidden")}>
      {showTitle && (
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              Account ledger
              <DocsHint topic="account-ledger" />
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {q.isPending
                ? "Running balance and entries."
                : balanceCents >= 0
                  ? `Credit on account: ${formatMoney(balanceCents)}`
                  : `Amount owed: ${formatMoney(-balanceCents)}`}
            </p>
          </div>
          {actions}
        </div>
      )}

      {!showTitle &&
        (q.isPending ? (
          <div className="shrink-0">
            <StatSkeleton count={1} />
          </div>
        ) : (
          <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-md">
            <StatCard
              label="Account balance"
              value={formatMoney(balanceCents)}
              icon={Wallet}
              accent={balanceCents < 0 ? "warning" : "success"}
              hint={balanceCents >= 0 ? "Credit on account" : "Amount owed on account"}
            />
          </div>
        ))}

      <div className="shrink-0">
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder={isSelf ? "Search your ledger…" : "Search ledger…"}
          aria-label={isSelf ? "Search your ledger" : "Search ledger"}
          facets={LEDGER_FACETS}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </div>

      {table}

      {showTitle && isSelf && (
        <AddFundsDialog orgUserId={orgUserId} open={addFunds} onOpenChange={setAddFunds} />
      )}
      {canManage && (
        <>
          <LedgerAddCreditDialog orgUserId={orgUserId} open={credit} onOpenChange={setCredit} />
          <LedgerAdjustmentDialog
            orgUserId={orgUserId}
            open={adjustment}
            onOpenChange={setAdjustment}
          />
          <LedgerRefundDialog orgUserId={orgUserId} open={refund} onOpenChange={setRefund} />
          <LedgerReassignDialog
            orgUserId={orgUserId}
            entry={reassignEntry}
            open={reassignEntry != null}
            onOpenChange={(next) => {
              if (!next) setReassignEntry(null);
            }}
          />
        </>
      )}
      <LedgerEntryDetailSheet
        entry={detailEntry}
        open={detailEntry != null}
        onOpenChange={(next) => {
          if (!next) setDetailEntry(null);
        }}
        onStep={stepEntry}
      />
      <LedgerReceiptSheet
        orgUserId={orgUserId}
        entryId={receiptEntryId}
        open={receiptEntryId != null}
        onOpenChange={(next) => {
          if (!next) setReceiptEntryId(null);
        }}
      />
    </div>
  );
}
