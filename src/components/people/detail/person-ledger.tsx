import { AutoRefillCard } from "@/components/me-money/auto-refill-card";
import { MemberLedgerTable } from "@/components/me-money/member-ledger-table";

/**
 * Account ledger on People → Ledger. Self: Add funds. Admin: desk credit / refund / reassign.
 */
export function PersonLedger({
  orgUserId,
  isSelf,
  canManage,
  outsideParty,
}: {
  orgUserId: number;
  isSelf?: boolean;
  canManage?: boolean;
  /** An aircraft owner the shop wrote down: never signed up, no account to top up. */
  outsideParty?: boolean;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" data-doc-shot="person-ledger">
      {/*
        Not for somebody who has never signed up. Auto-refill tops up a member's own balance
        from their own saved card, and an outside party has neither. Worse, turning it on
        used to MINT a live Stripe customer for them before refusing; the server now refuses
        first, and this stops offering it.
      */}
      {(isSelf || canManage) && !outsideParty && <AutoRefillCard orgUserId={orgUserId} compact />}
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
