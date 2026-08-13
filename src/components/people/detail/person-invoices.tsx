import { MemberInvoicesTable } from "@/components/me-money/member-invoices-table";

/**
 * This person's invoices on People → Billing (or Invoices, when the school
 * uses an account ledger). `onPay` is only wired when the viewer IS this person.
 */
export function PersonInvoices({
  orgUserId,
  isSelf,
  fill = false,
}: {
  orgUserId: number;
  isSelf: boolean;
  fill?: boolean;
}) {
  return (
    <MemberInvoicesTable
      orgUserId={orgUserId}
      isSelf={isSelf}
      fill={fill}
      showTitle={!fill}
    />
  );
}
