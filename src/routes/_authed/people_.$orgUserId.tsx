import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { formatPhone } from "@/lib/phone";
import { ErrorState } from "@/components/states";
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
  RecordNotFound,
  isMissingRecord,
  useDetailTitle,
} from "@/components/detail/detail-page";
import { useDetailRange } from "@/components/detail/use-detail-range";
import { EditRolesModal } from "@/components/people/edit-roles-modal";
import { MemberRowActions } from "@/components/people/member-row-actions";
import { MemberInstructionSection } from "@/components/people/member-instruction-section";
import { PersonMetrics } from "@/components/people/detail/person-metrics";
import { PersonTraining } from "@/components/people/detail/person-training";
import { PersonContact } from "@/components/people/detail/person-contact";
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

  // A bad id, someone in another organization, and a removed member all land
  // here. The server answers 403 rather than 404 — it can't say "no such
  // member" without confirming that member exists somewhere — so surfacing it
  // verbatim would tell a person who mistyped a URL that they aren't
  // authorized. This says the one true thing, and offers the way back.
  const missing =
    !Number.isFinite(id) ||
    isMissingRecord(q.error) ||
    // Nothing in flight and nothing to show. Any state that isn't "still
    // asking" and isn't a record is this page's not-found, whatever React
    // Query calls it internally.
    (!q.isLoading && !q.isError && ou == null);

  if (missing) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={UserRound}
          title="Member not found"
          body="That link doesn't point at anyone in this organization — they may have been removed."
          backTo="/people"
          backLabel="Back to People"
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

  if (q.isError || !ou) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
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
  const navigate = useNavigate();
  const { range, setRange, window } = useDetailRange(90);
  const [editingRoles, setEditingRoles] = useState<OrganizationUser | null>(null);

  const name = memberName(ou);
  useDetailTitle(name);
  const subjectRoles = rolesOf(ou);
  const email = ou.user?.email;
  const phone = formatPhone(ou.user?.details?.phone, ou.user?.details?.phoneCountry);

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
            {ou.archivedAt ? (
              <Badge variant="secondary">Archived</Badge>
            ) : ou.grounded ? (
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
              <MemberRowActions
                ou={ou}
                onEditRoles={setEditingRoles}
                onRemoved={() => void navigate({ to: "/people" })}
              />
            )}
          </>
        }
      />

      {/* Archived is stated first and instead of the grounding banner: for a retired
          member the grounding is history, and the fact that matters on this page is
          that nothing you do here will reach them. */}
      {ou.archivedAt ? (
        <div className="rounded-lg border bg-muted/50 px-3.5 py-2.5 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Archived {formatDate(ou.archivedAt)}.</span>{" "}
          They're off the roster, can't be booked, and receive no email or notifications from you.
          Their history is kept — return them to the roster to undo this.
        </div>
      ) : (
        ou.grounded && (
          <div className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] px-3.5 py-2.5 text-[13px] text-destructive">
            <span className="font-medium">Grounded:</span>{" "}
            {ou.groundedReason?.trim() || "No reason recorded."}
          </div>
        )
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

          {/* Renders itself only when the server returned contact details — the
              instructor-of-that-student rule can't be evaluated client-side, so
              the payload IS the permission answer. See PersonContact. */}
          <PersonContact ou={ou} isSelf={isSelf} />

          {/* Beside currencies and documents, because all three answer "is this person
              ready to fly, and on what". Gated with `instruction` rather than a new flag:
              the server already scopes the read (a student always gets only their own),
              and instructors seeing who their students are training toward is the point. */}
          {access.instruction && <PersonTraining ou={ou} isSelf={isSelf} />}
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
