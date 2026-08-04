import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";

/**
 * The shell every record page in the console is built from — a person, an
 * aircraft, and whatever gets its own page next.
 *
 * These pages are deep-linked from search, from a notification, and from a
 * bookmark, which means they are routinely the FIRST page of a session. That is
 * the whole reason `DetailBack` is an explicit link to the list rather than a
 * `history.back()`: on a cold load there is no history to go back to, and a back
 * button that does nothing on the exact entry point people arrive through is
 * worse than no back button at all.
 */

export function DetailBack({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="-ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft className="size-4" />
      {label}
    </Link>
  );
}

/**
 * Identity block: who or what this page is about, its state, and the actions on
 * it. `media` is the avatar or tail chip, `meta` the quiet line of facts under
 * the title.
 */
export function DetailHeader({
  media,
  title,
  titleClassName,
  subtitle,
  badges,
  meta,
  actions,
}: {
  media?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {media}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className={cn(
                "text-[22px] font-semibold leading-tight tracking-[-0.01em]",
                titleClassName
              )}
            >
              {title}
            </h1>
            {badges}
          </div>
          {/* A div, not a p: callers pass role badges and other block content
              here, and a <div> inside a <p> is invalid HTML the browser silently
              re-parents — which shows up as a React hydration error. */}
          {subtitle && (
            <div className="mt-1 text-[13px] text-muted-foreground">{subtitle}</div>
          )}
          {meta && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** One fact in the header's meta line, e.g. an envelope icon and an address. */
export function MetaItem({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A titled card. `action` sits opposite the title (a "View all" link, a button);
 * `description` is the one line explaining what the card is counting, which is
 * where most of the ambiguity in a report lives.
 */
export function DetailCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && (
            <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className={cn("min-w-0 flex-1", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

/** Label/value rows — the record's own fields, as opposed to its activity. */
export function KeyValueList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border">{children}</dl>;
}

export function KeyValue({
  label,
  children,
  mono,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-[13px] font-medium",
          mono && "font-mono tabular-nums"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Placeholder for a card whose query hasn't landed yet. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** The quiet "nothing here" line inside a card — smaller than a full EmptyState. */
export function CardEmpty({ children }: { children: ReactNode }) {
  return <p className="py-1 text-[13px] text-muted-foreground">{children}</p>;
}

/**
 * Does this error mean "no such record" rather than "something went wrong"?
 *
 * A record page is reached by URL — a stale bookmark, an old notification, a
 * pasted link, a typo — so a bad id is the *expected* failure, not an exotic
 * one. The server can't say "not found" for an id outside your organization
 * without confirming that it exists somewhere, so it answers 403 (people) or
 * 400 (resources) instead. Surfacing those verbatim tells someone who mistyped
 * a URL that they aren't authorized, which reads like an accusation and offers
 * no way out.
 *
 * 404 is included for completeness; these routes don't currently return it.
 */
export function isMissingRecord(error: unknown): boolean {
  return error instanceof ApiError && [400, 403, 404].includes(error.status);
}

/**
 * The "this record isn't here" page, with a way back to the list.
 *
 * Rendered for a missing record AND for a query that has settled with nothing —
 * see the note at each call site. A page whose only other option is an infinite
 * skeleton has to have somewhere to land.
 */
export function RecordNotFound({
  icon,
  title,
  body,
  backTo,
  backLabel,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  backTo: string;
  backLabel: string;
}) {
  return (
    <Card>
      <EmptyState
        icon={icon}
        title={title}
        body={body}
        action={
          <Button asChild>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        }
      />
    </Card>
  );
}

/**
 * Put the record's own name in the browser tab.
 *
 * `RouteTitle` in `__root.tsx` sets a per-route title on navigation, which gives
 * every profile the same "People". These pages are the ones people keep several
 * of open at once, so once the record has loaded it names its own tab. Runs
 * after the route-level effect (the record arrives later than the navigation),
 * and stands down while `name` is null so it never blanks the title mid-load.
 */
export function useDetailTitle(name: string | null | undefined) {
  useEffect(() => {
    if (!name) return;
    document.title = `${name} · AerScheduler`;
  }, [name]);
}
