/**
 * Needs attention — a to-do list, not a statistic.
 *
 * The part of the Overview neither competitor has. Every entry is a real filter
 * over a real report, so the count is always clickable through to the exact rows
 * behind it: "Flown, not invoiced: 4" opens the flight log showing those four
 * flights. That is the difference between a dashboard that tells you something
 * is wrong and one that takes you to it.
 *
 * Items at zero are shown, greyed, rather than hidden. "No overdue invoices" is
 * a thing a school wants to see confirmed, and a strip that silently drops
 * everything healthy leaves you unsure whether it ran at all.
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { OverviewAttention } from "@/types/reports";

const TONE: Record<OverviewAttention["tone"], { text: string; chip: string }> = {
  danger: {
    text: "text-destructive",
    chip: "bg-destructive/10 text-destructive",
  },
  warning: {
    text: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
    chip: "bg-[color-mix(in_oklch,var(--warning)_16%,transparent)] text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
  },
  info: { text: "text-primary", chip: "bg-primary/10 text-primary" },
};

export function AttentionStrip({
  items,
  loading,
  onOpen,
}: {
  items: OverviewAttention[];
  loading?: boolean;
  onOpen: (item: OverviewAttention) => void;
}) {
  if (!loading && items.length === 0) return null;

  const outstanding = items.filter((i) => i.count > 0);
  const clear = items.filter((i) => i.count === 0);

  return (
    <Card data-doc-shot="reports-overview-attention">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Needs attention</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <>
            {outstanding.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-[var(--success)]" />
                Nothing needs attention right now.
              </p>
            ) : (
              // Two across until the pane is genuinely wide: at four columns
              // inside the report pane, "Awaiting close-out" truncates to
              // "Awaiting cl…", which is worse than a shorter grid.
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {outstanding.map((item) => {
                  const tone = TONE[item.tone];
                  return (
                    <AttentionItem
                      key={item.key}
                      item={item}
                      icon={AlertTriangle}
                      toneText={tone.text}
                      toneChip={tone.chip}
                      onOpen={onOpen}
                    />
                  );
                })}
              </div>
            )}

            {clear.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success)]" />
                Clear:
                {clear.map((item, i) => (
                  <span key={item.key}>
                    {item.label.toLowerCase()}
                    {i < clear.length - 1 ? "," : ""}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionItem({
  item,
  icon: Icon,
  toneText,
  toneChip,
  onOpen,
}: {
  item: OverviewAttention;
  icon: LucideIcon;
  toneText: string;
  toneChip: string;
  onOpen: (item: OverviewAttention) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.hint}
      className="group flex items-start gap-2.5 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md", toneChip)}>
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("text-lg font-semibold leading-none tabular-nums", toneText)}>
            {item.count}
          </span>
          {/* The label wraps rather than truncating: which thing needs attention
              is the entire point of the row, and "Maintenanc…" doesn't say it. */}
          <span className="text-sm font-medium leading-tight">{item.label}</span>
        </span>
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">{item.hint}</span>
      </span>
      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
