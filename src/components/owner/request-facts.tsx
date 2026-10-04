import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { OwnerRequestDetails } from "@/types/api";

/**
 * What an owner said with their request beyond the words (Murray spec 7): when it could come
 * in, whether it is grounded, where it is, and its times. Read the same on the shop's job page and
 * on the owner's own; nothing at all when they said none of it.
 */
export type RequestDetails = OwnerRequestDetails;

const day = (d: string) => format(parseISO(d), "EEE, MMM d");
const hours = (t: number) => (t / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RequestFacts({ details, className }: { details: RequestDetails | null | undefined; className?: string }) {
  if (!details) return null;
  const rows: { label: string; value: string; tone?: string }[] = [];
  if (details.grounded === true) rows.push({ label: "Grounded", value: "Yes. It cannot fly as it is.", tone: "font-semibold text-warning" });
  if (details.grounded === false) rows.push({ label: "Grounded", value: "No. It can fly in." });
  if (details.preferredFrom) {
    rows.push({
      label: "Can come in",
      value: details.preferredTo && details.preferredTo !== details.preferredFrom ? `${day(details.preferredFrom)} to ${day(details.preferredTo)}` : day(details.preferredFrom),
    });
  }
  if (details.location) rows.push({ label: "Where it is", value: details.location });
  const r = details.reading;
  if (r && (r.hobbsTime != null || r.tachTime != null)) {
    const parts = [r.hobbsTime != null ? `Hobbs ${hours(r.hobbsTime)}` : null, r.tachTime != null ? `tach ${hours(r.tachTime)}` : null].filter(Boolean).join(", ");
    rows.push({ label: "Times given", value: `${parts.charAt(0).toUpperCase()}${parts.slice(1)}, ${format(parseISO(r.readAt), "MMM d")}` });
  }
  if (!rows.length) return null;
  return (
    <dl className={cn("grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]", className)} data-testid="request-facts">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn("min-w-0 [overflow-wrap:anywhere]", row.tone)}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
