import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus, Users } from "lucide-react";
import { useMembers, useOrgUserGroups, type MemberFilter } from "@/features/queries";
import { rolesOf, type OrganizationUser } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RoleBadges } from "@/components/role-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EditRolesModal } from "@/components/people/edit-roles-modal";
import { InviteModal } from "@/components/people/invite-modal";
import { JoinRequestsPanel } from "@/components/people/join-requests-panel";
import { MemberCard } from "@/components/people/member-card";
import { MemberProfileSheet } from "@/components/people/member-profile-sheet";
import { MemberRowActions } from "@/components/people/member-row-actions";
import { memberName } from "@/components/people/util";
import { useAuth } from "@/lib/auth";
import { useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { canManageMembers } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";

const PEOPLE_FACET_KEYS = ["role", "grounded", "groupId"] as const;

export const Route = createFileRoute("/_authed/people")({
  validateSearch: (s) => validateListSearch(s, [...PEOPLE_FACET_KEYS]),
  component: PeoplePage,
});

const ROLE_OPTIONS = [
  { value: "instructor", label: "Instructors" },
  { value: "student", label: "Students" },
  { value: "renter", label: "Renters" },
  { value: "admin", label: "Admins" },
] as const;

type RoleKey = (typeof ROLE_OPTIONS)[number]["value"];

const ROLE_FILTER: Record<RoleKey, MemberFilter> = {
  instructor: { instructor: true },
  student: { student: true },
  renter: { renter: true },
  admin: { admin: true },
};

const EMPTY_BY_ROLE: Record<RoleKey | "all", { title: string; body: string }> = {
  all: {
    title: "Just you so far",
    body: "Invite instructors and import your students to build the roster.",
  },
  instructor: {
    title: "No instructors yet",
    body: "Invite your CFIs so they can teach and sign off flights.",
  },
  student: {
    title: "No students yet",
    body: "Invite or import students so they can book training flights.",
  },
  renter: {
    title: "No renters yet",
    body: "Invite renters to let them book aircraft solo.",
  },
  admin: {
    title: "No admins yet",
    body: "Grant admin to trusted staff so they can help run the school.",
  },
};

function PeoplePage() {
  const { roles } = useAuth();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "people",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...PEOPLE_FACET_KEYS],
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationUser | null>(null);
  const [viewing, setViewing] = useState<OrganizationUser | null>(null);

  const groupsQ = useOrgUserGroups();
  const roleKey =
    typeof facets.role === "string" && facets.role in ROLE_FILTER
      ? (facets.role as RoleKey)
      : undefined;
  const groupIdRaw = typeof facets.groupId === "string" ? Number(facets.groupId) : undefined;

  const q = useMembers({
    ...(roleKey ? ROLE_FILTER[roleKey] : {}),
    q: debouncedQ,
    grounded: typeof facets.grounded === "boolean" ? facets.grounded : undefined,
    groupId: Number.isFinite(groupIdRaw) ? groupIdRaw : undefined,
  });
  const members = q.data ?? [];

  const facetDefs = useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "role",
        label: "Role",
        allLabel: "Everyone",
        options: ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      },
      {
        kind: "boolean",
        key: "grounded",
        label: "Status",
        trueLabel: "Grounded",
        falseLabel: "Active",
      },
      {
        kind: "select",
        key: "groupId",
        label: "Group",
        allLabel: "All groups",
        options: (groupsQ.data ?? []).map((g) => ({
          value: String(g.id),
          label: g.name,
        })),
      },
    ],
    [groupsQ.data]
  );

  const filtersActive =
    !!debouncedQ ||
    roleKey != null ||
    facets.grounded !== undefined ||
    (typeof facets.groupId === "string" && facets.groupId !== "");

  const emptyCopy = EMPTY_BY_ROLE[roleKey ?? "all"];

  const columns = useMemo<ColumnDef<OrganizationUser, unknown>[]>(
    () => [
      {
        id: "member",
        header: "Member",
        accessorFn: (r) => `${memberName(r)} ${r.user?.email ?? ""}`,
        cell: ({ row }) => {
          const ou = row.original;
          const name = memberName(ou);
          const email = ou.user?.email;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-9">
                {ou.profileImage && <AvatarImage src={ou.profileImage} alt={name} />}
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{name}</div>
                {email && (
                  <div className="truncate text-xs text-muted-foreground">{email}</div>
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
        header: "Identifier",
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
            <Badge variant="outline">Active</Badge>
          ),
      },
      {
        id: "joined",
        header: "Joined",
        accessorFn: (r) => r.createdAt,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(getValue() as string | undefined)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <MemberRowActions
              ou={row.original}
              onView={setViewing}
              onEditRoles={setEditing}
            />
          </div>
        ),
      },
    ],
    []
  );

  const toolbar = (
    <ListSearchBar
      value={search}
      onChange={setSearch}
      placeholder="Search name or email…"
      aria-label="Search members"
      facets={facetDefs}
      filterValues={facets}
      onFilterChange={setFacets}
      trailing={
        canManageMembers(roles) ? (
          <Button onClick={() => setInviteOpen(true)} className="sm:w-auto">
            <UserPlus className="size-4" /> Invite
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="People"
          subtitle={
            q.data
              ? `${members.length} member${members.length === 1 ? "" : "s"}`
              : "Your organization roster"
          }
        />

        {canManageMembers(roles) && <JoinRequestsPanel />}
        {toolbar}
      </TableView.Header>

      {q.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : members.length === 0 && !filtersActive ? (
        <Card>
          <EmptyState
            icon={Users}
            title={emptyCopy.title}
            body={emptyCopy.body}
            action={
              canManageMembers(roles) && (
                <Button onClick={() => setInviteOpen(true)}>
                  <UserPlus className="size-4" /> Invite people
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <DataTable
          fill
          columns={columns}
          data={members}
          emptyMessage="No members match your filters."
          mobileCard={(ou) => (
            <MemberCard ou={ou} onView={setViewing} onEditRoles={setEditing} />
          )}
        />
      )}

      <InviteModal open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditRolesModal
        member={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <MemberProfileSheet
        member={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
      />
    </TableView>
  );
}
