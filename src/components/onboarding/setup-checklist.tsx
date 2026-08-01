/**
 * The setup checklist, rendered wherever setup is still in progress.
 *
 * Two variants of one component, never two components: the wizard's last screen shows
 * the first few items as a send-off, the dashboard shows the whole list as the
 * school's standing to-do. Same registry, same completion logic, same copy — so an
 * item added to `lib/onboarding-checklist.ts` turns up in both without being written
 * twice, and the two can never disagree about what's done.
 */

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, MoreHorizontal, Sparkles, Undo2, X } from "lucide-react";
import { useChecklist, resolveCopy, type ChecklistEntry } from "@/features/onboarding";
import { flowFor } from "@/components/onboarding/flows";
import type { OrgType } from "@/lib/onboarding-checklist";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Outstanding items shown before "Show more" — one full row of the grid at its
 *  widest, so the collapsed state is a tidy rectangle rather than a ragged one. */
const COLLAPSED = 4;

export function SetupChecklist({ className }: { className?: string }) {
  const state = useChecklist();
  const [expanded, setExpanded] = React.useState(false);
  // The open flow lives HERE, not in the card that launched it. Finishing a task
  // removes its item from `remaining`, which unmounts that card — and a flow rendered
  // inside it would be torn down mid-success-screen, so the one screen confirming the
  // work actually happened is the one screen you'd never see.
  const [flowId, setFlowId] = React.useState<string | null>(null);
  const ActiveFlow = flowId ? flowFor(flowId) : undefined;

  if (!state.visible) return null;

  if (state.loading) {
    return (
      <Card className={cn("p-5", className)}>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-3 h-1.5 w-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const outstanding = state.remaining;
  const shown = expanded ? outstanding : outstanding.slice(0, COLLAPSED);
  const waived = state.entries.filter((e) => e.dismissed);

  return (
    <Card className={cn("gap-0 p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">Finish setting up</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {state.trackCaption ?? "Each one makes the schedule, the money, or the paperwork work harder."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {state.percent}% configured
          </span>
          {/* Only ever holds undo. There is deliberately no "hide this for good":
              dismissing the items you don't want IS how the card goes away, and it
              retires itself once nothing outstanding is left. */}
          {waived.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Dismissed items">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {waived.map((e) => (
                  <DropdownMenuItem key={e.item.id} onSelect={() => state.restoreItem(e.item.id)}>
                    <Undo2 className="size-4" />
                    Bring back &ldquo;{resolveCopy(e.item.title, state.orgType)}&rdquo;
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Progress value={state.percent} aria-label="Setup progress" className="mt-4 h-1.5" />

      {/* Only what's LEFT. A list of things you already did is a trophy cabinet, not a
          checklist — the percentage already says how far along you are. */}
      {outstanding.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--success)_10%,transparent)] px-3 py-2.5 text-sm text-success">
          <Sparkles className="size-4" /> Everything on the list is done. Nice.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((entry) => (
            <ItemCard
              key={entry.item.id}
              entry={entry}
              orgType={state.orgType}
              onDismiss={() => state.dismissItem(entry.item.id)}
              onOpenFlow={() => setFlowId(entry.item.id)}
            />
          ))}
        </div>
      )}

      {outstanding.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show less" : `Show ${outstanding.length - COLLAPSED} more`}
        </button>
      )}

      {ActiveFlow && <ActiveFlow onClose={() => setFlowId(null)} />}
    </Card>
  );
}

/**
 * The wizard's send-off: the same items, the top few, no dismissal.
 *
 * Someone thirty seconds into the product has no basis for deciding an outcome
 * doesn't apply to them — so waving items off is a dashboard affordance, once they've
 * seen the place. Here it's purely "this is what's next".
 */
export function SetupChecklistPreview({ limit = 4 }: { limit?: number }) {
  const state = useChecklist();
  const [flowId, setFlowId] = React.useState<string | null>(null);
  const ActiveFlow = flowId ? flowFor(flowId) : undefined;
  if (state.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {state.trackCaption && (
        <p className="mb-3 text-sm text-muted-foreground">{state.trackCaption}</p>
      )}
      <div className="space-y-2">
        {state.remaining.slice(0, limit).map((entry) => (
          <ItemRow
            key={entry.item.id}
            entry={entry}
            orgType={state.orgType}
            onOpenFlow={() => setFlowId(entry.item.id)}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        The rest is waiting on your dashboard — nothing here blocks you from flying.
      </p>
      {ActiveFlow && <ActiveFlow onClose={() => setFlowId(null)} />}
    </div>
  );
}

/**
 * One outstanding item as a tile in the dashboard grid.
 *
 * Laid out top-to-bottom with the CTA pushed to the bottom by `mt-auto`, so a row of
 * these lines its buttons up however uneven the blurbs are. The blurb is clamped for
 * the same reason — one long line shouldn't set the height of the whole row.
 */
function ItemCard({
  entry,
  orgType,
  onDismiss,
  onOpenFlow,
}: {
  entry: ChecklistEntry;
  orgType: OrgType;
  onDismiss?: () => void;
  onOpenFlow: () => void;
}) {
  const { item } = entry;
  const Icon = item.icon;
  const title = resolveCopy(item.title, orgType);
  // A focused wizard when the outcome has one; a link when the destination already IS
  // the focused experience. See components/onboarding/flows/index.tsx.
  const hasFlow = !!flowFor(item.id);
  return (
    <div className="group relative flex flex-col rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </span>
      <div className="mt-3 text-sm font-medium leading-snug text-balance">{title}</div>
      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {resolveCopy(item.blurb, orgType)}
      </p>
      {/* mt-auto on the wrapper, not a fixed margin on the button: a short blurb would
          otherwise pull its CTA up and the row of buttons would come out ragged. This
          pins every CTA to the floor of its card whatever the copy above it does. */}
      <div className="mt-auto pt-4">
        {hasFlow ? (
          <Button size="sm" variant="outline" className="w-full" onClick={onOpenFlow}>
            {resolveCopy(item.cta, orgType)}
            <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to={item.to} search={item.search}>
              {resolveCopy(item.cta, orgType)}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Dismiss ${title}`}
          title={`Hide "${title}" — you can bring it back from the menu above`}
          className="absolute right-1.5 top-1.5 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onDismiss}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function ItemRow({
  entry,
  orgType,
  onDismiss,
  onOpenFlow,
}: {
  entry: ChecklistEntry;
  orgType: OrgType;
  onDismiss?: () => void;
  onOpenFlow: () => void;
}) {
  const { item } = entry;
  const Icon = item.icon;
  // Same rule as the dashboard card: a flow when there is one, so the wizard's last
  // screen can start a real task without navigating out of onboarding.
  const hasFlow = !!flowFor(item.id);
  return (
    <div className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{resolveCopy(item.title, orgType)}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{resolveCopy(item.blurb, orgType)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {hasFlow ? (
          <Button size="sm" variant="outline" onClick={onOpenFlow}>
            {resolveCopy(item.cta, orgType)}
            <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to={item.to} search={item.search}>
              {resolveCopy(item.cta, orgType)}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Dismiss ${resolveCopy(item.title, orgType)}`}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={onDismiss}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

