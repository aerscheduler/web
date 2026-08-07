import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CircleCheck,
  ClipboardCheck,
  Circle,
  PlaneTakeoff,
  Wrench,
} from "lucide-react";
import { useSquawk } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canResolveSquawk, guardRoute } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { resourceLabel, type OrganizationUser, type Squawk } from "@/types/api";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { VerifySquawkModal } from "@/components/maintenance/verify-squawk-modal";
import {
  CardEmpty,
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
import { ErrorState } from "@/components/states";
import { TableView } from "@/components/table-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One squawk, in full.
 *
 * Sibling of the maintenance list rather than a child of it (hence the `maintenance_`
 * filename), for the same reason as the person and aircraft pages: Maintenance is a
 * full-height page that owns its own scroll container, and making it a layout for this
 * would render the whole board underneath every write-up. The URL is still
 * `/maintenance/squawks/:id`, which is the shape the mobile app uses too, so both clients
 * can be linked from the same place.
 *
 * Why it exists at all: `sendSquawkCreated` on the server has always emitted a
 * `/squawks/:id` link for the phone, and the console had nowhere to send it. A technician
 * who got the notification had to open Maintenance and hunt the board for the row. The
 * inbox now resolves that link here (see `lib/notification-link`).
 *
 * The page leads with WHERE THE SQUAWK STANDS rather than with its text, because the two
 * stamps are the thing people get wrong: verified and resolved are different acts against
 * different columns, and a squawk can be resolved having never been verified.
 */
export const Route = createFileRoute("/_authed/maintenance_/squawks/$squawkId")({
  // Resolves through `canAccess`'s nearest-parent rule to `/maintenance`, i.e. staff or
  // technician. Same shape as the server guard: `GET /maintenance/squawks/:id` is admin,
  // technician or dispatcher.
  beforeLoad: guardRoute("/maintenance/squawks"),
  component: SquawkDetailPage,
});

function SquawkDetailPage() {
  const { squawkId: param } = Route.useParams();
  const id = Number.parseInt(param, 10);
  const q = useSquawk(Number.isFinite(id) ? id : null);
  const squawk = q.data ?? null;

  // A bad id, a squawk from another organization, and a deleted one all land here. The
  // server answers 403 rather than 404 (it can't say "no such squawk" without confirming
  // one exists somewhere), so surfacing it verbatim would tell somebody who mistyped a URL
  // that they aren't authorized.
  const missing =
    !Number.isFinite(id) ||
    isMissingRecord(q.error) ||
    // Settled with nothing is this page's not-found too, whatever React Query calls it.
    (!q.isLoading && !q.isError && squawk == null);

  if (missing) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={Wrench}
          title="Squawk not found"
          body="That link doesn't point at a write-up in this organization. It may have been removed."
          backTo="/maintenance"
          backLabel="Back to Maintenance"
        />
      </PageFrame>
    );
  }

  // `isLoading`, not `isPending`: v5's `isPending` stays true for a settled query with no
  // data, so a skeleton keyed on it spins forever on a bad id.
  if (q.isLoading) {
    return (
      <PageFrame>
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </PageFrame>
    );
  }

  if (q.isError || !squawk) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </PageFrame>
    );
  }

  return <SquawkBody squawk={squawk} />;
}

type Stage = "new" | "verified" | "resolved";

function stageOf(s: Squawk): Stage {
  if (s.resolvedAt) return "resolved";
  if (s.verifiedAt) return "verified";
  return "new";
}

const STAGE_COPY: Record<Stage, { label: string; detail: string }> = {
  new: { label: "Open", detail: "Reported, and not confirmed by anyone yet." },
  verified: { label: "Verified", detail: "Confirmed as real. Waiting on the fix." },
  resolved: { label: "Resolved", detail: "Signed off. This one is closed out." },
};

function SquawkBody({ squawk }: { squawk: Squawk }) {
  const { roles } = useAuth();
  const canManage = canResolveSquawk(roles);
  const [verifying, setVerifying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const title = squawk.title?.trim() || "Untitled squawk";
  useDetailTitle(title);

  const aircraft = squawk.resource ? resourceLabel(squawk.resource).name : null;
  const stage = stageOf(squawk);

  // Resolved is terminal: there is nothing left to offer once it's closed out, and
  // verifying after the fact writes a stamp that reads as though the order was different.
  // Same gating as the phone's detail page.
  const canResolve = canManage && !squawk.resolvedAt;
  const canVerify = canManage && !squawk.verifiedAt && !squawk.resolvedAt;

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <DetailBack to="/maintenance" label="Maintenance" />

        <DetailHeader
          media={
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Wrench className="size-5" />
            </span>
          }
          title={title}
          badges={
            <Badge
              variant={
                stage === "resolved" ? "success" : stage === "verified" ? "default" : "warning"
              }
            >
              {STAGE_COPY[stage].label}
            </Badge>
          }
          subtitle={STAGE_COPY[stage].detail}
          meta={
            aircraft && squawk.resource ? (
              <MetaItem icon={PlaneTakeoff}>
                <Link
                  to="/aircraft/$resourceId"
                  params={{ resourceId: String(squawk.resource.id) }}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {aircraft}
                </Link>
              </MetaItem>
            ) : undefined
          }
          actions={
            <>
              {canVerify && (
                <Button variant="outline" onClick={() => setVerifying(true)}>
                  <ClipboardCheck className="size-4" /> Verify
                </Button>
              )}
              {canResolve && (
                <Button onClick={() => setResolving(true)}>
                  <Check className="size-4" /> Resolve
                </Button>
              )}
            </>
          }
        />
      </TableView.Header>

      <TableView.Body>
        <div className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {/* Grounding is an audit-only flag today: the server records it on the audit
                entry and never stores it on the squawk, so this only draws for a payload
                that carries one. Left in so it lights up the day the column lands. */}
            {squawk.grounding && !squawk.resolvedAt && (
              <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  This squawk grounded the aircraft. Resolving it doesn&rsquo;t return it to
                  service on its own.
                </span>
              </p>
            )}

            <DetailCard title="Reported issue" description="What the pilot wrote up.">
              {squawk.description?.trim() ? (
                <p className="whitespace-pre-wrap text-[13px]">{squawk.description.trim()}</p>
              ) : (
                <CardEmpty>No description was given.</CardEmpty>
              )}
            </DetailCard>

            <DetailCard
              title="Work notes"
              description="What was done to clear it, written when it was signed off."
            >
              {squawk.notes?.trim() ? (
                <p className="whitespace-pre-wrap text-[13px]">{squawk.notes.trim()}</p>
              ) : (
                <CardEmpty>
                  {squawk.resolvedAt ? "Signed off without notes." : "Nothing written yet."}
                </CardEmpty>
              )}
            </DetailCard>
          </div>

          <div className="space-y-4">
            <DetailCard
              title="Progress"
              description="Verifying and resolving are separate stamps."
            >
              <ol className="space-y-3">
                <Step
                  label="Reported"
                  done
                  who={squawk.reportedBy}
                  at={squawk.reportedAt ?? squawk.createdAt}
                />
                <Step
                  label="Verified"
                  done={!!squawk.verifiedAt}
                  who={squawk.verifiedBy}
                  at={squawk.verifiedAt}
                  pending="Not confirmed yet"
                />
                <Step
                  label="Resolved"
                  done={!!squawk.resolvedAt}
                  who={squawk.resolvedBy}
                  at={squawk.resolvedAt}
                  pending="Still open"
                />
              </ol>
            </DetailCard>

            <DetailCard title="Details">
              <KeyValueList>
                <KeyValue label="Aircraft" mono>
                  {aircraft ?? "Not recorded"}
                </KeyValue>
                <KeyValue label="Reported">
                  {formatDate(
                    squawk.reportedAt ?? squawk.createdAt,
                    "MMM d, yyyy 'at' h:mm a",
                    "Not recorded"
                  )}
                </KeyValue>
                {/* When the work was actually finished, which is not the same day it was
                    signed off. That distinction is why the resolve form asks for it. */}
                {squawk.completedAt && (
                  <KeyValue label="Work completed">{formatDate(squawk.completedAt)}</KeyValue>
                )}
              </KeyValueList>
            </DetailCard>
          </div>
        </div>
      </TableView.Body>

      <VerifySquawkModal squawk={squawk} open={verifying} onOpenChange={setVerifying} />
      <ResolveSquawkModal squawk={squawk} open={resolving} onOpenChange={setResolving} />
    </TableView>
  );
}

function Step({
  label,
  done,
  who,
  at,
  pending,
}: {
  label: string;
  done: boolean;
  who?: OrganizationUser | null;
  at?: string | null;
  pending?: string;
}) {
  const stamp = [who?.user?.name, at ? formatDate(at, "MMM d, yyyy 'at' h:mm a", "") : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-2.5">
      <span
        className={
          done ? "mt-0.5 shrink-0 text-[var(--success)]" : "mt-0.5 shrink-0 text-muted-foreground/40"
        }
        aria-hidden
      >
        {done ? <CircleCheck className="size-4" /> : <Circle className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">
          {done ? stamp || "Done" : (pending ?? "Not yet")}
        </span>
      </span>
    </li>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 pb-8">
      <DetailBack to="/maintenance" label="Maintenance" />
      {children}
    </div>
  );
}
