import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserRound } from "lucide-react";
import { pageRows, useGuestsPage } from "@/features/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaging } from "@/lib/paging";
import type { Guest } from "@/types/api";
import { DataTable } from "@/components/data-table";
import { ListSearchBar } from "@/components/list-filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

/**
 * The org's reservation guests.
 *
 * Guests are not members — they're a name/email/phone captured on a booking —
 * so they can't be a role filter on the roster and there is nothing to edit
 * here. The console had no guest list at all before this; the Flutter app did.
 *
 * The list pages, so search is a server `q` — filtering the loaded rows here
 * would search the page on screen and call it a search of the guest list.
 */
export function GuestsTable() {
  const [search, setSearch] = useState("");
  const debouncedQ = useDebouncedValue(search, 250).trim() || undefined;
  const paging = usePaging({ resetKey: debouncedQ, defaultSort: { key: "name", dir: "asc" } });
  const q = useGuestsPage(paging, { q: debouncedQ });
  const { rows: guests, total } = pageRows(q);

  const columns = useMemo<ColumnDef<Guest, unknown>[]>(
    () => [
      {
        id: "guest",
        header: "Guest",
        meta: { sortKey: "name" },
        accessorFn: (g) => `${g.name} ${g.email}`,
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-9">
                <AvatarFallback>{initials(g.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{g.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {g.email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "phone",
        header: "Phone",
        meta: { sortKey: "phone" },
        accessorFn: (g) => g.phone ?? "",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
    ],
    []
  );

  if (q.isPending) {
    return (
      <Card className="min-h-0 flex-1 overflow-hidden">
        <TableSkeleton rows={6} cols={2} />
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Card>
    );
  }

  if (total === 0 && !debouncedQ) {
    return (
      <Card>
        <EmptyState
          icon={UserRound}
          title="No guests yet"
          body="Anyone booked as a guest on a reservation shows up here."
        />
      </Card>
    );
  }

  return (
    <>
      <ListSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search name, email or phone…"
        aria-label="Search guests"
      />
      <DataTable
        fill
        columns={columns}
        data={guests}
        paging={paging}
        total={total}
        loading={q.isFetching}
        emptyMessage="No guests match your search."
        mobileCard={(g) => (
          <div className="flex items-center gap-3 p-4">
            <Avatar className="size-9">
              <AvatarFallback>{initials(g.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{g.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {g.email}
              </div>
              {g.phone && (
                <div className="truncate text-xs text-muted-foreground">
                  {g.phone}
                </div>
              )}
            </div>
          </div>
        )}
      />
    </>
  );
}
