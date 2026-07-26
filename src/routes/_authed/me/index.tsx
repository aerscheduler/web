import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, endOfDay, format, parseISO, startOfDay } from "date-fns";
import {
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  Megaphone,
  PlaneTakeoff,
  Receipt,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useAnnouncements,
  useMemberInvoices,
  useMyCurrencies,
  useUserReservations,
} from "@/features/queries";
import type { Reservation, Role } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CalendarGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { ReservationCard } from "@/components/me/reservation-card";
import { currencyAttention } from "@/components/me/currency";
import { WeatherBadge } from "@/components/weather-badge";

export const Route = createFileRoute("/_authed/me/")({
  component: MyDayPage,
});

const HORIZON_DAYS = 30;
const MAX_UPCOMING = 6;

function MyDayPage() {
  const { user, organization, userId, orgUserId, roles } = useAuth();

  const now = new Date();
  const startISO = startOfDay(now).toISOString();
  const endISO = endOfDay(addDays(now, HORIZON_DAYS)).toISOString();

  const reservationsQ = useUserReservations(userId, startISO, endISO);
  const invoicesQ = useMemberInvoices(orgUserId, { paid: false });
  const currenciesQ = useMyCurrencies();
  const announcementsQ = useAnnouncements();

  if (organization === null) {
    return (
      <div>
        <PageHeader title={`Good ${daypart()}, ${firstName(user?.name)}`} />
        <Card>
          <EmptyState
            icon={UserRound}
            title="You're not in an organization yet"
            body="Accept an invite or ask your school's admin to add you, and your flights, invoices and currencies will show up here."
          />
        </Card>
      </div>
    );
  }

  const upcoming = (reservationsQ.data ?? [])
    .filter((r) => parseISO(r.end).getTime() >= now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0] as Reservation | undefined;
  const nextResource = next?.resource ? resourceLabel(next.resource).name : undefined;

  const outstanding = (invoicesQ.data ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0);

  const att = currencyAttention(currenciesQ.data, now, HORIZON_DAYS);

  const announcements = [...(announcementsQ.data ?? [])]
    .filter((a) => !a.expireAt || parseISO(a.expireAt).getTime() >= now.getTime())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 2);

  return (
    <div>
      <PageHeader
        title={`Good ${daypart()}, ${firstName(user?.name)}`}
        subtitle={`${roleSummary(roles)} · ${organization.name} · ${format(now, "EEEE, MMM d")}`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Next flight"
          value={next ? format(parseISO(next.start), "EEE h:mm a") : "None"}
          hint={next ? (nextResource ?? "Unassigned") : "Nothing on the books"}
          icon={PlaneTakeoff}
          loading={reservationsQ.isLoading}
        />
        <StatCard
          label="Upcoming flights"
          value={upcoming.length}
          hint={`next ${HORIZON_DAYS} days`}
          icon={CalendarClock}
          loading={reservationsQ.isLoading}
        />
        <StatCard
          label="Outstanding balance"
          value={formatMoney(outstanding)}
          hint={`${invoicesQ.data?.length ?? 0} unpaid ${
            (invoicesQ.data?.length ?? 0) === 1 ? "invoice" : "invoices"
          }`}
          icon={Receipt}
          accent={outstanding > 0 ? "warning" : "success"}
          loading={invoicesQ.isLoading}
        />
        <StatCard
          label="Currency status"
          value={att.attention === 0 ? "All current" : `${att.attention} need attention`}
          hint={
            att.attention === 0
              ? "medicals, reviews, checkouts"
              : `${att.expired} expired · ${att.expiring} expiring`
          }
          icon={att.attention === 0 ? BadgeCheck : ShieldCheck}
          accent={att.attention > 0 ? "warning" : "success"}
          loading={currenciesQ.isLoading}
        />
      </div>

      {announcements.length > 0 && (
        <div className="mt-5 space-y-3">
          {announcements.map((a) => (
            <Card
              key={a.id}
              className="border-primary/30 bg-primary/5 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Megaphone className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{a.message}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Today &amp; upcoming</CardTitle>
            <Link
              to="/me/schedule"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Calendar
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {reservationsQ.isLoading ? (
              <CalendarGridSkeleton />
            ) : reservationsQ.isError ? (
              <ErrorState error={reservationsQ.error} onRetry={() => reservationsQ.refetch()} />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No upcoming flights"
                body="Book a flight and it'll show up here."
                action={
                  <Button asChild>
                    <Link to="/me/book">
                      <CalendarPlus className="size-4" /> Book a flight
                    </Link>
                  </Button>
                }
              />
            ) : (
              <>
                {/* Pre-flight weather for the NEXT flight only, sitting directly above it.
                    Hides itself entirely when the location isn't geocoded or the lookup
                    fails, so the list closes up as if it were never here. */}
                {next && (
                  <WeatherBadge
                    // The RESERVATION's location, not the resource's — the API returns
                    // `resource.location` as a bare { id } stub with no address, so the
                    // badge would never have coordinates to look weather up with.
                    location={(next as unknown as { location?: unknown }).location}
                    start={next.start}
                    timeZone={next.timeZoneName}
                    className="mb-3"
                  />
                )}
                <ul className="space-y-2">
                  {upcoming.slice(0, MAX_UPCOMING).map((r) => (
                    <li key={r.id}>
                      <ReservationCard r={r} showDate />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            <Button asChild className="justify-start">
              <Link to="/me/book">
                <CalendarPlus className="size-4" /> Book a flight
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/me/schedule">
                <CalendarClock className="size-4" /> Calendar
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/me/invoices">
                <Receipt className="size-4" /> Invoices
              </Link>
            </Button>
          </CardContent>
        </Card>
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

function roleSummary(roles: Role[]): string {
  if (roles.length === 0) return "Member";
  return roles
    .slice(0, 2)
    .map((r) => r.charAt(0).toUpperCase() + r.slice(1))
    .join(" · ");
}
