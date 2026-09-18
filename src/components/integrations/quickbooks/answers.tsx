import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuickBooksSettings, QuickBooksSetupStep } from "@/features/queries";
import { formatDateKey, OWNERSHIP_OPTIONS } from "./labels";

/**
 * The setup answers after setup: one row each, the answer as it stands, and Change,
 * which opens that one question in the same flow setup used.
 */
export function QuickBooksAnswersPane({
  row,
  onChange,
}: {
  row: QuickBooksSettings;
  onChange: (step: QuickBooksSetupStep) => void;
}) {
  const splitCount = Object.keys(row.incomeItemMap ?? {}).length;
  const answers: Array<{ step: QuickBooksSetupStep; label: string; value: ReactNode }> = [
    { step: "confirm_company", label: "Company", value: row.companyConfirmed ? row.companyName : null },
    {
      step: "books_ownership",
      label: "What else records this revenue",
      value: OWNERSHIP_OPTIONS.find((o) => o.value === row.booksOwnershipAnswer)?.label,
    },
    {
      step: "start_date",
      label: "Posting from",
      value: row.effectiveStartDateKey ? formatDateKey(row.effectiveStartDateKey) : null,
    },
    {
      step: "income_item",
      label: "Income item",
      value: row.incomeItemName
        ? `${row.incomeItemName}${splitCount ? `, plus ${splitCount} per kind of charge` : ""}`
        : null,
    },
    { step: "deposit_account", label: "Card payments land in", value: row.depositAccountName },
    {
      step: "desk_payments",
      label: "Front-desk payments",
      value:
        row.syncDeskPayments == null
          ? null
          : row.syncDeskPayments
            ? `Posted, to ${row.deskDepositAccountName ?? "…"}`
            : "Not posted",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup</CardTitle>
        <CardDescription>
          Changes apply to receipts posted from now on. Receipts already posted stay as they are.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {answers.map((a) => (
            <li key={a.step} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">{a.label}</div>
                <div className="truncate text-sm font-medium">
                  {a.value ?? <span className="text-muted-foreground">Not answered</span>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onChange(a.step)}>
                Change
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
