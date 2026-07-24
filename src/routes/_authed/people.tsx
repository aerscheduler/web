import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { Mail, UserPlus, Users } from "lucide-react";
import { useMembers, type MemberFilter } from "@/features/queries";
import { rolesOf, type OrganizationUser } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadges } from "@/components/role-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/people")({
  component: PeoplePage,
});

const FILTERS: { key: string; label: string; filter: MemberFilter }[] = [
  { key: "all", label: "Everyone", filter: {} },
  { key: "instructor", label: "Instructors", filter: { instructor: true } },
  { key: "student", label: "Students", filter: { student: true } },
  { key: "renter", label: "Renters", filter: { renter: true } },
  { key: "admin", label: "Admins", filter: { admin: true } },
];

const columns: ColumnDef<OrganizationUser, unknown>[] = [
  {
    id: "member",
    header: "Member",
    accessorFn: (r) => r.user?.name ?? `Member #${r.id}`,
    cell: ({ row }) => {
      const ou = row.original;
      const name = ou.user?.name ?? `Member #${ou.id}`;
      const email = ou.user?.email;
      return (
        <div className="flex items-center gap-3">
          <Avatar name={name} src={ou.profileImage} />
          <div className="min-w-0">
            <div className="truncate font-medium">{name}</div>
            {email && (
              <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Mail className="size-3" /> {email}
              </div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: "roles",
    header: "Roles",
    enableSorting: false,
    cell: ({ row }) => <RoleBadges roles={rolesOf(row.original)} />,
  },
  {
    id: "identifier",
    header: "ID",
    accessorFn: (r) => r.identifier ?? "",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-muted-foreground">
        {(getValue() as string) || "—"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.grounded ? (
        <Badge variant="danger">Grounded</Badge>
      ) : (
        <Badge variant="success">Active</Badge>
      ),
  },
  {
    id: "joined",
    header: "Joined",
    accessorFn: (r) => r.createdAt,
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {format(parseISO(getValue() as string), "MMM d, yyyy")}
      </span>
    ),
  },
];

function PeoplePage() {
  const [active, setActive] = useState(0);
  const q = useMembers(FILTERS[active].filter);
  const members = q.data ?? [];

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={q.data ? `${members.length} member${members.length === 1 ? "" : "s"}` : "Your organization roster"}
        actions={
          <Button disabled title="Coming soon">
            <UserPlus className="size-4" /> Invite
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {FILTERS.map((f, i) => (
          <button
            key={f.key}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              i === active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members here yet"
            body="Invite instructors, renters, and students to build out your roster."
          />
        ) : (
          <DataTable columns={columns} data={members} />
        )}
      </Card>
    </div>
  );
}
