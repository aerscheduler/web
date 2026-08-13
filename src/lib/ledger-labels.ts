import type { LedgerEntry } from "@/types/api";

/** Human labels for ledger entry types. Shared by People Billing and /me Billing. */
export function ledgerEntryLabel(type: string): string {
  switch (type) {
    case "topup":
      return "Top-up";
    case "cash":
      return "Cash";
    case "check":
      return "Check";
    case "other":
      return "Other credit";
    case "adjustment":
      return "Adjustment";
    case "flight_charge":
      return "Flight";
    case "item_charge":
      return "Charge";
    case "fee":
      return "Fee";
    case "refund":
      return "Refund";
    case "reversal":
      return "Reversal";
    default:
      return type;
  }
}

export const LEDGER_RECEIPT_TYPES = new Set(["flight_charge", "item_charge", "fee"]);

/** Who posted this row. Desk actions name the admin; card top-ups name the member. */
export function ledgerPostedByLabel(entry: LedgerEntry): string {
  if (entry.createdBy?.name?.trim()) return entry.createdBy.name.trim();
  if (entry.createdByOrgUserId) return `Member #${entry.createdByOrgUserId}`;
  if (entry.type === "topup") return "Card";
  return "System";
}

export const LEDGER_TYPE_FACET_OPTIONS = [
  { value: "topup", label: "Top-up" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other credit" },
  { value: "adjustment", label: "Adjustment" },
  { value: "flight_charge", label: "Flight" },
  { value: "item_charge", label: "Charge" },
  { value: "fee", label: "Fee" },
  { value: "refund", label: "Refund" },
  { value: "reversal", label: "Reversal" },
] as const;
