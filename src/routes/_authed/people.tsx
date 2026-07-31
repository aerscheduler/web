import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus, Users, GraduationCap } from "lucide-react";
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
import { InstructionRequestsPanel } from "@/components/people/instruction-requests-panel";
import { AdminAssignPairDialog } from "@/components/people/admin-assign-pair-dialog";
import { MemberCard } from "@/components/people/member-card";
import { MemberProfileSheet } from "@/components/people/member-profile-sheet";
import { MemberRowActions } from "@/components/people/member-row-actions";
import { GuestsTable } from "@/components/people/guests-table";
import { memberName } from "@/components/people/util";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { asFacetInts, asFacetStrings, useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { canManageMembers, isInstructor, isStaff } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";

const PEOPLE_FACET_KEYS = ["role", "grounded", "groupId"] as const;

export const Route = createFileRoute("/_authed/people")({
  /**
   * `?member=<orgUserId>` opens that person's profile sheet — the deep link the
   * ⌘K palette uses for a person, and for another member's currency or document
   * (this sheet is the only place the console shows those for someone else).
   *
   * It is kept OUTSIDE the facet list on purpose: facets are remembered in
   * localStorage and restored on the next visit, and a one-shot deep link that
   * came back days later would reopen a sheet nobody asked for.
   */
  validateSearch: (s) => {
    const list = validateListSearch(s, [...PEOPLE_FACET_KEYS]);
    const member = Number.parseInt(String(s.member ?? ""), 10);
    const tab = s.tab === "guests" ? "guests" : undefined;
    return {
      ...list,
      ...(tab ? { tab } : {}),
      ...(Number.isFinite(member) ? { member: String(member) } : {}),
    };
  },
  component: PeoplePage,
});

/**
 * Every role the server can filter on, plus "no role". `GET /orgUsers` has
 * always accepted technician/dispatcher/noRoles — only this list was short, so
 * a technician or a member waiting to be assigned a role was unfindable.
 *
 * Owner is deliberately absent: the server enforces owner ⊃ admin, so owners
 * already appear under Admins and a separate facet would only ever be a subset.
 */
const ROLE_OPTIONS = [
  { value: "instructor", label: "Instructors" },
  { value: "student", label: "Students" },
  { value: "renter", label: "Renters" },
  { value: "technician", label: "Technicians" },
  { value: "dispatcher", label: "Dispatchers" },
  { value: "admin", label: "Admins" },
  { value: "noRoles", label: "No role yet" },
] as const;

type RoleKey = (typeof ROLE_OPTIONS)[number]["value"];

const ROLE_FILTER: Record<RoleKey, MemberFilter> = {
  instructor: { instructor: true },
  student: { student: true },
  renter: { renter: true },
  technician: { technician: true },
  dispatcher: { dispatcher: true },
  admin: { admin: true },
  noRoles: { noRoles: true },
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
  technician: {
    title: "No technicians yet",
    body: "Invite your maintenance staff so they can work squawks and reminders.",
  },
  dispatcher: {
    title: "No dispatchers yet",
    body: "Grant dispatcher to whoever runs the board day to day.",
  },
  admin: {
    title: "No admins yet",
    body: "Grant admin to trusted staff so they can help run the school.",
  },
  noRoles: {
    title: "Everyone has a role",
    body: "Nobody is waiting to be assigned — new members will show up here.",
  },
};

function PeoplePage() {
  const { roles } = useAuth();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  // One loosely-typed navigate for every search-param update on this page, the
  // same cast `useListQueryState` already needs for its own reducers.
  const navigateSearch = navigate as Parameters<typeof useListQueryState>[0]["navigate"];
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "people",
    search: routeSearch,
    navigate: navigateSearch,
    facetKeys: [...PEOPLE_FACET_KEYS],
  });
  // Guests come from `GET /organizations/guests`, which the server serves to
  // admin, dispatcher and instructor — mirror exactly that.
  const canViewGuests = isStaff(roles) || isInstructor(roles);
  const tab = canViewGuests && routeSearch.tab === "guests" ? "guests" : "members";
  const setTab = (next: string) =>
    navigateSearch({
      search: ({ tab: _drop, ...rest }: Record<string, unknown>) =>
        next === "guests" ? { ...rest, tab: "guests" } : rest,
      replace: true,
    });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignPairOpen, setAssignPairOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationUser | null>(null);
  const [viewing, setViewing] = useState<OrganizationUser | null>(null);

  const deepLinkedId = useMemo(() => {
    const n = Number.parseInt(String(routeSearch.member ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [routeSearch.member]);

  // Resolved against the FULL roster, not the filtered list on screen: the page
  // restores your last filters from localStorage, and a link to someone those
  // filters exclude must still open — otherwise the palette silently no-ops.
  const deepLinkQ = useMembers(undefined, { enabled: deepLinkedId != null });

  useEffect(() => {
    if (deepLinkedId == null) return;
    const match = (deepLinkQ.data ?? []).find((m) => m.id === deepLinkedId);
    if (!match) return;
    setViewing(match);
    // Consume the param so closing the sheet doesn't leave a URL that reopens it.
    navigateSearch({
      search: ({ member: _drop, ...rest }: Record<string, unknown>) => rest,
      replace: true,
    });
  }, [deepLinkedId, deepLinkQ.data, navigateSearch]);

  const groupsQ = useOrgUserGroups();
  const roleKeys = asFacetStrings(facets.role).filter(
    (r): r is RoleKey => r in ROLE_FILTER
  );
  // `noRoles` trumps every other role flag on the server (routes/orgUser.ts), so
  // combining it with, say, Students would silently drop the Students half.
  // Match that here rather than sending a filter the server won't honour.
  const roleFilter: MemberFilter = {};
  if (roleKeys.includes("noRoles")) {
    Object.assign(roleFilter, ROLE_FILTER.noRoles);
  } else {
    for (const r of roleKeys) Object.assign(roleFilter, ROLE_FILTER[r]);
  }
  const groupIds = asFacetInts(facets.groupId);

  const q = useMembers({
    ...roleFilter,
    q: debouncedQ,
    grounded: typeof facets.grounded === "boolean" ? facets.grounded : undefined,
    groupId: groupIds,
  });
  const members = q.data ?? [];

  const facetDefs = useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "role",
        label: "Role",
        allLabel: "Everyone",
        multiple: true,
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
        multiple: true,
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
    roleKeys.length > 0 ||
    facets.grounded !== undefined ||
    (groupIds?.length ?? 0) > 0;

  const emptyCopy =
    EMPTY_BY_ROLE[roleKeys.length === 1 ? roleKeys[0]! : "all"];

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
          <div className="flex flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" onClick={() => setAssignPairOpen(true)} className="sm:w-auto">
              <GraduationCap className="size-4" /> Assign pair
            </Button>
            <Button onClick={() => setInviteOpen(true)} className="sm:w-auto">
              <UserPlus className="size-4" /> Invite
            </Button>
          </div>
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
            tab === "guests"
              ? "Guests booked on your reservations"
              : q.data
                ? `${members.length} member${members.length === 1 ? "" : "s"}`
                : "Your organization roster"
          }
        />

        {canViewGuests && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="guests">Guests</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {tab === "members" && (
          <>
            {canManageMembers(roles) && <JoinRequestsPanel />}
            {canManageMembers(roles) && <InstructionRequestsPanel />}
            {toolbar}
          </>
        )}
      </TableView.Header>

      {tab === "guests" ? (
        <GuestsTable />
      ) : q.isPending ? (
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
      <AdminAssignPairDialog open={assignPairOpen} onOpenChange={setAssignPairOpen} />
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
