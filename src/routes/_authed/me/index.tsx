import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, endOfDay, format, parseISO, startOfDay } from "date-fns";
import {
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  CircleDollarSign,
  Megaphone,
  PlaneTakeoff,
  Receipt,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { bookActionLabel, bookingNouns } from "@/lib/permissions";
import {
  useAnnouncements,
  useMemberInvoices,
  useMyBillingSettings,
  useMyCurrencies,
  useUserReservations,
} from "@/features/queries";
import type { Reservation, Role } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { CalendarGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import { ReservationCard } from "@/components/me/reservation-card";
import { currencyAttention } from "@/components/me/currency";
import { WeatherBadge } from "@/components/weather-badge";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { InstructionPartnersCard } from "@/components/me/instruction-partners-card";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";
import { AddFundsDialog } from "@/components/me-money/add-funds-dialog";

export const Route = createFileRoute("/_authed/me/")({
  component: MyDayPage,
});

const HORIZON_DAYS = 30;
const MAX_UPCOMING = 6;

function MyDayPage() {
  const { user, organization, userId, orgUserId, roles } = useAuth();
  const [addFundsOpen, setAddFundsOpen] = React.useState(false);

  const now = new Date();
  const startISO = startOfDay(now).toISOString();
  const endISO = endOfDay(addDays(now, HORIZON_DAYS)).toISOString();

  const reservationsQ = useUserReservations(userId, startISO, endISO);
  const invoicesQ = useMemberInvoices(orgUserId, { paid: false });
  const billingQ = useMyBillingSettings();
  const currenciesQ = useMyCurrencies();
  const announcementsQ = useAnnouncements();

  const reservations = React.useMemo(() => reservationsQ.data ?? [], [reservationsQ.data]);
  const bookLabel = bookActionLabel(roles);
  const bookings = bookingNouns(roles);
  // Same detail sheet the dispatch board opens, cancel and the ramp-out /
  // ramp-in / close-out flow behave identically here.
  // No `onStep` and no URL param: My day is a dashboard, not one ordered list, so
  // there is no "next record" for ↑/↓ to mean and nothing worth linking to.
  const {
    detail,
    open,
    setOpen,
    openDetail,
    cancelReservation,
    editing,
    setEditing,
    startEdit,
    cancelDialog,
    selectedId,
  } = useReservationDetail(reservations);

  if (organization === null) {
    return (
      <div>
        <PageHeader title={`Good ${daypart()}, ${firstName(user?.name)}`} />
        <Card>
          <EmptyState
            icon={UserRound}
            title="You're not in an organization yet"
            body="Accept an invite or ask your school's admin to add you, and your schedule, invoices and currencies will show up here."
          />
        </Card>
      </div>
    );
  }

  const upcoming = reservations
    .filter((r) => parseISO(r.end).getTime() >= now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0] as Reservation | undefined;
  const nextResource = next?.resource ? resourceLabel(next.resource).name : undefined;

  const outstanding = (invoicesQ.data ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0);
  const ledgerOn = billingQ.data?.ledgerEnabled === true;
  const accountBalance = billingQ.data?.balanceCents ?? 0;

  // Standing comes from the server's own flags, not a client-side date window.
  const att = currencyAttention(currenciesQ.data);

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

      <StatGrid>
        <StatCard
          label={`Next ${bookings.one}`}
          value={next ? format(parseISO(next.start), "EEE h:mm a") : "None"}
          hint={next ? (nextResource ?? "Unassigned") : "Nothing on the books"}
          icon={PlaneTakeoff}
          loading={reservationsQ.isLoading}
          to="/me/schedule"
        />
        <StatCard
          label={`Upcoming ${bookings.many}`}
          value={upcoming.length}
          hint={`next ${HORIZON_DAYS} days`}
          icon={CalendarClock}
          loading={reservationsQ.isLoading}
          to="/me/schedule"
        />
        {ledgerOn ? (
          <StatCard
            label="Account balance"
            value={formatMoney(accountBalance)}
            hint={
              accountBalance >= 0
                ? "Credit on account"
                : "Amount owed on account"
            }
            icon={Receipt}
            accent={accountBalance < 0 ? "warning" : "success"}
            loading={billingQ.isLoading}
            to="/me/invoices"
          />
        ) : (
          <StatCard
            label="Outstanding balance"
            value={formatMoney(outstanding)}
            hint={`${invoicesQ.data?.length ?? 0} unpaid ${
              (invoicesQ.data?.length ?? 0) === 1 ? "invoice" : "invoices"
            }`}
            icon={Receipt}
            accent={outstanding > 0 ? "warning" : "success"}
            loading={invoicesQ.isLoading}
            to="/me/invoices"
          />
        )}
        <StatCard
          label="Currency status"
          value={att.attention === 0 ? "All current" : `${att.attention} need attention`}
          hint={
            att.attention === 0
              ? "medicals, reviews, checkouts"
              : [
                  att.expired > 0 ? `${att.expired} expired` : null,
                  att.expiring > 0 ? `${att.expiring} expiring` : null,
                  att.notSignedOff > 0 ? `${att.notSignedOff} not signed off` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
          icon={att.attention === 0 ? BadgeCheck : ShieldCheck}
          accent={att.attention > 0 ? "warning" : "success"}
          loading={currenciesQ.isLoading}
          to="/me/currencies"
        />
      </StatGrid>

      {announcements.length > 0 && (
        <div className="mt-5 space-y-3">
          {announcements.map((a) => (
            <Link
              key={a.id}
              to="/operations/announcements"
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
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
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="relative transition-colors hover:bg-muted/30">
          <Link
            to="/me/schedule"
            aria-label="Open my schedule"
            className="absolute inset-0 z-0 rounded-xl"
          />
          <CardHeader className="relative z-10 flex-row items-center justify-between pointer-events-none">
            <CardTitle>Today &amp; upcoming</CardTitle>
            <span className="text-sm font-medium text-primary">Schedule</span>
          </CardHeader>
          <CardContent className="relative z-10 pt-0 pointer-events-none">
            {reservationsQ.isPending ? (
              <CalendarGridSkeleton />
            ) : reservationsQ.isError ? (
              <div className="pointer-events-auto">
                <ErrorState error={reservationsQ.error} onRetry={() => reservationsQ.refetch()} />
              </div>
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={`No upcoming ${bookings.many}`}
                body={`${bookLabel} and it'll show up here.`}
                action={
                  <div className="pointer-events-auto">
                    <Button asChild>
                      <Link to="/me/book">
                        <CalendarPlus className="size-4" /> {bookLabel}
                      </Link>
                    </Button>
                  </div>
                }
              />
            ) : (
              <>
                {/* Pre-flight weather for the NEXT flight only, sitting directly above it.
                    Hides itself entirely when the location isn't geocoded or the lookup
                    fails, so the list closes up as if it were never here. */}
                {next && (
                  <div className="pointer-events-auto">
                    <WeatherBadge
                      // The RESERVATION's location, not the resource's, the API returns
                      // `resource.location` as a bare { id } stub with no address, so the
                      // badge would never have coordinates to look weather up with.
                      location={(next as unknown as { location?: unknown }).location}
                      start={next.start}
                      timeZone={next.timeZoneName}
                      className="mb-3"
                    />
                  </div>
                )}
                <div className="pointer-events-auto max-h-[min(28rem,50vh)] overflow-y-auto">
                  <ul className="space-y-2">
                    {upcoming.slice(0, MAX_UPCOMING).map((r) => (
                      <li key={r.id}>
                        <ReservationCard
                          r={r}
                          showDate
                          onOpen={openDetail}
                          selected={r.id === selectedId}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
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
                <CalendarPlus className="size-4" /> {bookLabel}
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/me/schedule">
                <CalendarClock className="size-4" /> Schedule
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/me/invoices">
                <Wallet className="size-4" /> Billing
              </Link>
            </Button>
            {ledgerOn && orgUserId != null && (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setAddFundsOpen(true)}
              >
                <CircleDollarSign className="size-4" /> Add funds
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Renders nothing unless you instruct or study. */}
        <InstructionPartnersCard />
      </div>

      {ledgerOn && orgUserId != null && (
        <AddFundsDialog
          orgUserId={orgUserId}
          open={addFundsOpen}
          onOpenChange={setAddFundsOpen}
        />
      )}

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={{ date: new Date(editing.start) }}
          editing={editing}
        />
      )}

      <CancelReservationDialog {...cancelDialog} />

      <ReservationDetailSheet
        reservation={detail}
        open={open}
        onOpenChange={setOpen}
        onCancel={cancelReservation}
        onEdit={startEdit}
      />
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
