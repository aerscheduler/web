import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  PlaneTakeoff,
  ShieldCheck,
  UserX,
  Settings2,
} from "lucide-react";
import { usePlanes, useMembers, useCurrencyTypes } from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { rolesOf, resourceLabel } from "@/types/api";
import type { Resource, OrganizationUser } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState, ErrorState, CardGridSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authed/compliance")({
  beforeLoad: guardRoute("/compliance"),
  component: CompliancePage,
});

function CompliancePage() {
  const planes = usePlanes();
  const members = useMembers();
  const currencyTypes = useCurrencyTypes();


  const groundedAircraft = (planes.data ?? []).filter((r) => r.type?.plane?.grounded);
  const groundedMembers = (members.data ?? []).filter((m) => m.grounded);
  const noGoCount = groundedAircraft.length + groundedMembers.length;

  const loading = planes.isLoading || members.isLoading;
  const error = planes.error ?? members.error;


  return (
    <div className="space-y-5">
      <PageHeader
        title="Go / No-Go"
        subtitle="Who and what can't fly right now — grounded aircraft, grounded members, and the currencies you track."
        actions={
          // Currency RULES are org configuration (scope, expiry, renewal), so they
          // live in Settings. This board consumes their status; it doesn't define them.
          <Button asChild variant="outline">
            <Link to="/settings">
              <Settings2 className="size-4" /> Manage currency rules
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="No-go items"
          value={noGoCount}
          icon={AlertTriangle}
          accent={noGoCount > 0 ? "warning" : "success"}
          hint={noGoCount === 0 ? "All clear" : "Need attention"}
        />
        <StatCard label="Grounded aircraft" value={groundedAircraft.length} icon={PlaneTakeoff} accent={groundedAircraft.length ? "warning" : "success"} />
        <StatCard label="Grounded members" value={groundedMembers.length} icon={UserX} accent={groundedMembers.length ? "warning" : "success"} />
        <StatCard label="Currencies tracked" value={currencyTypes.data?.length ?? 0} icon={ShieldCheck} />
      </div>

      {loading ? (
        <CardGridSkeleton count={3} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void planes.refetch();
            void members.refetch();
          }}
        />
      ) : noGoCount === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={CheckCircle2}
            title="Everything's cleared to fly"
            body="No grounded aircraft or members right now. Ground an aircraft from the Aircraft page, or a member from People, and it shows up here."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groundedAircraft.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-muted-foreground">Grounded aircraft</h2>
              <div className="max-h-[min(28rem,50vh)] space-y-2.5 overflow-y-auto">
                {groundedAircraft.map((r) => (
                  <GroundedAircraftCard key={r.id} resource={r} />
                ))}
              </div>
            </section>
          )}
          {groundedMembers.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-muted-foreground">Grounded members</h2>
              <div className="max-h-[min(28rem,50vh)] space-y-2.5 overflow-y-auto">
                {groundedMembers.map((m) => (
                  <GroundedMemberCard key={m.id} member={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* currency types tracked */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-muted-foreground">Currencies tracked</h2>
        {currencyTypes.data && currencyTypes.data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currencyTypes.data.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1.5 py-1">
                <ShieldCheck className="size-3.5" /> {t.name}
              </Badge>
            ))}
          </div>
        ) : (
          <Card className="p-0">
            <EmptyState
              icon={ShieldCheck}
              title="Track medicals, flight reviews & checkouts"
              body="Add the currencies your operation enforces so nobody flies out of currency."
              action={
                <Button asChild size="sm">
                  <Link to="/settings">
                    <Settings2 className="size-4" /> Set up currency rules
                  </Link>
                </Button>
              }
            />
          </Card>
        )}
      </section>

    </div>
  );
}

function GroundedAircraftCard({ resource }: { resource: Resource }) {
  const plane = resource.type?.plane;
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
        <PlaneTakeoff className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{resourceLabel(resource).name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {plane?.groundedReason || "Grounded — no reason on file"}
        </div>
      </div>
      <Badge variant="secondary" className="shrink-0 border-warning/30 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
        Grounded
      </Badge>
    </Card>
  );
}

function GroundedMemberCard({ member }: { member: OrganizationUser }) {
  const name = member.user?.name ?? `Member #${member.id}`;
  const roles = rolesOf(member);
  return (
    <Card className="flex items-center gap-3 p-4">
      <Avatar className="size-10">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {roles.length ? roles.join(", ") : "Member"}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="danger" className="shrink-0">
            Grounded
          </Badge>
        </TooltipTrigger>
        <TooltipContent>This member is blocked from booking.</TooltipContent>
      </Tooltip>
    </Card>
  );
}
