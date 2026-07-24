import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <div className="mt-1 text-base font-medium">{title}</div>
      {body && <div className="max-w-sm text-sm text-muted-foreground">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const noOrg = error instanceof ApiError && error.status === 400;
  const auth = error instanceof ApiError && error.status === 401;
  const message =
    noOrg
      ? "This view needs an active organization. Pick or join one, then reload."
      : auth
        ? "Your session expired. Please sign in again."
        : error instanceof ApiError
          ? error.message
          : "Something went wrong loading this data.";
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <div className="mt-1 text-base font-medium">Couldn&rsquo;t load this</div>
      <div className="max-w-sm text-sm text-muted-foreground">{message}</div>
      {onRetry && !auth && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      )}
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
