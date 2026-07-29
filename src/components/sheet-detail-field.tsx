import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Label + value row used in right-side detail sheets (reservation, cancellation, …).
 * Matches the layout in `ReservationDetailSheet`.
 */
export function SheetDetailField({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
