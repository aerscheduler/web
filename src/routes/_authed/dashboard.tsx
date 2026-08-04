import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, endOfDay, format, isToday, parseISO, startOfDay } from "date-fns";
import {
  ArrowUpRight,
  CalendarClock,
  PlaneTakeoff,
  Receipt,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useInvoices, useMembers, usePlanes, useReservations } from "@/features/queries";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMoney } from "@/lib/utils";
import { resourceLabel, type Reservation } from "@/types/api";
import { canManageBilling, guardRoute } from "@/lib/permissions";

export const Route = createFileRoute("/_authed/dashboard")({
  beforeLoad: guardRoute("/dashboard"),
  component: DashboardPage,
});

const RES_TONE: Record<string, string> = {
  dual: "bg-primary",
  instructor: "bg-primary",
  solo: "bg-[var(--success)]",
  ground: "bg-[var(--warning)]",
  sim: "bg-violet-500",
  maintenance: "bg-destructive",
};

function DashboardPage() {
  const { user, organization, roles } = useAuth();

  /**
   * This page is staff — admin OR dispatcher — but the money on it is admin-only
   * on the server. A dispatcher used to load it and fire two 403s, then be shown
   * "$0 outstanding" and "nothing billed in the last two weeks" built from the
   * empty arrays those failures left behind. Blocked and zero are not the same
   * answer, and the second one is a number somebody could act on.
   *
   * So the money is asked for only by the people allowed to have it, and the
   * board simply doesn't carry those two panels for anyone else.
   */
  const canSeeMoney = canManageBilling(roles);

  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const weekEnd = endOfDay(addDays(now, 7)).toISOString();
  const twoWeeksAgo = startOfDay(addDays(now, -14)).toISOString();

  const planes = usePlanes();
  const members = useMembers();
  const week = useReservations(todayStart, weekEnd);
  const unpaid = useInvoices({ paid: false }, { enabled: canSeeMoney });
  const recent = useInvoices({ startDate: twoWeeksAgo }, { enabled: canSeeMoney });

  const outstanding = (unpaid.data ?? []).reduce((s, i) => s + (i.total ?? 0), 0);
  const todays = (week.data ?? [])
    .filter((r) => isToday(parseISO(r.start)))
    .sort((a, b) => a.start.localeCompare(b.start));
  const recentInvoices = [...(recent.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  if (organization === null) return <NoOrg />;

  /**
   * A day-one operation has nothing to put in these tiles, and four zeros and two
   * empty panels is a worse first impression than an honest "this fills in as you
   * go". The checklist above is what that screen is FOR.
   *
   * The test is ACTIVITY, not inventory: "1 aircraft, 1 person, 0 flights, $0" is
   * still a board of zeros dressed up as data. Nothing flown and nothing billed means
   * there is genuinely nothing here to read.
   */
  const loadingCounts =
    week.isLoading || (canSeeMoney && (unpaid.isLoading || recent.isLoading));
  const noDataYet =
    !loadingCounts &&
    (week.data?.length ?? 0) === 0 &&
    // For a dispatcher these two never ran, so they are not evidence of
    // anything — only the schedule can say whether this school is new.
    (!canSeeMoney ||
      ((unpaid.data?.length ?? 0) === 0 && (recent.data?.length ?? 0) === 0));

  return (
    <div>
      <PageHeader
        title={`Good ${daypart()}, ${firstName(user?.name)}`}
        subtitle={`${organization?.name ?? "Your organization"} · ${format(now, "EEEE, MMM d")}`}
      />

      {/* The dashboard IS the rest of onboarding. While setup is unfinished this
          leads the page; it retires itself for good once everything's done. */}
      <SetupChecklist className="mb-5" />

      {noDataYet ? (
        <FirstDayNote />
      ) : (
        <>
      <div
        className={
          canSeeMoney
            ? "grid grid-cols-2 gap-4 lg:grid-cols-4"
            : "grid grid-cols-2 gap-4 lg:grid-cols-3"
        }
      >
        <StatCard
          label="Aircraft"
          value={planes.data?.length ?? 0}
          icon={PlaneTakeoff}
          loading={planes.isLoading}
          hint="in your fleet"
        />
        <StatCard
          label="People"
          value={members.data?.length ?? 0}
          icon={Users}
          loading={members.isLoading}
          hint="active members"
        />
        <StatCard
          label="Flights · next 7 days"
          value={week.data?.length ?? 0}
          icon={CalendarClock}
          loading={week.isLoading}
          hint={`${todays.length} today`}
        />
        {canSeeMoney && (
          <StatCard
            label="Outstanding"
            value={formatMoney(outstanding, { cents: false })}
            icon={Receipt}
            loading={unpaid.isLoading}
            accent="warning"
            hint={`${unpaid.data?.length ?? 0} unpaid invoices`}
          />
        )}
      </div>

      <div
        className={
          canSeeMoney ? "mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]" : "mt-5 grid gap-4"
        }
      >
        {/* Today's schedule */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Today&rsquo;s schedule</CardTitle>
            <Link
              to="/schedule"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Full schedule <ArrowUpRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {week.isLoading ? (
              <RowSkeletons />
            ) : todays.length === 0 ? (
              <Empty
                icon={CalendarClock}
                title="Nothing on the ramp today"
                body="No reservations scheduled for today."
              />
            ) : (
              <div className="max-h-[min(28rem,50vh)] overflow-y-auto">
                <ul className="divide-y divide-border">
                  {todays.map((r) => (
                    <ScheduleRow key={r.id} r={r} />
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent invoices — admin only; see canSeeMoney above. */}
        {canSeeMoney && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent invoices</CardTitle>
            <Link
              to="/billing"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Billing <ArrowUpRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.isLoading ? (
              <RowSkeletons rows={5} />
            ) : recentInvoices.length === 0 ? (
              <Empty icon={Receipt} title="No recent invoices" body="Nothing billed in the last two weeks." />
            ) : (
              <div className="max-h-[min(28rem,50vh)] overflow-y-auto">
                <ul className="divide-y divide-border">
                  {recentInvoices.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {i.customer?.user?.name ?? `Invoice #${i.id}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(i.createdAt, "MMM d")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium tabular-nums">
                          {formatMoney(i.total)}
                        </span>
                        {i.voidedAt ? (
                          <Badge variant="outline">Void</Badge>
                        ) : i.paidAt ? (
                          <Badge variant="success">Paid</Badge>
                        ) : (
                          <Badge variant="warning">Due</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>
        </>
      )}
    </div>
  );
}

/** Stands in for the tiles and panels before there is anything to put in them. */
function FirstDayNote() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
          <PlaneTakeoff className="size-5" />
        </span>
        <div className="text-sm font-medium">Your dashboard fills in as you fly</div>
        <p className="max-w-sm text-xs text-muted-foreground">
          Today&rsquo;s board, outstanding money and fleet activity all show up here as soon as
          there&rsquo;s something on the schedule. Book a flight and this page comes alive on its
          own.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-2">
          <Link to="/schedule">
            Open the schedule <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ScheduleRow({ r }: { r: Reservation }) {
  const res = r.resource ? resourceLabel(r.resource) : null;
  const people =
    (r.personnel?.instructors?.length ?? 0) +
    (r.personnel?.students?.length ?? 0) +
    (r.personnel?.renters?.length ?? 0);
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={`mt-0.5 size-2 shrink-0 rounded-full ${RES_TONE[r.type] ?? "bg-muted-foreground"}`} />
      <div className="w-16 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
        {format(parseISO(r.start), "h:mm a")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{r.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {res ? `${res.name} · ` : ""}
          {r.type}
          {people > 0 ? ` · ${people} on board` : ""}
        </div>
      </div>
    </li>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof CalendarClock;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="text-sm font-medium">{title}</div>
      <div className="max-w-xs text-xs text-muted-foreground">{body}</div>
    </div>
  );
}

function RowSkeletons({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

function NoOrg() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <PlaneTakeoff className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Let&rsquo;s get your operation flying</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account isn&rsquo;t attached to a flight school yet. Set one up in about two
          minutes — or ask an admin to invite you, then reload.
        </p>
        <Button asChild className="mt-6">
          <Link to="/onboarding">Set up your operation</Link>
        </Button>
      </div>
    </div>
  );
}

function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] ?? "there";
}
function daypart() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
