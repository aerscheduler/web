import { Link } from "@tanstack/react-router";
import { BadgeCheck, FileCheck2 } from "lucide-react";
import { useMyMembership } from "@/features/queries";
import { formatMoney } from "@/lib/utils";
import {
  MEMBERSHIP_STATUS_LABEL,
  MEMBERSHIP_STATUS_VARIANT,
  duesLine,
  formatPeriodDate,
  formatPeriodRange,
  nextDuesLine,
} from "@/lib/membership";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * "What am I on, and what do I owe?" — the member's own view of their membership.
 *
 * DELIBERATELY READ-ONLY. There is no cancel button and no plan picker, because nobody
 * self-serves a membership: joining a club is the club's decision and leaving has money
 * attached. Both go through staff, so the card ends with who to talk to rather than a
 * control that would half-work.
 *
 * Renders nothing when the member is not on a plan, which is every member at every
 * organization that does not run memberships.
 */
export function MyMembershipCard() {
  const { data: m, isLoading } = useMyMembership();

  if (isLoading || !m) return null;

  //Only what was actually charged. A `pending` part-period is money the club has not asked
  //for yet, and showing it as a line the member owes would have them chasing an invoice
  //that does not exist.
  const history = m.charges.filter((c) => c.status === "billed" || c.status === "waived").slice(0, 4);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{m.planName}</p>
              <Badge variant={MEMBERSHIP_STATUS_VARIANT[m.status]}>
                {MEMBERSHIP_STATUS_LABEL[m.status]}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{duesLine(m)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{nextDuesLine(m)}</p>
            {m.startedAt ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Member since {formatPeriodDate(m.startedAt)}
              </p>
            ) : null}
          </div>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link to="/me/invoices">View invoices</Link>
        </Button>
      </div>

      {m.joinFeeStatus === "owed" ? (
        <p className="mt-3 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
          A one-time join fee of {formatMoney(m.joinFeeCents)} is on your account. It has not been
          invoiced yet — you will get an invoice when the school raises it.
        </p>
      ) : null}

      {m.agreementRequired && !m.agreementOnFileAt ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <FileCheck2 className="mt-0.5 size-3.5 shrink-0" />
          Your membership agreement is not recorded as being on file. Ask the office if you are
          not sure whether they have it.
        </p>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent dues
          </p>
          <div className="divide-y rounded-lg border">
            {history.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {formatPeriodRange(c.periodStart, c.periodEnd)}
                </span>
                <span className="flex items-center gap-2">
                  {c.status === "waived" ? <Badge variant="outline">Waived</Badge> : null}
                  <span className="font-medium">{formatMoney(c.amountCents)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
