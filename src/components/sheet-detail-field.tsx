import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The fields on a right-side detail panel (reservation, squawk, cancellation, …).
 *
 * WHY THESE ARE ROWS AND NOT STACKS. Every one of these panels is 384px wide and every
 * one of them used to spend two lines and a 20px gap on each field: an uppercase label
 * on one line, its value on the next. Six fields ran to roughly 300px of chrome before
 * the reader reached anything they could act on, and the shouted labels made a plain
 * record read like a form. Label and value now share a line, separated by a hairline
 * rather than by air, which is the same key/value idiom the record PAGES already use.
 *
 * `stacked` is for prose. A squawk's description in a 230px column is a ladder of two-word
 * lines, so anything paragraph-shaped puts its value under the label at full width.
 */
export function SheetDetailField({
  icon: Icon,
  label,
  stacked = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  /** Value goes under the label at full width. For descriptions and notes. */
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "py-2.5 text-[13px] first:pt-0 last:pb-0",
        stacked ? "space-y-1.5" : "flex items-start gap-3"
      )}
    >
      <div
        className={cn(
          "flex gap-2 text-muted-foreground",
          //A label too long for the column wraps rather than truncating: the label is
          //what makes the value mean anything, so it is the last thing to cut. Anything
          //routinely wider than this belongs in `stacked` instead.
          stacked ? "items-center" : "w-[100px] shrink-0"
        )}
      >
        <Icon className={cn("size-3.5 shrink-0", !stacked && "mt-[3px]")} />
        <span>{label}</span>
      </div>
      <div className={cn("min-w-0", !stacked && "flex-1")}>{children}</div>
    </div>
  );
}

/**
 * The group the fields live in. Hairlines between rows, nothing around the outside, so a
 * panel reads as one list of facts rather than as a stack of cards.
 */
export function SheetDetailFields({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("divide-y divide-border", className)}>{children}</div>;
}
