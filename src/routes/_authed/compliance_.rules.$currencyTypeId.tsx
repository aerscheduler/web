import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Pencil,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { guardRoute, isAdmin as hasAdminRole } from "@/lib/permissions";
import { useCurrencyRuleDetail } from "@/features/queries";
import type { Currency } from "@/types/api";
import type { CurrencyRuleMember, CurrencyRuleStanding } from "@/types/currency-rule";
import {
  DetailBack,
  DetailCard,
  DetailHeader,
  KeyValue,
  KeyValueList,
  RecordNotFound,
  isMissingRecord,
  useDetailTitle,
} from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { StatCard, StatGrid } from "@/components/stat-card";
import {
  CurrencyTypeFormModal,
  expirySummary,
  scopeGapText,
} from "@/components/settings/currency-types-tab";
import {
  RenewCurrencyDialog,
  canOfferRenew,
  isDocumentGated,
} from "@/components/people/renew-currency-dialog";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authed/compliance_/rules/$currencyTypeId")({
  beforeLoad: guardRoute("/compliance"),
  component: CurrencyRuleDetailPage,
});

const PAGE_SIZE = 25;

const STATUS_META: Record<
  CurrencyRuleStanding,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  current: { label: "Current", variant: "success" },
  expiring: { label: "Expiring soon", variant: "warning" },
  expired: { label: "Expired", variant: "danger" },
  notSignedOff: { label: "Not signed off", variant: "warning" },
};

function displayDate(value: string | null | undefined) {
  if (!value) return "None";
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy");
}

function CurrencyRuleDetailPage() {
  const currencyTypeId = Number(Route.useParams().currencyTypeId);
  const { roles } = useAuth();
  const admin = hasAdminRole(roles);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<CurrencyRuleStanding | "">("");
  const [offset, setOffset] = React.useState(0);
  const [editOpen, setEditOpen] = React.useState(false);
  const [renewing, setRenewing] = React.useState<Currency | null>(null);
  const detail = useCurrencyRuleDetail(currencyTypeId, {
    q: q.trim() || undefined,
    status: status || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  useDetailTitle(detail.data?.type.name);

  if (!Number.isFinite(currencyTypeId) || (detail.isError && isMissingRecord(detail.error))) {
    return (
      <RecordNotFound
        icon={ShieldCheck}
        title="Currency rule not found"
        body="This rule may have been removed, or it belongs to another school."
        backTo="/compliance"
        backLabel="Back to Go / No-Go"
      />
    );
  }

  if (detail.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (detail.isError) {
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }

  const data = detail.data;
  const type = data.type;
  const gap = scopeGapText(type.resourceGroups?.length ?? 0, type.orgUserGroups?.length ?? 0);
  const currencyFor = (member: CurrencyRuleMember): Currency => ({
    id: member.currencyId,
    startedAt: member.startedAt,
    warnedAt: member.warnedAt,
    expiredAt: member.expiredAt,
    archivedAt: null,
    notes: member.notes,
    renewedBy: member.renewedBy,
    currencyType: type,
    orgUser: member.orgUser,
  });

  return (
    <div className="space-y-5">
      <DetailBack to="/compliance" label="Go / No-Go" />
      <DetailHeader
        media={
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
        }
        title={type.name}
        subtitle={type.description || "A booking currency rule"}
        badges={
          <>
            {gap && <Badge variant="danger">Enforces nothing</Badge>}
            {type.active === false && <Badge variant="secondary">Inactive</Badge>}
          </>
        }
        meta={
          <>
            <span>{expirySummary(type)}</span>
            <span>{data.summary.total} people covered</span>
          </>
        }
        actions={
          <>
            <DocsHint topic="currency-rule-details" side="left" />
            {admin && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit rule
              </Button>
            )}
          </>
        }
      />

      {gap && (
        <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>{gap}</span>
        </div>
      )}

      <StatGrid>
        <StatCard
          label="Current"
          value={data.summary.current}
          icon={CheckCircle2}
          accent="success"
        />
        <StatCard
          label="Expiring soon"
          value={data.summary.expiring}
          icon={Clock3}
          accent={data.summary.expiring ? "warning" : "success"}
        />
        <StatCard
          label="Expired"
          value={data.summary.expired}
          icon={AlertTriangle}
          accent={data.summary.expired ? "warning" : "success"}
        />
        <StatCard
          label="Not signed off"
          value={data.summary.notSignedOff}
          icon={Users}
          accent={data.summary.notSignedOff ? "warning" : "success"}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="Rule and scope" description="Who this applies to and what it blocks.">
          <KeyValueList>
            <KeyValue label="People groups">
              {type.orgUserGroups?.map((group) => group.name).join(", ") || "None"}
            </KeyValue>
            <KeyValue label="Aircraft groups">
              {type.resourceGroups?.map((group) => group.name).join(", ") || "None"}
            </KeyValue>
            <KeyValue label="Expiration">{expirySummary(type)}</KeyValue>
            <KeyValue label="Warning window">
              {type.warningPeriodInDays != null
                ? `${type.warningPeriodInDays} days before expiry`
                : "None"}
            </KeyValue>
            <KeyValue label="Fly with instructor">
              {type.canFlyWithInstructor ? "Allowed" : "Not allowed"}
            </KeyValue>
            <KeyValue label="Who can renew">
              {[
                "Admins",
                type.dispatcherCanRenew ? "dispatchers" : null,
                type.instructorCanRenew ? "instructors" : null,
                type.canRenewSelf ? "the member" : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </KeyValue>
          </KeyValueList>
        </DetailCard>

        <DetailCard
          title="Required documents"
          description="A member must have every listed document attached to count as current."
        >
          {(type.documentTypes?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No documents are required.</p>
          ) : (
            <div className="space-y-2">
              {type.documentTypes?.map((documentType) => (
                <div key={documentType.id} className="flex items-center gap-2 text-sm">
                  <FileCheck2 className="size-4 text-muted-foreground" />
                  <span className="font-medium">{documentType.name}</span>
                  {documentType.expires && <Badge variant="outline">Expires</Badge>}
                </div>
              ))}
              {data.summary.missingDocuments > 0 && (
                <p className="pt-1 text-xs text-warning">
                  {data.summary.missingDocuments} people are missing required evidence.
                </p>
              )}
            </div>
          )}
        </DetailCard>
      </div>

      <DetailCard
        title="Member standing"
        description="Worst standing first. Open a person to review all of their currencies and documents."
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap gap-2 border-b border-border p-4">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
            placeholder="Search people"
            aria-label="Search people on this currency rule"
            className="max-w-sm"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CurrencyRuleStanding | "");
              setOffset(0);
            }}
            aria-label="Filter currency standing"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All standings</option>
            <option value="expired">Expired</option>
            <option value="notSignedOff">Not signed off</option>
            <option value="expiring">Expiring soon</option>
            <option value="current">Current</option>
          </select>
        </div>

        {data.members.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No people match these filters.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Standing</TH>
                <TH>Expires</TH>
                <TH>Documents</TH>
                <TH>Signed off by</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {data.members.map((member) => {
                const currency = currencyFor(member);
                const memberName =
                  member.orgUser.user?.name ?? member.orgUser.user?.email ?? `Member #${member.orgUser.id}`;
                const missingNames = (type.documentTypes ?? [])
                  .filter((documentType) => member.missingDocumentTypeIds.includes(documentType.id))
                  .map((documentType) => documentType.name);
                const mayRenew = canOfferRenew(currency, roles, admin, false);
                const documentGated = isDocumentGated(currency);

                return (
                  <TR key={member.currencyId}>
                    <TD>
                      <Link
                        to="/people/$orgUserId"
                        params={{ orgUserId: String(member.orgUser.id) }}
                        search={{ tab: "compliance" }}
                        className="font-medium hover:underline"
                      >
                        {memberName}
                      </Link>
                      {member.orgUser.user?.email && (
                        <div className="text-xs text-muted-foreground">
                          {member.orgUser.user.email}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={STATUS_META[member.status].variant}>
                        {STATUS_META[member.status].label}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {displayDate(member.expiresOn ?? member.expiredAt)}
                    </TD>
                    <TD>
                      {missingNames.length > 0 ? (
                        <span className="text-xs text-warning">
                          Missing {missingNames.join(", ")}
                        </span>
                      ) : member.documents.length > 0 ? (
                        <span className="space-y-0.5 text-xs">
                          {member.documents.map((item) => (
                            <span key={item.id} className="block">
                              {item.documentType.name}
                              {item.expiresAt ? ` · expires ${displayDate(item.expiresAt)}` : ""}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not required</span>
                      )}
                    </TD>
                    <TD>
                      {member.renewedBy?.user?.name ?? (
                        <span className="text-muted-foreground">Not signed off</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {documentGated ? (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            to="/people/$orgUserId"
                            params={{ orgUserId: String(member.orgUser.id) }}
                            search={{ tab: "compliance" }}
                          >
                            <FileCheck2 className="size-4" /> Review documents
                          </Link>
                        </Button>
                      ) : mayRenew ? (
                        <Button variant="outline" size="sm" onClick={() => setRenewing(currency)}>
                          <Clock3 className="size-4" />
                          {member.renewedBy ? "Renew" : "Sign off"}
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {data.pagination.total === 0
              ? "0 people"
              : `${data.pagination.offset + 1}-${data.pagination.offset + data.pagination.returned} of ${data.pagination.total}`}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.pagination.hasMore}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </DetailCard>

      <CurrencyTypeFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        type={type}
      />
      <RenewCurrencyDialog
        currency={renewing}
        open={renewing != null}
        onOpenChange={(open) => {
          if (!open) setRenewing(null);
        }}
      />
    </div>
  );
}
