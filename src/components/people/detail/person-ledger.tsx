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
    <MemberLedgerTable
      orgUserId={orgUserId}
      isSelf={isSelf}
      canManage={canManage}
      showTitle
      fill
    />
  );
}
