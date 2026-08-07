import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarClock,
  Fuel,
  Gauge,
  MapPin,
  Pencil,
  PlaneTakeoff,
  Undo2,
  UserCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type { Resource } from "@/types/api";
import { useLocations, useResource, useResourceApprovedPilots } from "@/features/queries";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { resourceViewAccess, type ResourceViewAccess } from "@/lib/permissions";
import { formatDate, formatMoney, initials } from "@/lib/utils";
import { planeRate, planeStatus, planeTitle } from "@/components/aircraft/lib";
import { AircraftFormModal } from "@/components/aircraft/aircraft-form";
import { GroundModal } from "@/components/aircraft/ground-modal";
import { ApproveRentersSheet } from "@/components/aircraft/approve-renters-sheet";
import { ResourceMetrics } from "@/components/aircraft/detail/resource-metrics";
import { ResourceSchedule } from "@/components/aircraft/detail/resource-schedule";
import {
  ResourceReminders,
  ResourceSquawks,
} from "@/components/aircraft/detail/resource-maintenance";
import { DateRangePicker } from "@/components/billing/date-range-picker";
import {
  CardEmpty,
  CardSkeleton,
  DetailBack,
  DetailCard,
  DetailHeader,
  KeyValue,
  KeyValueList,
  MetaItem,
  RecordNotFound,
  isMissingRecord,
  useDetailTitle,
} from "@/components/detail/detail-page";
import { useDetailRange } from "@/components/detail/use-detail-range";
import { useConfirm } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/states";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One aircraft, in full.
 *
 * Sibling of the fleet list rather than a child of it, for the same reason as
 * the person page — see `people_.$orgUserId`. The URL is still
 * `/aircraft/:id`.
 *
 * What a viewer gets is decided by `resourceViewAccess`: a technician opens this
 * for the squawks and the meters, a dispatcher for utilization and the board, an
 * admin for all of it plus what the tail earned. Everyone else still gets the
 * aircraft and its schedule, which is what the fleet list already showed them.
 *
 * Sections sit in a left rail (same shell as Settings / course detail) so the
 * page can grow without stacking every card into one scroll.
 */
export const Route = createFileRoute("/_authed/aircraft_/$resourceId")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: AircraftDetailPage,
});

function AircraftDetailPage() {
  const { resourceId: param } = Route.useParams();
  const id = Number.parseInt(param, 10);
  const q = useResource(Number.isFinite(id) ? id : null);
  const resource = q.data ?? null;

  // A bad id, an id from another organization, and an id that has been deleted
  // all land here. The server can't distinguish them for us without confirming
  // records exist outside your org, so the page says the one true thing: it
  // isn't here, and here's the way back.
  const missing =
    !Number.isFinite(id) ||
    isMissingRecord(q.error) ||
    // Nothing in flight and nothing to show. Any state that isn't "still
    // asking" and isn't a record is this page's not-found, whatever React
    // Query calls it internally.
    (!q.isLoading && !q.isError && resource == null);

  if (missing) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={PlaneTakeoff}
          title="Aircraft not found"
          body="That link doesn't point at anything in this fleet — it may have been removed."
          backTo="/aircraft"
          backLabel="Back to Aircraft"
        />
      </PageFrame>
    );
  }

  // `isLoading`, not `isPending`: in React Query v5 `isPending` means "no data",
  // which stays true for a query that has finished and has nothing to show —
  // so a skeleton keyed on it can outlive the answer and spin forever. This
  // page reproduced exactly that on a bad id. `isLoading` is `isPending &&
  // isFetching`, i.e. a request is genuinely in flight.
  if (q.isLoading) {
    return (
      <PageFrame>
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </PageFrame>
    );
  }

  // This page is the AIRCRAFT page — its copy says "didn't fly", its Edit opens
  // the aircraft form, and its back link goes to the fleet. A simulator or a
  // classroom reached by URL used to render inside all of that, which put the
  // plane form on a sim. Facilities is where those live.
  if (resource && !resource.type?.plane) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={PlaneTakeoff}
          title={`${resourceKindLabel(resource)} — not an aircraft`}
          body="Simulators and ground-school rooms are managed under Facilities."
          backTo="/facilities"
          backLabel="Go to Facilities"
        />
      </PageFrame>
    );
  }

  if (q.isError || !resource) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      </PageFrame>
    );
  }

  return <ResourceBody resource={resource} />;
}

function sectionsFor(access: ResourceViewAccess): RailSection[] {
  const items = [
    { value: "overview", label: "Overview", icon: PlaneTakeoff },
    ...(access.metrics
      ? [{ value: "metrics", label: "Utilization", icon: Gauge }]
      : []),
    { value: "schedule", label: "Schedule", icon: CalendarClock },
    ...(access.maintenance
      ? [{ value: "maintenance", label: "Maintenance", icon: Wrench }]
      : []),
    ...(access.approvedPilots
      ? [{ value: "approved-renters", label: "Approved renters", icon: UserCheck }]
      : []),
  ];
  return [{ items }];
}

function ResourceBody({ resource }: { resource: Resource }) {
  const { roles } = useAuth();
  const access = resourceViewAccess(roles);
  const { range, setRange, window } = useDetailRange(90);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const locationsQ = useLocations({ enabled: access.manage });
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();

  const sections = sectionsFor(access);
  const allowed = sections.flatMap((s) => s.items.map((i) => i.value));
  const active = tab && allowed.includes(tab) ? tab : "overview";
  const pick = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true });
  };

  const [editing, setEditing] = useState(false);
  const [grounding, setGrounding] = useState(false);
  const [approving, setApproving] = useState(false);

  const plane = resource.type?.plane ?? null;
  const status = plane ? planeStatus(plane) : null;
  const rate = plane ? planeRate(plane) : null;

  const unground = useMutation({
    mutationFn: () =>
      api<Resource>(`/resources/${resource.id}`, {
        method: "PATCH",
        body: { type: { plane: { grounded: false, groundedReason: null } } },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });

  // A non-plane resource (a sim or a room) can still be linked here; show what
  // there is rather than a broken page built entirely around a tail number.
  const title = plane?.tailNumber ?? resource.type?.simulator?.name ?? `Resource #${resource.id}`;
  useDetailTitle(title);

  async function toggleGround() {
    if (!plane) return;
    if (!plane.grounded) {
      setGrounding(true);
      return;
    }
    const ok = await confirm({
      title: `Return ${plane.tailNumber} to service?`,
      description: "This aircraft will be schedulable again.",
      confirmLabel: "Return to service",
    });
    if (!ok) return;
    unground.mutate(undefined, {
      onSuccess: () => toast.success(`${plane.tailNumber} returned to service`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't update aircraft"),
    });
  }

  const needsRange = active === "metrics" || active === "schedule";

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <DetailBack to="/aircraft" label="Aircraft" />

        <DetailHeader
          media={
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground">
              {resource.featuredImage ? (
                <img
                  src={resource.featuredImage}
                  alt={title}
                  className="size-full object-cover"
                />
              ) : (
                <PlaneTakeoff className="size-7" />
              )}
            </span>
          }
          title={title}
          titleClassName="font-mono"
          badges={status ? <Badge variant={status.variant}>{status.label}</Badge> : undefined}
          subtitle={plane ? planeTitle(plane) : resourceKindLabel(resource)}
          meta={
            <>
              <MetaItem icon={MapPin}>{resource.location?.name ?? "No home base"}</MetaItem>
              {rate && (
                <MetaItem icon={PlaneTakeoff}>
                  {formatMoney(rate.cents)} {rate.basis}
                  {rate.per}
                </MetaItem>
              )}
              {plane?.fuelCapacity != null && (
                <MetaItem icon={Fuel}>
                  {plane.fuelCapacity} {plane.fuelMeasurement ?? "gallons"}
                </MetaItem>
              )}
            </>
          }
          actions={
            access.manage ? (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button variant="outline" onClick={() => setApproving(true)}>
                  <UserCheck className="size-4" /> Approve renters
                </Button>
                <Button
                  variant={plane?.grounded ? "outline" : "destructive"}
                  onClick={() => void toggleGround()}
                  disabled={!plane || unground.isPending}
                >
                  {plane?.grounded ? (
                    <>
                      <Undo2 className="size-4" /> Return to service
                    </>
                  ) : (
                    <>
                      <Ban className="size-4" /> Ground
                    </>
                  )}
                </Button>
              </>
            ) : undefined
          }
        />

        {plane?.grounded && (
          <div className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-destructive">
            <span className="font-medium">Grounded:</span>{" "}
            {plane.groundedReason?.trim() || "No reason recorded."}
          </div>
        )}
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="Aircraft" sections={sections} value={active} onChange={pick} />

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto">
          {needsRange && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                {active === "metrics"
                  ? `Utilization${access.money ? " and revenue" : ""} over the selected window.`
                  : "Flights on this aircraft over the selected window."}
              </p>
              <DateRangePicker value={range} onChange={setRange} />
            </div>
          )}

          {active === "overview" && (
            <DetailCard title="Aircraft">
              <KeyValueList>
                {plane && (
                  <>
                    <KeyValue label="Hobbs" mono>
                      {(plane.hobbsTime / 10).toFixed(1)}
                    </KeyValue>
                    <KeyValue label="Tach" mono>
                      {(plane.tachTime / 10).toFixed(1)}
                    </KeyValue>
                    <KeyValue label="Rate">
                      {rate ? (
                        <span className="tabular-nums">
                          {formatMoney(rate.cents)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {rate.basis}
                            {rate.per}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not set</span>
                      )}
                    </KeyValue>
                    <KeyValue label="Billed on">
                      {plane.cost?.billByHobbsTime ? "Hobbs time" : "Tach time"}
                    </KeyValue>
                    <KeyValue label="Category & class">{plane.categoryClass || "—"}</KeyValue>
                  </>
                )}
                <KeyValue label="Home base">{resource.location?.name ?? "—"}</KeyValue>
                <KeyValue label="Added">{formatDate(resource.createdAt)}</KeyValue>
              </KeyValueList>
            </DetailCard>
          )}

          {active === "metrics" && access.metrics && (
            <ResourceMetrics
              resourceId={resource.id}
              range={window}
              showMoney={access.money}
            />
          )}

          {active === "schedule" && (
            <ResourceSchedule resourceId={resource.id} range={window} canBook />
          )}

          {active === "maintenance" && access.maintenance && (
            <>
              {/* Inspections above squawks: what's coming due is the standing question a
                  mechanic opens this page with, and squawks are the exception. */}
              <ResourceReminders
                resourceId={resource.id}
                resource={resource}
                canManage={access.resolveSquawks}
              />
              <ResourceSquawks
                resource={resource}
                canResolve={access.resolveSquawks}
                canReport={access.reportSquawk}
              />
            </>
          )}

          {active === "approved-renters" && access.approvedPilots && (
            <ApprovedPilots resource={resource} />
          )}
        </div>
      </div>

      {access.manage && (
        <>
          <AircraftFormModal
            open={editing}
            onOpenChange={setEditing}
            resource={resource}
            locations={locationsQ.data ?? []}
          />
          <GroundModal
            open={grounding}
            onOpenChange={setGrounding}
            resource={resource}
          />
          <ApproveRentersSheet
            open={approving}
            onOpenChange={setApproving}
            resource={resource}
          />
        </>
      )}
    </TableView>
  );
}

/**
 * Renters checked out on this tail.
 *
 * Assembled by asking each renter what they're approved for, since the server
 * has no read in the other direction (see `useResourceApprovedPilots`). The
 * truncation note is deliberate: a school past the fan-out limit should be told
 * the list is partial rather than shown a short list that looks complete.
 */
function ApprovedPilots({ resource }: { resource: Resource }) {
  const q = useResourceApprovedPilots(resource.id);
  const pilots = q.data ?? [];

  return (
    <DetailCard
      title="Approved renters"
      description="Renters checked out to book this aircraft."
    >
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : q.isError ? (
        <CardEmpty>Couldn&apos;t load approvals.</CardEmpty>
      ) : q.renterCount === 0 ? (
        <CardEmpty>
          No renters in this organization yet — grant the renter role from{" "}
          <Link to="/people" className="underline underline-offset-2">
            People
          </Link>
          .
        </CardEmpty>
      ) : pilots.length === 0 ? (
        <CardEmpty>Nobody is approved on this tail yet.</CardEmpty>
      ) : (
        <ul className="space-y-1.5">
          {pilots.map((m) => {
            const name = m.user?.name ?? `Member #${m.id}`;
            return (
              <li key={m.id}>
                <Link
                  to="/people/$orgUserId"
                  params={{ orgUserId: String(m.id) }}
                  className="-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/40"
                >
                  <Avatar className="size-7">
                    {m.profileImage && <AvatarImage src={m.profileImage} alt={name} />}
                    <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-[13px] font-medium">{name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {q.truncated && (
        <p className="mt-3 text-xs text-muted-foreground">
          Checked the first 60 of {q.renterCount} renters — there may be more approved.
        </p>
      )}
    </DetailCard>
  );
}

function resourceKindLabel(r: Resource): string {
  if (r.type?.simulator) return "Simulator";
  if (r.type?.room) return "Ground school room";
  return "Resource";
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 pb-8">
      <DetailBack to="/aircraft" label="Aircraft" />
      {children}
    </div>
  );
}
