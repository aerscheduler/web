import { createFileRoute } from "@tanstack/react-router";
import { Building2, CircleDollarSign, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { useOrgLedgerSettings } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { DocsHint } from "@/components/docs-hint";
import { TableView } from "@/components/table-view";
import { EmptyState, TableSkeleton } from "@/components/states";
import { MemberLedgerTable } from "@/components/me-money/member-ledger-table";
import { MemberInvoicesTable } from "@/components/me-money/member-invoices-table";
import { AddFundsDialog } from "@/components/me-money/add-funds-dialog";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ME_LEDGER_RAIL = [
  {
    items: [
      { value: "ledger", label: "Ledger", icon: Wallet },
      { value: "invoices", label: "Invoices", icon: Receipt },
    ],
  },
];

export const Route = createFileRoute("/_authed/me/invoices")({
  validateSearch: (s: Record<string, unknown>): {
    tab?: "ledger" | "invoices";
    invoice?: number;
  } => {
    const invoice = Number.parseInt(String(s.invoice ?? ""), 10);
    return {
      tab: s.tab === "invoices" || s.tab === "ledger" ? s.tab : undefined,
      ...(Number.isFinite(invoice) ? { invoice } : {}),
    };
  },
  component: MyInvoicesPage,
});

function MyInvoicesPage() {
  const { organization, orgUserId } = useAuth();
  const navigate = Route.useNavigate();
  const { tab, invoice } = Route.useSearch();
  const ledgerSettingsQ = useOrgLedgerSettings();
  const ledgerOn = ledgerSettingsQ.data?.enabled === true;
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const pane =
    ledgerOn && (tab === "invoices" || (tab == null && invoice != null))
      ? "invoices"
      : "ledger";

  if (!organization) {
    return (
      <TableView>
        <TableView.Header>
          <PageHeader title="Billing" subtitle="What your school has charged you." />
        </TableView.Header>
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Join or pick a flight school and your invoices will show up here."
          />
        </Card>
      </TableView>
    );
  }

  return (
    <TableView data-doc-shot="my-invoices">
      <TableView.Header>
        <PageHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              Billing
              {ledgerOn && <DocsHint topic="account-ledger" />}
            </span>
          }
          subtitle={
            ledgerOn
              ? pane === "invoices"
                ? "Leftover invoices from before the account ledger, and guest bills."
                : "Your account balance, credits, and charges."
              : "What your school has charged you, what you owe and what's settled."
          }
          actions={
            ledgerOn && orgUserId != null ? (
              <Button onClick={() => setAddFundsOpen(true)}>
                <CircleDollarSign className="size-4" /> Add funds
              </Button>
            ) : undefined
          }
        />
      </TableView.Header>

      {ledgerSettingsQ.isPending || orgUserId == null ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </Card>
      ) : ledgerOn ? (
        <div className={RAIL_ROW}>
          <SectionRail
            label="Billing"
            sections={ME_LEDGER_RAIL}
            value={pane}
            onChange={(next) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  tab: next === "invoices" ? "invoices" : "ledger",
                }),
                replace: true,
              })
            }
          />
          {pane === "invoices" ? (
            <MemberInvoicesTable
              orgUserId={orgUserId}
              isSelf
              fill
              openInvoiceId={invoice}
            />
          ) : (
            <MemberLedgerTable orgUserId={orgUserId} isSelf fill />
          )}
        </div>
      ) : (
        <MemberInvoicesTable
          orgUserId={orgUserId}
          isSelf
          fill
          openInvoiceId={invoice}
        />
      )}

      {orgUserId != null && (
        <AddFundsDialog
          orgUserId={orgUserId}
          open={addFundsOpen}
          onOpenChange={setAddFundsOpen}
        />
      )}
    </TableView>
  );
}
