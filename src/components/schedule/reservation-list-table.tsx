import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { addDays } from "date-fns";
import { resourceLabel, type OrganizationUser, type Reservation, type ReservationType } from "@/types/api";
import { GroupByMenu, ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableSort } from "@/components/list-table";
import { GroundedMark, shopJobLine, shopJobOf } from "@/components/schedule/shop-job";
import { WorkspaceUserAvatar, WorkspaceUserAvatars, type WorkspacePerson } from "@/components/workspace-user-avatar";
import { WorkStatusIcon } from "@/components/maintenance/work-status-icon";
import { useTimeZone, type TimeZoneContext } from "@/lib/use-timezone";
import { dateKeyInZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { BILLING_OPTIONS, billingStatus, type BillingStatus } from "./board-filters";
import { STATUS_BY_ID, STATUS_RANK, statusOf, statusText, type Status } from "./reservation-list-status";
import { TYPE_LABEL, TYPE_ORDER } from "./meta";

/**
 * Bookings as a list rather than a calendar: the dispatch board's List layout and the member's
 * own schedule. Built on ListTable, so it groups, pins its group headers, sorts from its column
 * headers and folds to one column on a phone the way the job board does.
 *
 * A list can drop what the filters don't match, where the board only dims it: the board's
 * empty slots claim the aircraft is free, a list makes no claim about the gaps between rows.
 */

export type ReservationGroupBy = "date" | "status" | "resource" | "person" | "type";

export const GROUP_BY_OPTIONS: { value: ReservationGroupBy; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "status", label: "Status" },
  { value: "resource", label: "Aircraft" },
  { value: "person", label: "Person" },
  { value: "type", label: "Type" },
];

export function asGroupBy(v: unknown): ReservationGroupBy {
  return GROUP_BY_OPTIONS.some((o) => o.value === v) ? (v as ReservationGroupBy) : "date";
}

const BILLING_LABEL = new Map(BILLING_OPTIONS.map((o) => [o.value, o.label]));
const BILLING_RANK: Record<BillingStatus, number> = { unpaid: 0, notInvoiced: 1, paid: 2, voided: 3 };

/** A type's hue, for the dot before a booking: the same --res-* token the board paints it with. */
const TYPE_HUE: Record<Reservation["type"], string> = {
  dual: "var(--res-dual)",
  instructor: "var(--res-dual)",
  solo: "var(--res-solo)",
  shared: "var(--res-rental)",
  ground: "var(--res-ground)",
  sim: "var(--res-sim)",
  rental: "var(--res-rental)",
  guest: "var(--res-guest)",
  maintenance: "var(--res-maintenance)",
};

const resourceName = (r: Reservation) => (r.resource ? resourceLabel(r.resource).name : null);

type SortKey = (r: Reservation, now: Date) => string | number | null;
const SORT_KEYS: Record<string, SortKey> = {
  title: (r) => r.title.toLowerCase(),
  when: (r) => r.start,
  resource: (r) => resourceName(r)?.toLowerCase() ?? null,
  status: (r, now) => STATUS_RANK.get(statusOf(r, now)) ?? 0,
  billing: (r) => BILLING_RANK[billingStatus(r)],
};

export type ReservationGroup = {
  id: string;
  label: string;
  status?: Status;
  /** Grouped by person: who, and their seat on each booking (booking id to "Instructor"). */
  person?: WorkspacePerson;
  seats?: Map<number, string>;
  /** Grouped by type: which, for the dot and the order. */
  type?: ReservationType;
  items: Reservation[];
};

/**
 * The groups and the order the list reads in. The caller hands `ordered` to the detail panel,
 * so its up and down walk the rows as they are drawn.
 */
export function useReservationGroups(
  reservations: Reservation[],
  { groupBy, sort, newestFirst = false }: { groupBy: ReservationGroupBy; sort: ListTableSort | null; newestFirst?: boolean }
): { groups: ReservationGroup[]; ordered: Reservation[] } {
  const tz = useTimeZone();
  return React.useMemo(() => {
    const now = new Date();
    const byTime = (a: Reservation, b: Reservation) =>
      newestFirst ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start);
    const key = sort ? SORT_KEYS[sort.id] : null;
    const order = (list: Reservation[]) =>
      [...list].sort((a, b) => {
        if (!sort || !key) return byTime(a, b);
        const x = key(a, now);
        const y = key(b, now);
        if (x == null || y == null) return x == null && y == null ? byTime(a, b) : x == null ? 1 : -1;
        const c = x < y ? -1 : x > y ? 1 : byTime(a, b);
        return sort.desc ? -c : c;
      });

    const buckets = new Map<string, ReservationGroup>();
    const put = (id: string, make: () => Omit<ReservationGroup, "items">, r: Reservation) => {
      const g = buckets.get(id) ?? { ...make(), items: [] };
      g.items.push(r);
      buckets.set(id, g);
    };
    for (const r of reservations) {
      if (groupBy === "status") {
        const s = statusOf(r, now);
        put(s, () => ({ id: s, label: STATUS_BY_ID.get(s)!.label, status: s }), r);
      } else if (groupBy === "person") {
        // A booking sits under everyone on it: a dual lesson is in the instructor's group and
        // the student's. Guests have no profile, so they are not groups of their own.
        const seated = seatedPeople(r);
        if (!seated.length) put("none", () => ({ id: "none", label: "Nobody assigned" }), r);
        for (const { person, seat } of seated) {
          const id = `p-${person.id}`;
          put(id, () => ({ id, label: person.name?.trim() || "Unknown", person, seats: new Map() }), r);
          buckets.get(id)!.seats!.set(r.id, seat);
        }
      } else if (groupBy === "type") {
        const id = `t-${r.type}`;
        put(id, () => ({ id, label: TYPE_LABEL[r.type] ?? r.type, type: r.type }), r);
      } else if (groupBy === "resource") {
        const name = resourceName(r);
        const id = r.resource ? `res-${r.resource.id}` : "none";
        put(id, () => ({ id, label: name ?? "No aircraft" }), r);
      } else {
        const day = dateKeyInZone(r.start, tz.zone);
        put(day, () => ({ id: day, label: dayHeading(day, tz.zone) }), r);
      }
    }

    let groups = [...buckets.values()];
    if (groupBy === "status") {
      groups.sort((a, b) => (STATUS_RANK.get(a.status!) ?? 0) - (STATUS_RANK.get(b.status!) ?? 0));
    } else if (groupBy === "type") {
      // The order the booking form offers them in.
      const rank = (t?: ReservationType) => (t ? TYPE_ORDER.indexOf(t) : -1);
      groups.sort((a, b) => rank(a.type) - rank(b.type));
    } else if (groupBy === "resource" || groupBy === "person") {
      // Bookings with no aircraft (ground, a room), or with nobody on them, last.
      groups.sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : a.label.localeCompare(b.label)));
    } else {
      groups.sort((a, b) => (newestFirst ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id)));
    }
    groups = groups.map((g) => ({ ...g, items: order(g.items) }));
    // A booking under two people is one stop for the panel's up and down, not two.
    const seen = new Set<number>();
    const ordered = groups.flatMap((g) => g.items).filter((r) => !seen.has(r.id) && !!seen.add(r.id));
    return { groups, ordered };
  }, [reservations, groupBy, sort, newestFirst, tz.zone]);
}

/** "Today", "Tomorrow", "Yesterday", else "Tuesday, October 6", all on the airport's calendar. */
function dayHeading(key: string, zone: string): string {
  const now = new Date();
  if (key === dateKeyInZone(now, zone)) return "Today";
  if (key === dateKeyInZone(addDays(now, 1), zone)) return "Tomorrow";
  if (key === dateKeyInZone(addDays(now, -1), zone)) return "Yesterday";
  // The key is already the airport's date: format it as a plain date, in no zone of its own.
  return DAY_HEADING.format(new Date(`${key}T12:00:00Z`));
}

const DAY_HEADING = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

/** The members on a booking with the seat each holds, one entry per person. */
function seatedPeople(r: Reservation): { person: WorkspacePerson; seat: string }[] {
  const p = r.personnel;
  const out = new Map<number, { person: WorkspacePerson; seat: string }>();
  const add = (list: OrganizationUser[] | undefined, seat: string) => {
    for (const ou of list ?? []) {
      if (!out.has(ou.id)) {
        out.set(ou.id, { person: { id: ou.id, name: ou.user?.name, profileImage: ou.user?.publicProfileImage ?? null }, seat });
      }
    }
  };
  if (p) {
    add(p.instructors, "Instructor");
    add(p.students, "Student");
    add(p.renters, "Renter");
  }
  return [...out.values()];
}

/** Everyone on the booking who is a member, for the avatars; a guest has no profile to open. */
function workspacePeople(r: Reservation): WorkspacePerson[] {
  const p = r.personnel;
  return [...(p?.instructors ?? []), ...(p?.students ?? []), ...(p?.renters ?? [])].map((ou) => ({
    id: ou.id,
    name: ou.user?.name,
    profileImage: ou.user?.publicProfileImage ?? null,
  }));
}

function columnsFor(groupBy: ReservationGroupBy): ListTableColumn[] {
  // Time first: on a phone every column folds into the line under the title, in this order.
  return [
    // Grouped by day, the heading says the date; grouped any other way, the row has to.
    { id: "when", header: "Time", width: groupBy === "date" ? "11.5rem" : "15rem", sortable: true },
    { id: "resource", header: "Aircraft", width: "8rem", sortable: true },
    { id: "people", header: "People", width: "5rem" },
    { id: "status", header: "Status", width: "11rem", sortable: true },
    { id: "billing", header: "Billing", width: "5.5rem", sortable: true },
  ];
}

export function ReservationListTable({
  groups,
  groupBy,
  onGroupByChange,
  sort,
  onSortChange,
  selectedId,
  onOpen,
  label,
  docShot,
  empty,
  className,
  hideColumns,
}: {
  groups: ReservationGroup[];
  groupBy: ReservationGroupBy;
  onGroupByChange: (g: ReservationGroupBy) => void;
  sort: ListTableSort | null;
  onSortChange: (s: ListTableSort | null) => void;
  selectedId?: number | null;
  onOpen: (r: Reservation) => void;
  label: string;
  docShot?: string;
  /** Shown when every booking is filtered out. */
  empty?: React.ReactNode;
  className?: string;
  /** Column ids to leave out: a member's own list has no use for Billing. */
  hideColumns?: string[];
}) {
  const tz = useTimeZone();
  const navigate = useNavigate();
  const now = new Date();

  const tableGroups: ListTableGroup[] = groups.map((g) => ({
    id: g.id,
    label: g.label,
    marker: g.status ? (
      <WorkStatusIcon status={STATUS_BY_ID.get(g.status)!.icon} />
    ) : g.person ? (
      <WorkspaceUserAvatar person={g.person} />
    ) : g.type ? (
      <span className="size-2 rounded-full" style={{ background: TYPE_HUE[g.type] }} aria-hidden />
    ) : undefined,
    count: g.items.length,
    rows: g.items.map((r) => {
      const statusId = statusOf(r, now);
      const status = STATUS_BY_ID.get(statusId)!;
      const billing = billingStatus(r);
      const people = workspacePeople(r);
      const when = whenText(r, groupBy, tz);
      const seat = g.seats?.get(r.id);
      return {
        // The group in the id: grouped by person, one booking is a row in two groups.
        id: `${g.id}:res-${r.id}`,
        testId: `reservation-row-${r.id}`,
        label: `${r.title}, ${when}`,
        leading: <span className="size-2 rounded-full" style={{ background: TYPE_HUE[r.type] }} aria-hidden />,
        title: shopJobOf(r)?.grounded ? (
          <>
            <GroundedMark className="mr-1 -mt-0.5 align-middle" />
            {r.title}
          </>
        ) : (
          r.title
        ),
        // A hangar booking's customer and request, for the viewers the server sent them to.
        subtitle: shopJobOf(r) ? shopJobLine(shopJobOf(r)!) ?? undefined : undefined,
        tags: (
          <>
            {groupBy !== "type" && <ListTag>{TYPE_LABEL[r.type] ?? r.type}</ListTag>}
            {seat && <ListTag>{seat}</ListTag>}
          </>
        ),
        dim: !!r.cancelledAt,
        selected: r.id === selectedId,
        onOpen: () => onOpen(r),
        onOpenPage: () =>
          void navigate({ to: "/schedule/reservations/$reservationId", params: { reservationId: String(r.id) } }),
        cells: {
          when: <span title={when}>{when}</span>,
          resource: resourceName(r) ?? <span className="text-muted-foreground">None</span>,
          people: people.length ? <WorkspaceUserAvatars people={people} /> : null,
          status: (
            <span
              className={cn(
                "inline-flex min-w-0 items-center gap-1.5",
                statusId === "overdue" ? "font-medium text-warning" : "text-muted-foreground"
              )}
            >
              <WorkStatusIcon status={status.icon} className="size-3.5" />
              <span className="truncate">{statusText(r, statusId)}</span>
            </span>
          ),
          billing:
            billing === "notInvoiced" ? null : (
              <span className={billing === "unpaid" ? "font-medium text-warning" : "text-muted-foreground"}>
                {BILLING_LABEL.get(billing)}
              </span>
            ),
        },
      };
    }),
  }));

  const columns = columnsFor(groupBy).filter((c) => !hideColumns?.includes(c.id));
  return (
    <ListTable
      fill
      narrowAt={narrowWidth(columns)}
      label={label}
      docShot={docShot}
      className={className}
      columns={columns}
      groups={tableGroups}
      titleHeader="Booking"
      titleSortable
      showHeader
      sort={sort}
      onSortChange={onSortChange}
      toolbar={<GroupByMenu value={groupBy} options={GROUP_BY_OPTIONS} onChange={(v) => onGroupByChange(asGroupBy(v))} />}
      empty={empty ?? <p className="px-4 py-6 text-[13px] text-muted-foreground">Nothing matches these filters.</p>}
    />
  );
}

/** The list's loading state, in its own columns, so nothing jumps when the bookings land. */
export function ReservationListSkeleton({
  groupBy,
  hideColumns,
  className,
}: {
  groupBy: ReservationGroupBy;
  hideColumns?: string[];
  className?: string;
}) {
  const columns = columnsFor(groupBy).filter((c) => !hideColumns?.includes(c.id));
  return <ListTableSkeleton fill columns={columns} narrowAt={narrowWidth(columns)} className={className} />;
}

/** Below this the columns would squeeze the title out: the columns, their gaps, and room for a title. */
function narrowWidth(columns: ListTableColumn[]): number {
  const rem = columns.reduce((sum, c) => sum + (Number.parseFloat(c.width) || 0), 0) + 2; // + the actions track
  const TITLE_MIN = 180;
  const GAPS_AND_PADDING = (columns.length + 1) * 12 + 24;
  return rem * 16 + TITLE_MIN + GAPS_AND_PADDING;
}

function whenText(r: Reservation, groupBy: ReservationGroupBy, tz: TimeZoneContext): string {
  const range = tz.range(r.start, r.end);
  return groupBy === "date" ? range : `${tz.date(r.start)}, ${range}`;
}
