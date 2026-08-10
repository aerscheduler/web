import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, FileCheck2, Receipt } from "lucide-react";
import type { Membership, MembershipStatus } from "@/types/api";
import {
  useBillMembershipDues,
  useBillMembershipJoinFee,
  useChangeMembershipPlan,
  useCreateMembership,
  useMembershipForOrgUser,
  useMembershipPlans,
  useSetMembershipStatus,
  useSkipMembershipDues,
  useUpdateMembership,
} from "@/features/queries";
import { formatMoney } from "@/lib/utils";
import {
  MEMBERSHIP_STATUS_LABEL,
  MEMBERSHIP_STATUS_VARIANT,
  duesLine,
  formatPeriodDate,
  formatPeriodRange,
  nextDuesLine,
  planPriceLine,
} from "@/lib/membership";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveModal } from "@/components/responsive-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { PreferenceToggle } from "@/components/settings/parts";

/**
 * One member's membership, on their record page.
 *
 * THE WHOLE FEATURE FROM A DESK. Everything a club's treasurer does about one person is
 * here: put them on a plan, start it, bill the join fee, bill or waive a period, pause them
 * for the winter, move them to a different tier, end it.
 *
 * Renders nothing at all when the organization has no plans. Every school that does not run
 * memberships would otherwise get a permanent "no membership" card on every person, which
 * is the kind of empty furniture that makes a product feel heavier than it is.
 */
export function PersonMembership({ orgUserId, canManage }: { orgUserId: number; canManage: boolean }) {
  const membership = useMembershipForOrgUser(orgUserId, { enabled: canManage });
  const plans = useMembershipPlans(false, { enabled: canManage });
  const [assigning, setAssigning] = useState(false);

  if (!canManage) return null;
  //Wait for both before deciding to render nothing, or the card flashes in and out on load.
  if (membership.isLoading || plans.isLoading) return null;

  const livePlans = plans.data ?? [];
  const current = membership.data;

  if (!current && livePlans.length === 0) return null;

  return (
    <>
      <Card className="p-4" data-doc-shot="person-membership-card">
        <div className="mb-3 flex items-center gap-2">
          <BadgeCheck className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Membership</h2>
        </div>

        {current ? (
          <MembershipBody membership={current} onChangePlan={() => setAssigning(true)} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Not on a membership plan.
            </p>
            <Button size="sm" onClick={() => setAssigning(true)}>
              Add to a plan
            </Button>
          </div>
        )}
      </Card>

      {assigning ? (
        <AssignDialog
          orgUserId={orgUserId}
          existing={current ?? null}
          onClose={() => setAssigning(false)}
        />
      ) : null}
    </>
  );
}

function MembershipBody({
  membership: m,
  onChangePlan,
}: {
  membership: Membership;
  onChangePlan: () => void;
}) {
  const setStatus = useSetMembershipStatus();
  const billJoinFee = useBillMembershipJoinFee();
  const billDues = useBillMembershipDues();
  const skipDues = useSkipMembershipDues();
  const update = useUpdateMembership();
  const confirm = useConfirm();

  const end = async () => {
    const ok = await confirm({
      title: "End this membership?",
      description:
        "No more dues will be charged. Invoices already raised stay exactly as they are, and the history stays on the record. To bring the member back later you start a new membership.",
      confirmLabel: "End membership",
      destructive: true,
    });
    if (ok) setStatus.mutate({ membershipId: m.id, status: "cancelled" });
  };

  const err = (billJoinFee.error ?? billDues.error ?? skipDues.error ?? setStatus.error ?? update.error) as
    | Error
    | undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{m.plan.name}</span>
            <Badge variant={MEMBERSHIP_STATUS_VARIANT[m.status]}>{MEMBERSHIP_STATUS_LABEL[m.status]}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{duesLine(m)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{nextDuesLine(m)}</p>
          {m.startedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Member since {formatPeriodDate(m.startedAt)}
              {m.endedAt ? ` · ended ${formatPeriodDate(m.endedAt)}` : ""}
              {m.endedReason ? ` · ${m.endedReason}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {m.status === "pending" && (
            <Button
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ membershipId: m.id, status: "active" })}
            >
              Start membership
            </Button>
          )}
          {m.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ membershipId: m.id, status: "suspended" })}
            >
              Pause
            </Button>
          )}
          {m.status === "suspended" && (
            <Button
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ membershipId: m.id, status: "active" })}
            >
              Resume
            </Button>
          )}
          {m.status !== "cancelled" && (
            <>
              <Button size="sm" variant="outline" onClick={onChangePlan}>
                Change plan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void end()}>
                End
              </Button>
            </>
          )}
          {m.status === "cancelled" && (
            <Button size="sm" variant="outline" onClick={onChangePlan}>
              Start a new membership
            </Button>
          )}
        </div>
      </div>

      {/* --- Join fee --------------------------------------------------------------- */}
      {m.joinFeeStatus !== "none" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Join fee</p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(m.joinFeeCents)}
                {m.joinFeeStatus === "invoiced" ? " · invoiced" : " · not billed yet"}
              </p>
            </div>
          </div>
          {m.joinFeeStatus === "invoiced" ? (
            m.FK_joinFeeInvoiceId ? (
              <Button asChild size="sm" variant="outline">
                {/*
                  `invoice`, not `id`: the Billing route's validateSearch parses `s.invoice`
                  and drops every other param, so `?id=…` opened Billing on an unfiltered
                  list with no panel. It looked like a working link and quietly went nowhere.
                  Billing then hydrates the panel from the id alone, so an invoice outside
                  the restored date range or status filter still opens.
                */}
                <Link to="/billing" search={{ invoice: m.FK_joinFeeInvoiceId } as never}>
                  View invoice
                </Link>
              </Button>
            ) : (
              <Badge variant="secondary">Invoiced</Badge>
            )
          ) : (
            <Button size="sm" disabled={billJoinFee.isPending} onClick={() => billJoinFee.mutate(m.id)}>
              {billJoinFee.isPending ? "Billing…" : `Bill ${formatMoney(m.joinFeeCents)}`}
            </Button>
          )}
        </div>
      ) : null}

      {/* --- The next dues period ---------------------------------------------------- */}
      {m.status === "active" && m.nextPeriod ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">
              {m.nextPeriod.retry ? "Unbilled period" : "Next period"} ·{" "}
              {formatMoney(m.nextPeriod.amountCents)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatPeriodRange(m.nextPeriod.periodStart, m.nextPeriod.periodEnd)}
              {/* The part-period from joining mid-cycle is billed before the first full one
                  and at its own price, so say so, otherwise the amount here reads like a
                  short month rather than a deliberate proration. */}
              {m.nextPeriod.prorated ? " · part period, prorated" : ""}
              {m.nextPeriod.retry ? " · billing failed, retry" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={skipDues.isPending}
              onClick={() => skipDues.mutate({ membershipId: m.id, reason: "Waived by staff" })}
            >
              Waive
            </Button>
            <Button size="sm" disabled={billDues.isPending} onClick={() => billDues.mutate(m.id)}>
              {billDues.isPending ? "Billing…" : m.nextPeriod.retry ? "Retry" : "Bill now"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* --- Settings ---------------------------------------------------------------- */}
      <div className="divide-y rounded-lg border px-3">
        <PreferenceToggle
          label="Bill dues automatically"
          description="Raise each period's invoice overnight, without anyone pressing a button."
          checked={m.autoBillDues}
          saving={update.isPending}
          disabled={m.status === "cancelled" || !m.duesCents}
          onCheckedChange={(v) => update.mutate({ membershipId: m.id, autoBillDues: v })}
        />
        <PreferenceToggle
          label="Membership agreement on file"
          description={
            m.plan.FK_agreementDocumentTypeId
              ? "This plan expects a signed agreement. Nothing is blocked if it is missing. This is a record, not a gate."
              : "Tick this once the member's paperwork is in. Nothing is blocked either way."
          }
          checked={!!m.agreementOnFileAt}
          saving={update.isPending}
          onCheckedChange={(v) => update.mutate({ membershipId: m.id, agreementOnFile: v })}
        />
      </div>

      {m.agreementOnFileAt ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileCheck2 className="size-3.5" />
          Agreement recorded {formatPeriodDate(m.agreementOnFileAt)}
        </p>
      ) : null}

      {/* --- Ledger ------------------------------------------------------------------ */}
      {m.charges && m.charges.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dues history
          </p>
          <div className="divide-y rounded-lg border">
            {m.charges.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {formatPeriodRange(c.periodStart, c.periodEnd)}
                </span>
                <span className="flex items-center gap-2">
                  {c.status === "waived" ? (
                    <Badge variant="outline">Waived</Badge>
                  ) : c.status === "failed" ? (
                    <Badge variant="danger" title={c.note ?? undefined}>
                      Failed
                    </Badge>
                  ) : c.status === "pending" ? (
                    <Badge variant="secondary">Owed</Badge>
                  ) : null}
                  <span className="font-medium">{formatMoney(c.amountCents)}</span>
                  {c.FK_invoiceId ? (
                    <Link
                      to="/billing"
                      search={{ invoice: c.FK_invoiceId } as never}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Invoice
                    </Link>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {err ? <p className="text-sm text-destructive">{err.message}</p> : null}
    </div>
  );
}

/**
 * Put somebody on a plan, or move them to a different one.
 *
 * The same dialog for both because the choice is the same one; only what happens underneath
 * differs, a new membership snapshots the plan's prices, a change re-snapshots them from
 * the next period. The copy says which.
 */
function AssignDialog({
  orgUserId,
  existing,
  onClose,
}: {
  orgUserId: number;
  existing: Membership | null;
  onClose: () => void;
}) {
  const plans = useMembershipPlans(false);
  const create = useCreateMembership();
  const change = useChangeMembershipPlan();

  //Changing the plan of a LIVE membership keeps the membership; a cancelled one is over,
  //so picking a plan there starts a fresh membership instead.
  const isChange = existing != null && existing.status !== "cancelled";

  const [planId, setPlanId] = useState<string>(existing ? String(existing.FK_planId) : "");
  const [start, setStart] = useState(true);
  const [waiveJoinFee, setWaiveJoinFee] = useState(false);

  const chosen = (plans.data ?? []).find((p) => String(p.id) === planId);
  const busy = create.isPending || change.isPending;
  const err = (create.error ?? change.error) as Error | undefined;

  const submit = () => {
    if (!planId) return;
    const done = { onSuccess: () => onClose() };
    if (isChange) {
      change.mutate({ membershipId: existing!.id, planId: Number(planId) }, done);
    } else {
      create.mutate({ orgUserId, planId: Number(planId), start, waiveJoinFee }, done);
    }
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={isChange ? "Change plan" : "Add to a membership plan"}
      description={
        isChange
          ? "The new price takes effect from the next dues period. Anything already invoiced is untouched."
          : "The member keeps this plan's current prices even if the plan changes later."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !planId}>
            {busy ? "Saving…" : isChange ? "Change plan" : "Add to plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assign-plan">Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger id="assign-plan">
              <SelectValue placeholder="Choose a plan" />
            </SelectTrigger>
            <SelectContent>
              {(plans.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}, {planPriceLine(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isChange && (
          <div className="divide-y rounded-lg border px-3">
            <PreferenceToggle
              label="Start it now"
              description="Dues begin accruing from today. Leave this off to set the membership up without charging anything yet. You can start it from their record when they are ready."
              checked={start}
              onCheckedChange={setStart}
            />
            {chosen?.joinFeeCents ? (
              <PreferenceToggle
                label={`Waive the ${formatMoney(chosen.joinFeeCents)} join fee`}
                description="For a founding member, a transfer from another club, or anyone the board has excused."
                checked={waiveJoinFee}
                onCheckedChange={setWaiveJoinFee}
              />
            ) : null}
          </div>
        )}

        {chosen ? (
          <p className="text-xs text-muted-foreground">
            {planPriceLine(chosen)}
            {chosen.duesCents
              ? chosen.duesDayOfMonth
                ? `, billed on the ${chosen.duesDayOfMonth}${chosen.duesDayOfMonth === 1 ? "st" : "th"} of each cycle`
                : ", billed on their own anniversary"
              : ""}
            .
          </p>
        ) : null}

        {err ? <p className="text-sm text-destructive">{err.message}</p> : null}
      </div>
    </ResponsiveModal>
  );
}

/** Re-exported for the roster screen's status badge, so the mapping stays in one place. */
export const statusLabel = (s: MembershipStatus) => MEMBERSHIP_STATUS_LABEL[s];
