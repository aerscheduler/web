import { AutoRefillCard } from "@/components/me-money/auto-refill-card";
import { MemberLedgerTable } from "@/components/me-money/member-ledger-table";

/**
 * Account ledger on People → Ledger. Self: Add funds. Admin: desk credit / refund / reassign.
 */
export function PersonLedger({
  orgUserId,
  isSelf,
  canManage,
}: {
  orgUserId: number;
  isSelf?: boolean;
  canManage?: boolean;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" data-doc-shot="person-ledger">
      {(isSelf || canManage) && <AutoRefillCard orgUserId={orgUserId} compact />}
      <MemberLedgerTable
        orgUserId={orgUserId}
        isSelf={isSelf}
        canManage={canManage}
        showTitle
        fill
      />
    </div>
  );
}
