import { Receipt } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useBillEnrollmentFee, useMyTrainingGrants } from "@/features/queries";
import { holdsTrainingGrant } from "@/lib/training";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The course fee on one enrollment.
 *
 * Renders nothing when the course is free, which is most of them — a permanent "Fee: none"
 * row would be noise on every enrollment at every school that does not charge one.
 *
 * The amount shown is the enrollment's own snapshot, not the course's current price, so a
 * student who enrolled before a price rise sees what they actually owe. That is the whole
 * point of storing it, and showing the live course price here would undo it.
 */
export function EnrollmentFeeCard({
  enrollmentId,
  feeCents,
  feeStatus,
  feeInvoiceId,
}: {
  enrollmentId: number;
  feeCents: number | null;
  feeStatus: "none" | "owed" | "invoiced" | undefined;
  feeInvoiceId: number | null;
}) {
  const bill = useBillEnrollmentFee();
  //POST /training/enrollments/:id/fee is `manageEnrollment`. Same reason as the lifecycle
  //actions: this card renders on a page a student can open about themselves.
  const canBill = holdsTrainingGrant(useMyTrainingGrants().data, "manageEnrollment");

  if (!feeCents || feeStatus === "none" || !feeStatus) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">Course fee</h2>
            <p className="text-xs text-muted-foreground">
              {formatMoney(feeCents)}
              {feeStatus === "invoiced" ? " · invoiced" : " · not billed yet"}
            </p>
          </div>
        </div>

        {feeStatus === "invoiced" ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Invoiced</Badge>
            {feeInvoiceId ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/billing" search={{ id: feeInvoiceId } as never}>
                  View invoice
                </Link>
              </Button>
            ) : null}
          </div>
        ) : canBill ? (
          <Button size="sm" disabled={bill.isPending} onClick={() => bill.mutate(enrollmentId)}>
            {bill.isPending ? "Billing…" : `Bill ${formatMoney(feeCents)}`}
          </Button>
        ) : (
          <Badge variant="outline">Not billed yet</Badge>
        )}
      </div>

      {bill.error ? (
        <p className="mt-2 text-sm text-destructive">{(bill.error as Error).message}</p>
      ) : null}
    </Card>
  );
}
