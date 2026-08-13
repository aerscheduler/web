import { useMemo, useState } from "react";
import { format, isValid, parseISO, subDays } from "date-fns";
import { toast } from "sonner";
import { useEmailLedgerStatement, useMemberLedgerStatement } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { DetailPanel } from "@/components/detail-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocsHint } from "@/components/docs-hint";
import { ledgerEntryLabel } from "@/lib/ledger-labels";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Match server STATEMENT_MAX_SPAN_MS (two calendar years including a leap day). */
const STATEMENT_MAX_SPAN_MS = 2 * 366 * 24 * 60 * 60 * 1000;

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function dayStartIso(day: string) {
  if (!DAY_RE.test(day)) return null;
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dayEndIso(day: string) {
  if (!DAY_RE.test(day)) return null;
  const d = new Date(`${day}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtWhen(iso: string) {
  const d = parseISO(iso);
  return isValid(d) ? format(d, "MMM d, yyyy") : iso.slice(0, 10);
}

/**
 * Period statement in the right-hand panel: opening, period lines with running
 * balance, closing. Print uses the same isolated print CSS as receipts.
 */
export function LedgerStatementSheet({
  orgUserId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [fromDay, setFromDay] = useState(() => ymd(subDays(today, 30)));
  const [toDay, setToDay] = useState(() => ymd(today));

  let range: { start: string; end: string } | null = null;
  let rangeError: string | null = null;
  if (!fromDay || !toDay) {
    rangeError = "Pick a start and end date.";
  } else if (fromDay > toDay) {
    rangeError = "Start must be on or before end.";
  } else {
    const start = dayStartIso(fromDay);
    const end = dayEndIso(toDay);
    if (!start || !end) {
      rangeError = "Pick a start and end date.";
    } else if (Date.parse(end) - Date.parse(start) > STATEMENT_MAX_SPAN_MS) {
      rangeError = "Statement period cannot exceed two years.";
    } else {
      range = { start, end };
    }
  }

  const q = useMemberLedgerStatement(orgUserId, open ? range : null);
  const email = useEmailLedgerStatement(orgUserId);
  const stmt = q.data;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="inline-flex items-center gap-1.5">
          Statement
          <DocsHint topic="ledger-statement" />
        </span>
      }
      description="Opening balance, period activity, and closing. Not a Stripe invoice."
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            disabled={!stmt}
            className="w-full"
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!stmt || email.isPending}
            className="w-full"
            onClick={() => {
              if (!range) return;
              email.mutate(
                { ...range, periodLabel: `${fromDay} to ${toDay}` },
                {
                  onSuccess: (data) => toast.success(`Statement sent to ${data.to}`),
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError ? err.message : "Couldn't email this statement"
                    ),
                }
              );
            }}
          >
            {email.isPending ? "Sending…" : "Email statement"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-4 text-sm">
        <div className="grid grid-cols-2 gap-3 print:hidden">
          <div className="space-y-1.5">
            <Label htmlFor="stmt-start">From</Label>
            <Input
              id="stmt-start"
              type="date"
              value={fromDay}
              onChange={(e) => setFromDay(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stmt-end">To</Label>
            <Input
              id="stmt-end"
              type="date"
              value={toDay}
              onChange={(e) => setToDay(e.target.value)}
            />
          </div>
        </div>

        {rangeError && <p className="text-sm text-destructive">{rangeError}</p>}

        {q.isPending && !rangeError && (
          <p className="text-muted-foreground">Loading statement…</p>
        )}
        {q.isError && (
          <p className="text-destructive">
            {q.error instanceof ApiError ? q.error.message : "Couldn't load this statement."}
          </p>
        )}

        {stmt && (
          <div className="space-y-4" data-print-receipt>
            <div>
              <div className="font-medium">Account statement</div>
              <div className="text-muted-foreground">
                {fmtWhen(stmt.start)} to {fmtWhen(stmt.end)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Opening</div>
                <div className="tnum font-medium">{formatMoney(stmt.openingCents)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Closing</div>
                <div className="tnum font-medium">{formatMoney(stmt.closingCents)}</div>
              </div>
            </div>
            {stmt.entries.length === 0 ? (
              <p className="text-muted-foreground">No entries in this period.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 font-medium">Date</th>
                    <th className="py-1.5 font-medium">Type</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                    <th className="py-1.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.entries.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="py-1.5 text-muted-foreground">{fmtWhen(row.createdAt)}</td>
                      <td className="py-1.5">
                        {ledgerEntryLabel(row.type)}
                        {row.memo ? (
                          <span className="block max-w-[12rem] truncate text-xs text-muted-foreground">
                            {row.memo}
                          </span>
                        ) : null}
                      </td>
                      <td className="tnum py-1.5 text-right">{formatMoney(row.amountCents)}</td>
                      <td className="tnum py-1.5 text-right">
                        {formatMoney(row.runningBalanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </DetailPanel>
  );
}
