import { format } from "date-fns";
import { CalendarClock, Check, PlaneTakeoff } from "lucide-react";
import { resourceLabel } from "@/types/api";
import type { Squawk } from "@/types/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * A single squawk. When `onResolve` is provided (open tab), a Resolve action is shown;
 * omit it for the read-only Resolved tab.
 */
export function SquawkCard({
  squawk,
  onResolve,
  resolving,
}: {
  squawk: Squawk;
  onResolve?: (squawk: Squawk) => void;
  resolving?: boolean;
}) {
  const aircraft = squawk.resource ? resourceLabel(squawk.resource).name : null;
  const reported = squawk.createdAt ? format(new Date(squawk.createdAt), "MMM d, yyyy") : null;
  const resolved = squawk.resolvedAt ? format(new Date(squawk.resolvedAt), "MMM d, yyyy") : null;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{squawk.title || "Untitled squawk"}</span>
          {squawk.grounding && <Badge variant="danger">Grounding</Badge>}
        </div>
        {squawk.description && (
          <p className="text-sm text-muted-foreground">{squawk.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {aircraft && (
            <span className="inline-flex items-center gap-1">
              <PlaneTakeoff className="size-3.5" /> {aircraft}
            </span>
          )}
          {reported && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" /> Reported {reported}
            </span>
          )}
          {onResolve == null && resolved && (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3.5" /> Resolved {resolved}
            </span>
          )}
        </div>
      </div>
      {onResolve && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={resolving}
          onClick={() => onResolve(squawk)}
        >
          <Check className="size-4" /> Resolve
        </Button>
      )}
    </Card>
  );
}
