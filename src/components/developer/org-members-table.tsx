import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserRound } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaging } from "@/lib/paging";
import { useDeveloperOrgMembers, type OrgMemberRow } from "@/features/queries";
import { DataTable } from "@/components/data-table";
import { ListSearchBar } from "@/components/list-filters";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/states";

/**
 * A school's people, on the developer's copy of that school.
 *
 * Archived memberships are listed and badged rather than filtered out. The question
 * that brings somebody here is almost always "why can this person not get in", and an
 * archived membership is the answer, so hiding it hides the finding.
 */
export function OrgMembersTable({ orgId }: { orgId: number }) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 250);

  const paging = usePaging({ resetKey: q });
  const list = useDeveloperOrgMembers(orgId, {
    q: q.trim() || undefined,
    limit: paging.query.limit,
    offset: paging.query.offset,
  });

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;

  const columns = useMemo<ColumnDef<OrgMemberRow, unknown>[]>(
    () => [
      {
        id: "person",
        header: "Person",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <span className="truncate">{row.original.name}</span>
              {row.original.archivedAt && <Badge variant="outline">Archived</Badge>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        ),
      },
      {
        id: "roles",
        header: "Roles",
        cell: ({ row }) =>
          row.original.roles.length === 0 ? (
            <span className="text-muted-foreground">none</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.roles.map((r) => (
                <Badge key={r} variant="outline">
                  {r}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: "verified",
        header: "Email verified",
        cell: ({ row }) =>
          row.original.emailVerifiedAt ? (
            new Date(row.original.emailVerifiedAt).toLocaleDateString()
          ) : (
            // Worth its own colour: an unverified address is the most common reason a
            // person says they signed up and cannot sign in.
            <Badge variant="danger">Not verified</Badge>
          ),
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
      <ListSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search this school's people by name or email…"
        aria-label="Search members"
      />

      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : (
        <DataTable<OrgMemberRow>
          fill
          columns={columns}
          data={rows}
          paging={paging}
          total={total}
          loading={list.isFetching}
          emptyMessage={
            <EmptyState
              icon={UserRound}
              title="Nobody matches"
              body="Search this school's members by name or email address."
            />
          }
          mobileCard={(m) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{m.name}</span>
                {m.archivedAt && <Badge variant="outline">Archived</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              <div className="text-xs text-muted-foreground">{m.roles.join(", ") || "no roles"}</div>
            </div>
          )}
        />
      )}
    </div>
  );
}
