import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid } from "@/components/stat-card";
import { DOCS_TOPICS, docsUrl, type DocsTopicKey } from "@/lib/docs-links";
import { EmptyGraphic, type EmptyGraphicId } from "@/components/empty-graphics";
import { cn } from "@/lib/utils";

/**
 * Parent class for a Card (or other flex child) that should fill remaining
 * page height so EmptyState can sit in the vertical middle.
 */
export const emptyFillClass = "flex min-h-0 flex-1 flex-col";

export function EmptyState({
  icon: Icon,
  graphic,
  title,
  body,
  hint,
  action,
  docs,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  /** Page-level drawing from `empty-graphics/`. Wins over `icon` when both are set. */
  graphic?: EmptyGraphicId;
  title: string;
  body?: string;
  /** Quieter second paragraph under the body, for a how-to or extra detail. */
  hint?: ReactNode;
  action?: ReactNode;
  /** Help article shown as a secondary Documentation button. */
  docs?: DocsTopicKey;
  /**
   * Tight padding for sheets and inline panels that should not grow to fill
   * the page. Page-level empties leave this off so they sit in the vertical
   * middle of the card. The inner column stays left-aligned; mx-auto keeps the
   * whole block centered in the card. Do not pin this to the card's left edge.
   */
  compact?: boolean;
  className?: string;
}) {
  const docsEntry = docs ? DOCS_TOPICS[docs] : undefined;

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center px-6",
        compact ? "py-10" : "h-full min-h-64 flex-1 py-16",
        className
      )}
    >
      <div className="mx-auto flex w-fit max-w-md flex-col items-start text-left">
        {graphic ? (
          <EmptyGraphic id={graphic} />
        ) : Icon ? (
          <Icon className="size-7 text-muted-foreground" strokeWidth={1.5} />
        ) : null}
        <h2 className="mt-5 text-lg font-semibold tracking-tight">{title}</h2>
        {body && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        )}
        {hint && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground/80">{hint}</p>
        )}
        {(action || docsEntry) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {action}
            {docsEntry && (
              <Button asChild variant="outline">
                <a href={docsUrl(docsEntry.href)} target="_blank" rel="noreferrer">
                  Documentation
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  // A genuinely expired session never reaches here, the API layer signs the
  // user out and routes to /login. So a 401/403 that does land here means "you
  // aren't allowed to see this" and retrying it would just fail again.
  const auth = error instanceof ApiError && (error.status === 401 || error.status === 403);
  // Show the API's real message (a 400 can mean many things, don't assume "no org").
  const message =
    error instanceof ApiError ? error.message : "Something went wrong loading this data.";
  return (
    <div className="flex h-full min-h-64 w-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mx-auto flex w-fit max-w-md flex-col items-start text-left">
        <AlertTriangle className="size-7 text-destructive" strokeWidth={1.5} />
        <h2 className="mt-5 text-lg font-semibold tracking-tight">Couldn&rsquo;t load this</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{message}</p>
        {onRetry && !auth && (
          <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
            <RefreshCw className="size-4" /> Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-5"
              style={{ width: c === 0 ? "34%" : `${Math.max(12, 22 - c * 3)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <StatGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </StatGrid>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function CalendarGridSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}
