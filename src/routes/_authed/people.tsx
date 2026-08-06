import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus, Users, GraduationCap } from "lucide-react";
import {
  pageRows,
  useMembersPage,
  useOrgUserGroups,
  type MemberFilter,
} from "@/features/queries";
import { usePaging } from "@/lib/paging";
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
import { MemberRowActions } from "@/components/people/member-row-actions";
import { GuestsTable } from "@/components/people/guests-table";
import { memberName } from "@/components/people/util";
import { useAuth } from "@/lib/auth";
import { asFacetInts, asFacetStrings, useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { canManageMembers, isInstructor, isStaff } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";

/**
 * `type` is Members vs Guests — a filter, not a tab.
 *
 * They were tabs, which put a second, competing navigation above a page that already
 * has a filter bar: two controls that both narrow the list, in two different idioms.
 * Guests are simply a different kind of person on this roster, so they are a value of
 * a Type filter, exactly like Role or Group. It defaults to Members, and being a facet
 * it is remembered and shareable like every other one.
 */
const PEOPLE_FACET_KEYS = ["type", "role", "grounded", "groupId", "archived"] as const;

const TYPE_OPTIONS = [
  { value: "members", label: "Members" },
  { value: "guests", label: "Guests" },
] as const;

export const Route = createFileRoute("/_authed/people")({
  /**
   * `?member=<orgUserId>` is the OLD deep link — it used to open a profile
   * drawer over this table. That drawer is now the `/people/:orgUserId` page, so
   * the param survives only as a redirect (see `deepLinkedId` below): bookmarks,
   * pasted links and anything still emitting the old shape keep working instead
   * of silently landing on an unfiltered roster.
   *
   * It is kept OUTSIDE the facet list on purpose: facets are remembered in
   * localStorage and restored on the next visit, and a one-shot deep link that
   * came back days later would redirect someone who was just opening People.
   */
  validateSearch: (s) => {
    const list = validateListSearch(s, [...PEOPLE_FACET_KEYS]);
    const member = Number.parseInt(String(s.member ?? ""), 10);
    return {
      ...list,
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
    defaults: { type: "members" },
  });
  // Guests come from `GET /organizations/guests`, which the server serves to
  // admin, dispatcher and instructor — mirror exactly that. Someone without it
  // sees the roster whatever the URL says, rather than an empty table.
  const canViewGuests = isStaff(roles) || isInstructor(roles);
  const showingGuests = canViewGuests && facets.type === "guests";

  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignPairOpen, setAssignPairOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationUser | null>(null);

  const deepLinkedId = useMemo(() => {
    const n = Number.parseInt(String(routeSearch.member ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [routeSearch.member]);

  // Forward the legacy `?member=` link to that person's page. `replace` so Back
  // skips this table and returns to wherever the link was opened from, rather
  // than bouncing through the redirect a second time.
  useEffect(() => {
    if (deepLinkedId == null) return;
    void navigate({
      to: "/people/$orgUserId",
      params: { orgUserId: String(deepLinkedId) },
      replace: true,
    });
  }, [deepLinkedId, navigate]);

  const viewProfile = useCallback(
    (ou: OrganizationUser) =>
      void navigate({
        to: "/people/$orgUserId",
        params: { orgUserId: String(ou.id) },
      }),
    [navigate]
  );

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

  // The roster shows current members; `archived` swaps it for the retired one. The
  // server treats "not asked" and "false" identically, so only `true` is ever sent.
  const showingArchived = facets.archived === true;

  const memberFilter: MemberFilter = {
    ...roleFilter,
    q: debouncedQ,
    grounded: typeof facets.grounded === "boolean" ? facets.grounded : undefined,
    archived: showingArchived ? true : undefined,
    groupId: groupIds,
  };
  // Re-filtering puts you back on page one — otherwise a search run from page 7
  // answers "3 members" over an empty table.
  const paging = usePaging({ resetKey: memberFilter, defaultSort: { key: "user.name", dir: "asc" } });
  const q = useMembersPage(memberFilter, paging);
  const { rows: members, total } = pageRows(q);

  const facetDefs = useMemo<FacetDef[]>(() => {
    const type: FacetDef[] = canViewGuests
      ? [
          {
            kind: "select",
            key: "type",
            label: "Type",
            required: true,
            options: TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          },
        ]
      : [];

    // Nothing below applies to a guest: they hold no role, join no group, and are
    // never grounded or archived. Offering those controls here would be four
    // filters that silently do nothing.
    if (showingGuests) return type;

    return [
      ...type,
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
      // Not a status — a different roster. Archived members are absent from every
      // other view in the product, so this is the only way to see or restore one.
      {
        kind: "boolean",
        key: "archived",
        label: "Roster",
        trueLabel: "Archived",
        falseLabel: "Current",
        // NOT "Any": leaving this unset shows current members only, because the
        // server excludes archived people by default. "Any" would promise a
        // complete roster and quietly deliver a filtered one.
        neutralLabel: "Current",
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
    ];
  }, [groupsQ.data, canViewGuests, showingGuests]);

  const filtersActive =
    !!debouncedQ ||
    roleKeys.length > 0 ||
    facets.grounded !== undefined ||
    facets.archived !== undefined ||
    (groupIds?.length ?? 0) > 0;

  const emptyCopy =
    EMPTY_BY_ROLE[roleKeys.length === 1 ? roleKeys[0]! : "all"];

  const columns = useMemo<ColumnDef<OrganizationUser, unknown>[]>(
    () => [
      {
        id: "member",
        header: "Member",
        // The server orders by `user.name`; the accessor below is a composed
        // string (name + email) that exists only to render, and there is no
        // field behind it to sort on.
        meta: { sortKey: "user.name" },
        accessorFn: (r) => `${memberName(r)} ${r.user?.email ?? ""}`,
        cell: ({ row }) => {
          const ou = row.original;
          const name = memberName(ou);
          const email = ou.user?.email;
          return (
            // A real link, not just a clickable row: middle-click, ⌘-click and
            // "copy link address" all have to work on a roster people share.
            <Link
              to="/people/$orgUserId"
              params={{ orgUserId: String(ou.id) }}
              className="flex items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
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
            </Link>
          );
        },
      },
      {
        id: "roles",
        header: "Roles",
        cell: ({ row }) => <RoleBadges roles={rolesOf(row.original)} />,
      },
      {
        id: "identifier",
        header: "Identifier",
        meta: { sortKey: "identifier" },
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
        cell: ({ row }) => {
          const ou = row.original;
          // Archived wins: a retired member's grounding is history, and showing
          // "Grounded" on somebody the school has already filed away invites
          // exactly the pointless ungrounding this feature exists to avoid.
          if (ou.archivedAt) return <Badge variant="secondary">Archived</Badge>;
          return ou.grounded ? (
            <Badge variant="danger">Grounded</Badge>
          ) : (
            <Badge variant="outline">Active</Badge>
          );
        },
      },
      {
        id: "joined",
        header: "Joined",
        meta: { sortKey: "createdAt" },
        accessorFn: (r) => r.createdAt,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(getValue() as string | undefined)}
          </span>
        ),
      },
      {
        // How a school finds the people worth archiving. Nothing in the console used
        // to distinguish a current student from one who stopped showing up in 2023,
        // which is why tidying the roster meant grounding everybody and hoping.
        id: "lastActive",
        header: "Last active",
        meta: { sortKey: "user.lastActiveAt" },
        accessorFn: (r) => r.user?.lastActiveAt ?? "",
        cell: ({ row }) => {
          const last = row.original.user?.lastActiveAt;
          if (!last) return <span className="whitespace-nowrap text-muted-foreground">Never</span>;
          const stale = Date.now() - new Date(last).getTime() > 365 * 24 * 60 * 60 * 1000;
          return (
            <span
              className={`whitespace-nowrap ${stale ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}
              title={stale ? "No activity in over a year" : undefined}
            >
              {formatDate(last)}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <MemberRowActions
              ou={row.original}
              onView={viewProfile}
              onEditRoles={setEditing}
            />
          </div>
        ),
      },
    ],
    [viewProfile]
  );

  const toolbar = (
    <ListSearchBar
      value={search}
      onChange={setSearch}
      placeholder={showingGuests ? "Search name, email or phone…" : "Search name or email…"}
      aria-label={showingGuests ? "Search guests" : "Search members"}
      facets={facetDefs}
      filterValues={facets}
      onFilterChange={setFacets}
      trailing={
        // Nobody invites a guest — they arrive by being booked on a reservation.
        canManageMembers(roles) && !showingGuests ? (
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
            showingGuests
              ? "Guests booked on your reservations"
              : showingArchived
                ? q.data
                  ? `${total.toLocaleString()} archived member${total === 1 ? "" : "s"} — they get no email or notifications from you`
                  : "People you've retired from the roster"
                : q.data
                  ? `${total.toLocaleString()} member${total === 1 ? "" : "s"}`
                  : "Your organization roster"
          }
        />

        {!showingGuests && canManageMembers(roles) && (
          <>
            <JoinRequestsPanel />
            <InstructionRequestsPanel />
          </>
        )}
        {toolbar}
      </TableView.Header>

      {showingGuests ? (
        <GuestsTable q={debouncedQ} />
      ) : q.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : total === 0 && !filtersActive ? (
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
          paging={paging}
          total={total}
          loading={q.isFetching}
          onRowClick={viewProfile}
          emptyMessage={
            showingArchived
              ? "Nobody has been archived yet."
              : "No members match your filters."
          }
          mobileCard={(ou) => (
            <MemberCard ou={ou} onView={viewProfile} onEditRoles={setEditing} />
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
    </TableView>
  );
}
