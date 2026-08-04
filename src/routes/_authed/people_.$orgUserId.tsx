import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarPlus,
  Hash,
  Mail,
  Phone,
  PlaneTakeoff,
  Shield,
  UserRound,
} from "lucide-react";
import { rolesOf, type OrganizationUser } from "@/types/api";
import { useApprovedResources, useMember } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { personViewAccess } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";
import { EmptyState, ErrorState } from "@/components/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleBadges } from "@/components/role-badges";
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
  useDetailTitle,
} from "@/components/detail/detail-page";
import { useDetailRange } from "@/components/detail/use-detail-range";
import { EditRolesModal } from "@/components/people/edit-roles-modal";
import { MemberRowActions } from "@/components/people/member-row-actions";
import { MemberInstructionSection } from "@/components/people/member-instruction-section";
import { PersonMetrics } from "@/components/people/detail/person-metrics";
import { PersonFlights } from "@/components/people/detail/person-flights";
import { PersonInvoices } from "@/components/people/detail/person-invoices";
import {
  PersonCurrencies,
  PersonDocuments,
} from "@/components/people/detail/person-compliance";
import { memberName } from "@/components/people/util";

/**
 * One person, in full.
 *
 * Not nested under `/people` (hence the `people_` filename): the roster is a
 * full-height table page that owns its own scroll container, and making it a
 * layout for this one would mean rendering the table underneath every profile.
 * The URL is still `/people/:id`, so browser Back and the explicit back link
 * both land on the roster.
 *
 * Access is NOT the same for everyone who can open it. See `personViewAccess` —
 * every section below is the client half of a guard the server already enforces,
 * and the two are meant to be read together.
 */
export const Route = createFileRoute("/_authed/people_/$orgUserId")({
  component: PersonPage,
});

function PersonPage() {
  const { orgUserId: orgUserIdParam } = Route.useParams();
  const id = Number.parseInt(orgUserIdParam, 10);
  const { roles, orgUserId: viewerOrgUserId } = useAuth();

  const q = useMember(Number.isFinite(id) ? id : null);
  const ou = q.data ?? null;

  const isSelf = ou != null && viewerOrgUserId != null && ou.id === viewerOrgUserId;
  const access = personViewAccess(roles, isSelf);

  if (!Number.isFinite(id)) {
    return (
      <PageFrame>
        <Card>
          <EmptyState
            icon={UserRound}
            title="No such member"
            body="That link doesn't point at anyone in this organization."
            action={
              <Button asChild>
                <Link to="/people">Back to People</Link>
              </Button>
            }
          />
        </Card>
      </PageFrame>
    );
  }

  if (q.isPending) {
    return (
      <PageFrame>
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
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

  if (q.isError) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      </PageFrame>
    );
  }

  if (!ou) {
    return (
      <PageFrame>
        <Card>
          <EmptyState
            icon={UserRound}
            title="Member not found"
            body="They may have been removed from this organization."
            action={
              <Button asChild>
                <Link to="/people">Back to People</Link>
              </Button>
            }
          />
        </Card>
      </PageFrame>
    );
  }

  return <PersonBody ou={ou} isSelf={isSelf} access={access} />;
}

function PersonBody({
  ou,
  isSelf,
  access,
}: {
  ou: OrganizationUser;
  isSelf: boolean;
  access: ReturnType<typeof personViewAccess>;
}) {
  const { range, setRange, window } = useDetailRange(90);
  const [editingRoles, setEditingRoles] = useState<OrganizationUser | null>(null);

  const name = memberName(ou);
  useDetailTitle(name);
  const subjectRoles = rolesOf(ou);
  const email = ou.user?.email;
  const phone = ou.user?.details?.phone;

  return (
    <PageFrame>
      <DetailHeader
        media={
          <Avatar className="size-16">
            {ou.profileImage && <AvatarImage src={ou.profileImage} alt={name} />}
            <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
          </Avatar>
        }
        title={name}
        badges={
          <>
            {ou.grounded ? (
              <Badge variant="danger">Grounded</Badge>
            ) : (
              <Badge variant="outline">Active</Badge>
            )}
            {isSelf && <Badge variant="secondary">You</Badge>}
          </>
        }
        subtitle={<RoleBadges roles={subjectRoles} />}
        meta={
          <>
            {email && <MetaItem icon={Mail}>{email}</MetaItem>}
            {phone && <MetaItem icon={Phone}>{phone}</MetaItem>}
            {ou.identifier && <MetaItem icon={Hash}>{ou.identifier}</MetaItem>}
          </>
        }
        actions={
          <>
            {access.manage && (
              <Button variant="outline" onClick={() => setEditingRoles(ou)}>
                <Shield className="size-4" /> Edit roles
              </Button>
            )}
            {isSelf && (
              <Button asChild>
                <Link to="/me/book">
                  <CalendarPlus className="size-4" /> Book
                </Link>
              </Button>
            )}
            {access.manage && (
              <MemberRowActions ou={ou} onEditRoles={setEditingRoles} />
            )}
          </>
        }
      />

      {ou.grounded && (
        <div className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-destructive">
          <span className="font-medium">Grounded:</span>{" "}
          {ou.groundedReason?.trim() || "No reason recorded."}
        </div>
      )}

      {/* The window drives every number below it, so it sits above them all
          rather than inside one card — two cards measuring different windows on
          one page is how a page stops being believed.

          Shown to anyone who gets the flight log too, not just the tiles: the log
          is scoped to this window, so a viewer who can see it and can't move it
          is stuck with a range they were never shown. */}
      {(access.metrics || access.flights) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            {access.metrics
              ? "Activity and billing over the selected window."
              : "Flights over the selected window."}
          </p>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      )}

      {access.metrics && (
        <PersonMetrics
          orgUserId={ou.id}
          subjectRoles={subjectRoles}
          range={window}
          showMoney={access.money}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {access.flights ? (
            <PersonFlights
              userId={ou.user?.id ?? null}
              range={window}
              canBookFor={!isSelf}
            />
          ) : (
            <DetailCard
              title="Activity"
              description="Flights, hours and billing for this member."
            >
              <CardEmpty>
                Your role doesn&apos;t include this member&apos;s activity. Admins see
                everything here; instructors and dispatchers see the flying.
              </CardEmpty>
            </DetailCard>
          )}

          {access.money && (
            <PersonInvoices orgUserId={ou.id} range={window} isSelf={isSelf} />
          )}
        </div>

        <div className="space-y-4">
          <DetailCard title="Details">
            <KeyValueList>
              <KeyValue label="Member ID" mono>
                #{ou.id}
              </KeyValue>
              <KeyValue label="Identifier" mono>
                {ou.identifier || "—"}
              </KeyValue>
              <KeyValue label="Joined">{formatDate(ou.createdAt, "MMMM d, yyyy")}</KeyValue>
              <KeyValue label="Last active">
                {formatDate(ou.user?.lastActiveAt, "MMM d, yyyy")}
              </KeyValue>
            </KeyValueList>
          </DetailCard>

          {access.currencies && <PersonCurrencies ou={ou} isSelf={isSelf} />}
          {access.documents && <PersonDocuments ou={ou} isSelf={isSelf} />}
          {access.approvedAircraft && (
            <ApprovedAircraft userId={ou.user?.id ?? null} isSelf={isSelf} />
          )}
          {access.instruction && (
            <Card>
              <MemberInstructionSection ou={ou} bare />
            </Card>
          )}
        </div>
      </div>

      <EditRolesModal
        member={editingRoles}
        open={!!editingRoles}
        onOpenChange={(o) => !o && setEditingRoles(null)}
      />
    </PageFrame>
  );
}

/**
 * Which tails this person may take. Empty is a real answer for a student who
 * only ever flies dual, so it says so rather than looking like a failed load.
 */
function ApprovedAircraft({
  userId,
  isSelf,
}: {
  userId: number | null;
  isSelf: boolean;
}) {
  const q = useApprovedResources(userId);
  const planes = (q.data ?? []).filter((r) => r.type?.plane);

  return (
    <DetailCard
      title="Approved aircraft"
      description={
        isSelf ? "Tails you're checked out to fly." : "Tails they're checked out to fly."
      }
    >
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : q.isError ? (
        <CardEmpty>Couldn&apos;t load approvals.</CardEmpty>
      ) : planes.length === 0 ? (
        <CardEmpty>
          No aircraft approved{isSelf ? " for you" : ""} yet — approvals are granted per
          tail from the aircraft page.
        </CardEmpty>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {planes.map((r) => (
            <li key={r.id}>
              <Link
                to="/aircraft/$resourceId"
                params={{ resourceId: String(r.id) }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent/50"
              >
                <PlaneTakeoff className="size-3.5 opacity-70" />
                {r.type!.plane!.tailNumber}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 pb-8">
      <DetailBack to="/people" label="People" />
      {children}
    </div>
  );
}
