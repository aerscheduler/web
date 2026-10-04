import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { CalendarClock, ChevronDown, ChevronRight, CircleCheck, Gauge, MessageSquareWarning, PlaneTakeoff, Receipt, Wallet, Wrench } from "lucide-react";
import type { OwnerAircraft, OwnerDueItem } from "@/types/api";
import { useMemberInvoices, useOwnerAircraft } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { cn, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { EmptyState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RecordMeterReadingModal } from "@/components/aircraft/detail/aircraft-meters-card";
import { GROUNDED_TONE, JobStatus, RequestWorkModal, dueText, dueTone, firstApplicable } from "@/components/owner/owner-parts";
import { WorkTag } from "@/components/maintenance/inspection-list";
import { YourDocumentsCard } from "@/components/owner/owner-files";
import { isPastDue } from "@/lib/payment-methods";

/**
 * What owning an aircraft adds to the home page (Murray spec sections 7 and 17; Tony,
 * 2026-10-01: "like any other user's home page"). A member who also owns an aircraft here gets
 * these sections below their own day; an owner from outside the organization gets only these,
 * in the same layout: the same header, stat tiles and cards every member's home is made of.
 */

const hours = (tenths: number) => (tenths / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** May the owner record this aircraft's times: a customer aircraft of theirs, with meters. */
const mayTime = (a: OwnerAircraft) => a.owns && a.use === "shop" && a.meterMode !== "none";

/** The home page of an aircraft owner from outside the organization. */
export function OutsideOwnerHome() {
  const { user, organization, orgUserId } = useAuth();
  const q = useOwnerAircraft();
  const invoicesQ = useMemberInvoices(orgUserId, { paid: false, voided: false });
  const aircraft = q.data ?? [];
  const needs = needsOf(aircraft);
  const next = mostUrgent(aircraft);
  // Aircraft they own: one they are only billed on is listed for its bill, but is not theirs.
  const owned = aircraft.filter((a) => a.owns);
  const inShop = owned.filter((a) => a.currentJob && a.currentJob.status !== "requested" && a.currentJob.status !== "scheduled").length;
  const owed = (invoicesQ.data ?? []).reduce((sum, i) => sum + (i.total ?? 0), 0);
  const now = new Date();

  return (
    <div>
      <PageHeader
        title={`Good ${daypart()}, ${firstName(user?.name)}`}
        subtitle={`Aircraft owner · ${organization?.name ?? "Your shop"} · ${format(now, "EEEE, MMM d")}`}
      />

      <StatGrid>
        <StatCard
          label="Your aircraft"
          value={owned.length}
          hint={owned.length === 0 ? "None recorded yet" : inShop === 0 ? "None in the shop" : `${inShop} in the shop`}
          icon={PlaneTakeoff}
          loading={q.isLoading}
        />
        <StatCard
          label="Needs you"
          value={needs.length === 0 ? "Nothing" : needs.length}
          hint={needs.length === 0 ? "You're all caught up" : needsHint(needs)}
          icon={needs.length === 0 ? CircleCheck : MessageSquareWarning}
          accent={needs.length > 0 ? "warning" : "success"}
          loading={q.isLoading}
        />
        <StatCard
          label="Outstanding balance"
          value={formatMoney(owed)}
          hint={`${invoicesQ.data?.length ?? 0} unpaid ${(invoicesQ.data?.length ?? 0) === 1 ? "invoice" : "invoices"}`}
          icon={Receipt}
          accent={owed > 0 ? "warning" : "success"}
          loading={invoicesQ.isLoading}
          to="/me/invoices"
        />
        <StatCard
          label="Next inspection"
          value={next ? dueValue(next.item) : "None due"}
          hint={next ? `${next.item.name ?? "Inspection"} · ${next.aircraft.tailNumber ?? "Aircraft"}` : "Nothing tracked yet"}
          icon={CalendarClock}
          accent={next && next.item.status !== "ok" ? "warning" : "primary"}
          loading={q.isLoading}
        />
      </StatGrid>

      {q.isError ? (
        <Card className="mt-5">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <YourAircraftCard aircraft={aircraft} loading={q.isPending} />
          <div className="flex flex-col gap-4">
            <NeedsYouCard aircraft={aircraft} />
            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-0">
                {/* One filled button on the page, as on every home: Review, while something waits. */}
                <OwnerActions aircraft={aircraft} primary={needs.length === 0} />
                <Button asChild variant="outline" className="justify-start">
                  <Link to="/me/invoices">
                    <Wallet className="size-4" /> Invoices
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <YourDocumentsCard />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * For a member who also owns an aircraft here (a leaseback, or one in for work): their aircraft
 * and what needs them, below their own day. Nothing at all for everybody else.
 */
export function MemberOwnerSections() {
  const q = useOwnerAircraft();
  const aircraft = q.data ?? [];
  if (aircraft.length === 0) return null;
  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
      <YourAircraftCard aircraft={aircraft} loading={false} />
      <NeedsYouCard aircraft={aircraft} />
    </div>
  );
}

/**
 * Request work and Update times, for a home page's Quick actions. With one aircraft each is a
 * button; with several, it asks which. Renders nothing for somebody who owns none.
 */
export function OwnerActions({ aircraft: given, primary = false }: { aircraft?: OwnerAircraft[]; primary?: boolean }) {
  const q = useOwnerAircraft({ enabled: given === undefined });
  const aircraft = given ?? q.data ?? [];
  const [asking, setAsking] = React.useState<OwnerAircraft | null>(null);
  const [timing, setTiming] = React.useState<OwnerAircraft | null>(null);
  const requestable = aircraft.filter((a) => a.owns);
  const timeable = aircraft.filter(mayTime);
  if (requestable.length === 0) return null;
  return (
    <>
      <PickAircraft aircraft={requestable} onPick={setAsking} variant={primary ? "default" : "outline"}>
        <Wrench className="size-4" /> Request work
      </PickAircraft>
      {timeable.length > 0 && (
        <PickAircraft aircraft={timeable} onPick={setTiming} variant="outline">
          <Gauge className="size-4" /> Update times
        </PickAircraft>
      )}
      {asking && <RequestWorkModal open onOpenChange={(o) => !o && setAsking(null)} aircraft={asking} />}
      {timing && <TimesModal a={timing} onClose={() => setTiming(null)} />}
    </>
  );
}

function PickAircraft({ aircraft, onPick, variant, children }: { aircraft: OwnerAircraft[]; onPick: (a: OwnerAircraft) => void; variant: "default" | "outline"; children: React.ReactNode }) {
  if (aircraft.length === 1) {
    return (
      <Button variant={variant} className="justify-start" onClick={() => onPick(aircraft[0])}>
        {children}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} className="justify-start">
          {children}
          <ChevronDown className="ml-auto size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
        {aircraft.map((a) => (
          // After the menu has closed and handed focus back to its button, so the dialog returns
          // focus there when it closes (opened from inside the menu, it returned it to nothing).
          <DropdownMenuItem key={a.id} onSelect={() => setTimeout(() => onPick(a), 0)}>
            <span className="font-mono font-medium">{a.tailNumber ?? "Aircraft"}</span>
            <span className="truncate text-muted-foreground">{[a.make, a.model].filter(Boolean).join(" ")}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TimesModal({ a, onClose }: { a: OwnerAircraft; onClose: () => void }) {
  return (
    <RecordMeterReadingModal
      open
      onOpenChange={(o) => !o && onClose()}
      resourceId={a.id}
      meterMode={a.meterMode}
      current={{ hobbsTime: a.hobbsTime ?? 0, tachTime: a.tachTime ?? 0 }}
      asOwner
      title={a.tailNumber ? `Update ${a.tailNumber}'s times` : "Update times"}
    />
  );
}

/** Each aircraft as one row: where its job stands, and the most urgent thing coming due. */
function YourAircraftCard({ aircraft, loading }: { aircraft: OwnerAircraft[]; loading: boolean }) {
  return (
    <Card data-doc-shot="owner-your-aircraft">
      <CardHeader>
        <CardTitle>Your aircraft</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : aircraft.length === 0 ? (
          <EmptyState
            icon={PlaneTakeoff}
            title="No aircraft yet"
            body="When the shop records you as an aircraft's owner, it shows here with the work on it and what is coming due."
          />
        ) : (
          <ul className="-mx-2 divide-y divide-border" aria-label="Your aircraft">
            {aircraft.map((a) => (
              <AircraftRow key={a.id} a={a} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AircraftRow({ a }: { a: OwnerAircraft }) {
  const j = a.currentJob;
  const due = firstApplicable(a.due);
  const body = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono font-semibold">{a.tailNumber ?? "Aircraft"}</span>
          <span className="truncate text-sm text-muted-foreground">{[a.year, a.make, a.model].filter(Boolean).join(" ")}</span>
        </div>
        {a.grounded && <p className={cn("text-sm", GROUNDED_TONE)}>Not airworthy until the shop returns it to service.</p>}
        {j ? (
          <>
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
              <JobStatus job={j} className="text-sm" />
              {j.promisedOn && <span className="text-muted-foreground">· Back by {format(parseISO(j.promisedOn), "EEE, MMM d")}</span>}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">{j.label}</span> {firstLine(j.request) ?? "Work with the shop"}
            </p>
          </>
        ) : a.owns ? (
          <p className="text-sm text-muted-foreground">Nothing open with the shop</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {a.unpaidInvoices.length > 0 ? `${formatMoney(a.unpaidInvoices.reduce((s, i) => s + i.totalCents, 0))} to pay for work on it` : "Nothing open billed to you"}
          </p>
        )}
        {a.needsAnswer > 0 && (
          <p className="text-sm font-medium text-warning">
            {/* Named by the job holding them: the job named above may be a newer request. */}
            {a.needsAnswer === 1 ? "A finding" : `${a.needsAnswer} findings`}
            {jobsWaiting(a).length ? ` on ${andList(jobsWaiting(a).map((w) => w.label))}` : ""} {a.needsAnswer === 1 ? "is" : "are"} waiting on your answer
          </p>
        )}
        {due && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={dueTone(due.status)}>{dueText(due)}</span>
            <WorkTag work={due.work} link={false} />
          </p>
        )}
      </div>
      {(a.owns || j) && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  const cls = "flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <li data-testid={`owner-aircraft-${a.id}`}>
      {a.owns ? (
        <Link to="/me/aircraft/$resourceId" params={{ resourceId: String(a.id) }} className={cls}>
          {body}
        </Link>
      ) : j ? (
        // One they are only billed on has no page of theirs: the row opens their job.
        <Link to="/me/jobs/$workOrderId" params={{ workOrderId: String(j.id) }} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cn(cls, "hover:bg-transparent")}>{body}</div>
      )}
    </li>
  );
}

type Need = { key: string; kind: "answer" | "pay" | "times"; icon: React.ReactNode; title: string; detail: string; a: OwnerAircraft; jobId?: number; invoiceId?: number };

/**
 * The jobs holding findings that wait on the owner, each with its count. An older server sends
 * only the first job and the aircraft's total: then that is the one row.
 */
function jobsWaiting(a: OwnerAircraft): { jobId: number; label: string | null; count: number }[] {
  if (a.needsAnswerJobs?.length) return a.needsAnswerJobs;
  return a.needsAnswer > 0 && a.needsAnswerJobId != null ? [{ jobId: a.needsAnswerJobId, label: null, count: a.needsAnswer }] : [];
}

/** "WO-1", "WO-1 and WO-2", "WO-1, WO-2 and WO-3". */
function andList(parts: (string | null)[]): string {
  const named = parts.filter((p): p is string => !!p);
  return named.length <= 1 ? (named[0] ?? "") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

function needsOf(aircraft: OwnerAircraft[]): Need[] {
  const out: Need[] = [];
  for (const a of aircraft) {
    const tail = a.tailNumber ?? "Your aircraft";
    // One row per job (L22): two jobs with findings waiting are two things to review, each
    // opening its own job.
    for (const j of jobsWaiting(a)) {
      out.push({
        key: `answer-${a.id}-${j.jobId}`,
        kind: "answer",
        icon: <MessageSquareWarning className="size-4 text-amber-600 dark:text-amber-400" />,
        title: `${j.count === 1 ? "A finding is" : `${j.count} findings are`} waiting on your answer`,
        detail: `${tail}${j.label ? `, ${j.label}` : ""}. The shop found ${j.count === 1 ? "something" : "a few things"} while working on it.`,
        a,
        jobId: j.jobId,
      });
    }
    for (const inv of a.unpaidInvoices) {
      out.push({
        key: `invoice-${inv.id}`,
        kind: "pay",
        icon: <Receipt className="size-4 text-primary" />,
        title: `${formatMoney(inv.totalCents)} to pay for ${inv.jobLabel}`,
        // Past due by the server's one overdue rule: unpaid and past a due date it has.
        detail: `${tail}${inv.dueAt ? `, ${isPastDue({ paidAt: null, voidedAt: null, dueAt: inv.dueAt }) ? "past due since" : "due"} ${format(parseISO(inv.dueAt), "MMM d")}` : ""}.`,
        a,
        invoiceId: inv.id,
      });
    }
    if (a.timesStale) {
      out.push({
        key: `times-${a.id}`,
        kind: "times",
        icon: <Gauge className="size-4 text-muted-foreground" />,
        title: `Update ${tail}'s times`,
        detail: a.daysSinceRead == null ? "The shop has no Hobbs or tach reading yet." : `Last read ${a.daysSinceRead} days ago. Inspections due by hours count from it.`,
        a,
      });
    }
  }
  return out;
}

function needsHint(needs: Need[]) {
  const count = (k: Need["kind"]) => needs.filter((n) => n.kind === k).length;
  const parts = [
    count("answer") ? `${count("answer")} to answer` : null,
    count("pay") ? `${count("pay")} to pay` : null,
    count("times") ? `${count("times")} to update` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** The few things waiting on the owner, each with the button that does it. */
function NeedsYouCard({ aircraft }: { aircraft: OwnerAircraft[] }) {
  const needs = needsOf(aircraft);
  const [timing, setTiming] = React.useState<OwnerAircraft | null>(null);
  return (
    <Card data-doc-shot="owner-needs-you">
      <CardHeader>
        <CardTitle>
          Needs you {needs.length > 0 && <span className="font-normal text-muted-foreground">{needs.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="@container pt-0">
        {needs.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-[var(--success)]" /> Nothing right now. The shop will let you know.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {needs.map((n) => (
              <li key={n.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0 @sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-muted">{n.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-[13px] text-muted-foreground">{n.detail}</p>
                </div>
                <div className="col-start-2 @sm:col-start-3 @sm:row-start-1">
                  {n.kind === "answer" ? (
                    <Button size="sm" asChild>
                      <Link to="/me/jobs/$workOrderId" params={{ workOrderId: String(n.jobId) }} hash="work">
                        Review
                      </Link>
                    </Button>
                  ) : n.kind === "pay" ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/me/invoices" search={{ invoice: n.invoiceId }}>
                        View and pay
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setTiming(n.a)}>
                      Update times
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {timing && <TimesModal a={timing} onClose={() => setTiming(null)} />}
    </Card>
  );
}

const STATUS_RANK: Record<string, number> = { overdue: 0, dueSoon: 1, ok: 2 };

/**
 * The next inspection across the owner's aircraft, by the rule the server orders each aircraft's
 * list with (`ownerDueOrder`): overdue, then due soon, then the rest, and within each the soonest
 * date; with no date to compare (hours), the shop's measure of how much is used up. Each row shows
 * its aircraft's first, so the tile and the rows always agree.
 */
function mostUrgent(aircraft: OwnerAircraft[]): { item: OwnerDueItem; aircraft: OwnerAircraft } | null {
  const all = aircraft.flatMap((a) => {
    const first = firstApplicable(a.due);
    return first ? [{ item: first, aircraft: a }] : [];
  });
  if (all.length === 0) return null;
  return all.sort((x, y) => dueOrder(x.item, y.item))[0];
}

function dueOrder(a: OwnerDueItem, b: OwnerDueItem): number {
  const band = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3);
  if (band !== 0) return band;
  if (a.daysRemaining != null && b.daysRemaining != null) return a.daysRemaining - b.daysRemaining;
  return (b.progress ?? -1) - (a.progress ?? -1);
}

function dueValue(d: OwnerDueItem): string {
  if (d.status === "overdue") return "Overdue";
  if (d.dueAt) return format(parseISO(d.dueAt), "MMM d");
  if (d.hoursRemaining != null) return `${hours(d.hoursRemaining)} hrs`;
  return "Not started";
}

function firstLine(text: string | null) {
  if (!text) return null;
  return text.split("\n")[0].trim() || null;
}

function firstName(name?: string | null) {
  return name?.trim().split(/\s+/)[0] ?? "there";
}

function daypart() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
