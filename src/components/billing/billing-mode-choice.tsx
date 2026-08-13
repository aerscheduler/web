/**
 * Shared invoice-vs-ledger choice cards. Used in Settings → Billing (with confirm)
 * and Connect-billing onboarding (pick once, save on continue).
 */

import type { ReactNode } from "react";
import { Check, Receipt, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BillingMode = "invoice" | "ledger";

const OPTIONS: Array<{
  value: BillingMode;
  title: string;
  badge: string;
  points: string[];
  icon: ReactNode;
}> = [
  {
    value: "invoice",
    title: "Invoice each booking",
    badge: "Default",
    icon: <Receipt className="size-4" />,
    points: [
      "A new invoice for each visit or fee (flights, sims, ground, and more)",
      "Member pays that invoice (card or desk)",
      "Familiar pay-as-you-go for most schools",
    ],
  },
  {
    value: "ledger",
    title: "Account ledger",
    badge: "Balance",
    icon: <Wallet className="size-4" />,
    points: [
      "Members keep a running account balance",
      "Top up or desk credit; balance shows on Home",
      "Bookings and fees post to the ledger (rolling out)",
    ],
  },
];

export function BillingModeCards({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: BillingMode;
  onChange: (next: BillingMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How members pay"
      className={cn("grid gap-3 sm:grid-cols-2", className)}
    >
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex h-full flex-col rounded-xl border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
              disabled && "cursor-not-allowed opacity-60"
            )}
            data-mode={opt.value}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-md",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {opt.icon}
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant={selected ? "default" : "secondary"} className="font-normal">
                  {opt.badge}
                </Badge>
                {selected && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{opt.title}</p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {opt.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
