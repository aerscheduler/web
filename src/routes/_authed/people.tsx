import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus, Users } from "lucide-react";
import { useMembers, type MemberFilter } from "@/features/queries";
import { rolesOf, type OrganizationUser } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearch } from "@/components/list-search";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RoleBadges } from "@/components/role-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditRolesModal } from "@/components/people/edit-roles-modal";
import { InviteModal } from "@/components/people/invite-modal";
import { JoinRequestsPanel } from "@/components/people/join-requests-panel";
import { MemberCard } from "@/components/people/member-card";
import { MemberProfileSheet } from "@/components/people/member-profile-sheet";
import { MemberRowActions } from "@/components/people/member-row-actions";
import { memberName } from "@/components/people/util";
import { useAuth } from "@/lib/auth";
import { canManageMembers } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";

export const Route = createFileRoute("/_authed/people")({
  component: PeoplePage,
});

type TabKey = "all" | "instructor" | "student" | "renter" | "admin";

const FILTERS: { key: TabKey; label: string; filter: MemberFilter }[] = [
  { key: "all", label: "Everyone", filter: {} },
  { key: "instructor", label: "Instructors", filter: { instructor: true } },
  { key: "student", label: "Students", filter: { student: true } },
  { key: "renter", label: "Renters", filter: { renter: true } },
  { key: "admin", label: "Admins", filter: { admin: true } },
];

const EMPTY_COPY: Record<TabKey, { title: string; body: string }> = {
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
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationUser | null>(null);
  const [viewing, setViewing] = useState<OrganizationUser | null>(null);

  const active = FILTERS.find((f) => f.key === tab) ?? FILTERS[0];
  const q = useMembers(active.filter);
  const members = q.data ?? [];

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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <ListSearch
        value={search}
        onChange={setSearch}
        placeholder="Search name or email…"
        aria-label="Search members"
      />
      {canManageMembers(roles) && (
        <Button onClick={() => setInviteOpen(true)} className="sm:w-auto">
          <UserPlus className="size-4" /> Invite
        </Button>
      )}
    </div>
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

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </TableView.Header>

      {q.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={EMPTY_COPY[tab].title}
            body={EMPTY_COPY[tab].body}
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
          toolbar={toolbar}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          emptyMessage="No members match your search."
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
