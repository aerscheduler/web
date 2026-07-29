import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Shared list/table search field — same look as People / Billing. */
export function ListSearch({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}

/** Case-insensitive substring match across any of the given fields. */
export function matchesSearch(
  fields: Array<string | null | undefined>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}
