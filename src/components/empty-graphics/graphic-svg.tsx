import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Size every empty drawing to 108px tall, width from the viewBox aspect. */
export function EmptyGraphicSvg({
  viewBox,
  className,
  children,
}: {
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  const w = parts[2] ?? 80;
  const h = parts[3] ?? 108;
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMinYMin meet"
      fill="none"
      aria-hidden="true"
      className={cn("text-foreground", className)}
      style={{ height: 108, width: (108 * w) / h }}
    >
      {children}
    </svg>
  );
}
