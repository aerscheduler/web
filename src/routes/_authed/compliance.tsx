import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  PlaneTakeoff,
  ShieldCheck,
  UserX,
  Settings2,
} from "lucide-react";
import { usePlanes, useMembers, useCurrencyTypes } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canAccess, guardRoute } from "@/lib/permissions";
import { rolesOf, resourceLabel } from "@/types/api";
import type { Resource, OrganizationUser } from "@/types/api";
import { DocsHint } from "@/components/docs-hint";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatGrid } from "@/components/stat-card";
import { EmptyState, ErrorState, CardGridSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authed/compliance")({
  beforeLoad: guardRoute("/compliance"),
  component: CompliancePage,
});

function CompliancePage() {
  const { roles } = useAuth();
  const planes = usePlanes({ grounded: true });
  const members = useMembers({ grounded: true });
  const currencyTypes = useCurrencyTypes();
  const canManageCurrencyRules = canAccess("/settings", roles);

  const groundedAircraft = planes.data ?? [];
  const groundedMembers = members.data ?? [];
  const noGoCount = groundedAircraft.length + groundedMembers.length;

  const loading = planes.isLoading || members.isLoading || currencyTypes.isLoading;
  const error = planes.error ?? members.error ?? currencyTypes.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Go / No-Go"
        subtitle="Who and what can't fly right now, grounded aircraft, grounded members, and the currencies you track."
        actions={
          canManageCurrencyRules ? (
            // Currency RULES are org configuration (scope, expiry, renewal), so they
            // live in Settings. This board consumes their status; it doesn't define them.
            <Button asChild variant="outline">
              <Link to="/settings" search={{ tab: "currencies" }}>
                <Settings2 className="size-4" /> Manage currency rules
              </Link>
            </Button>
          ) : undefined
        }
      />

      <StatGrid>
        <StatCard
          label="No-go items"
          value={noGoCount}
          icon={AlertTriangle}
          accent={noGoCount > 0 ? "warning" : "success"}
          hint={noGoCount === 0 ? "All clear" : "Need attention"}
          loading={planes.isLoading || members.isLoading}
        />
        <StatCard
          label="Grounded aircraft"
          value={groundedAircraft.length}
          icon={PlaneTakeoff}
          accent={groundedAircraft.length ? "warning" : "success"}
          loading={planes.isLoading}
          to="/aircraft"
          search={{ grounded: true }}
        />
        <StatCard
          label="Grounded members"
          value={groundedMembers.length}
          icon={UserX}
          accent={groundedMembers.length ? "warning" : "success"}
          loading={members.isLoading}
          to="/people"
          search={{ grounded: true }}
        />
        <StatCard
          label="Currencies tracked"
          value={currencyTypes.data?.length ?? 0}
          icon={ShieldCheck}
          loading={currencyTypes.isLoading}
          {...(canManageCurrencyRules
            ? { to: "/settings" as const, search: { tab: "currencies" } }
            : {})}
        />
      </StatGrid>

      {loading ? (
        <CardGridSkeleton count={3} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void planes.refetch();
            void members.refetch();
            void currencyTypes.refetch();
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
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-muted-foreground">Currencies tracked</h2>
          <DocsHint topic="go-no-go-board" side="right" />
        </div>
        {currencyTypes.data && currencyTypes.data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currencyTypes.data.map((t) => (
              <Link
                key={t.id}
                to="/compliance/rules/$currencyTypeId"
                params={{ currencyTypeId: String(t.id) }}
                aria-label={`Open ${t.name} currency rule`}
                className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge key={t.id} variant="secondary" className="gap-1.5 py-1">
                  <ShieldCheck className="size-3.5" /> {t.name}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="p-0">
            <EmptyState
              icon={ShieldCheck}
              title="Track medicals, flight reviews & checkouts"
              body="Add the currencies your operation enforces so nobody flies out of currency."
              action={
                canManageCurrencyRules ? (
                  <Button asChild size="sm">
                    <Link to="/settings" search={{ tab: "currencies" }}>
                      <Settings2 className="size-4" /> Set up currency rules
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}
      </section>

    </div>
  );
}

/**
 * The inside of one no-go row, shared by the aircraft and member cards.
 *
 * Always three lines, and every line always has content, so an aircraft card and
 * a member card are the same height beside each other in the two-column layout.
 * A third line that only some cards carry makes the two columns saw up and down
 * against each other. The Link stays with each caller because the router types
 * `params` against the specific route.
 */
function GroundedCardBody({
  media,
  name,
  reason,
  detail,
  badge,
}: {
  media: ReactNode;
  name: string;
  reason: string;
  detail: string;
  badge: ReactNode;
}) {
  return (
    <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
      {media}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{reason}</div>
        <div className="truncate text-xs text-muted-foreground/80">{detail}</div>
      </div>
      {badge}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Card>
  );
}

function GroundedAircraftCard({ resource }: { resource: Resource }) {
  const plane = resource.type?.plane;
  const { name, kind } = resourceLabel(resource);
  const makeAndModel = [plane?.make, plane?.model].filter(Boolean).join(" ");

  return (
    <Link
      to="/aircraft/$resourceId"
      params={{ resourceId: String(resource.id) }}
      aria-label={`Open ${name}`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <GroundedCardBody
        media={
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
            <PlaneTakeoff className="size-5" />
          </span>
        }
        name={name}
        reason={plane?.groundedReason || "Grounded. No reason on file"}
        detail={makeAndModel || kind}
        badge={
          <Badge variant="secondary" className="shrink-0 border-warning/30 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
            Grounded
          </Badge>
        }
      />
    </Link>
  );
}

function GroundedMemberCard({ member }: { member: OrganizationUser }) {
  const name = member.user?.name ?? `Member #${member.id}`;
  const roles = rolesOf(member);

  return (
    <Link
      to="/people/$orgUserId"
      params={{ orgUserId: String(member.id) }}
      aria-label={`Open ${name}`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <GroundedCardBody
        media={
          <Avatar className="size-10">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        }
        name={name}
        reason={member.groundedReason || "Grounded. No reason on file"}
        detail={roles.length ? roles.join(", ") : "Member"}
        badge={
          <Badge variant="danger" className="shrink-0">
            Grounded
          </Badge>
        }
      />
    </Link>
  );
}
