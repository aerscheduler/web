import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserRound } from "lucide-react";
import { useGuests } from "@/features/queries";
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
 * `GET /organizations/guests` takes no query params, so search filters the
 * loaded rows client-side.
 */
export function GuestsTable() {
  const q = useGuests();
  const [search, setSearch] = useState("");

  const guests = useMemo(() => {
    const rows = q.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((g) =>
      [g.name, g.email, g.phone ?? ""].some((f) =>
        f.toLowerCase().includes(needle)
      )
    );
  }, [q.data, search]);

  const columns = useMemo<ColumnDef<Guest, unknown>[]>(
    () => [
      {
        id: "guest",
        header: "Guest",
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

  if ((q.data ?? []).length === 0) {
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
