import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
  accent = "primary",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  loading?: boolean;
  accent?: "primary" | "warning" | "success";
}) {
  const tone =
    accent === "warning"
      ? "bg-[color-mix(in_oklch,var(--warning)_16%,transparent)] text-[color-mix(in_oklch,var(--warning)_65%,var(--foreground))]"
      : accent === "success"
        ? "bg-[color-mix(in_oklch,var(--success)_14%,transparent)] text-[var(--success)]"
        : "bg-primary/10 text-primary";

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-2.5 h-7 w-24" />
          ) : (
            <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">
              {value}
            </div>
          )}
          {hint && !loading && (
            <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
          )}
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", tone)}>
          <Icon className="size-5" />
        </span>
      </div>
    </Card>
  );
}
