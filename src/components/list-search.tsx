import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** Shared list/table search field — same look as People / Billing.
 *  Pair with `useDebouncedValue` when the value drives a server `q` param.
 */
export function ListSearch({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /**
   * What the field searches ("Search tail, make, model…"). Shown in full on md+;
   * on a phone the field is too narrow to finish the sentence, so it falls back
   * to plain "Search" rather than a clipped list that names one of three things.
   * The accessible name keeps the full text at every width — a screen reader is
   * not the thing running out of room.
   */
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const isMobile = useIsMobile();

  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isMobile ? "Search" : placeholder}
        className="pl-8"
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}

/** @deprecated Prefer server-side `q`. Kept for rare local-only filters. */
export function matchesSearch(
  fields: Array<string | null | undefined>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}
