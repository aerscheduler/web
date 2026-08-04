import {
  MoreHorizontal,
  Pencil,
  Plane as PlaneIcon,
  PlaneTakeoff,
  ShieldCheck,
  TowerControl,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Resource } from "@/types/api";
import { planeRate, planeStatus, planeTitle } from "@/components/aircraft/lib";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { canManageResources } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";

export type AircraftActions = {
  onEdit: (r: Resource) => void;
  onToggleGround: (r: Resource) => void;
  onApprove: (r: Resource) => void;
  onDetails: (r: Resource) => void;
};

export function AircraftCard({ r, actions }: { r: Resource; actions: AircraftActions }) {
  const { roles } = useAuth();
  const p = r.type?.plane;
  if (!p) return null;

  const status = planeStatus(p);
  const rate = planeRate(p);

  return (
    <Card className="flex flex-col overflow-hidden pt-0">
      <div className="relative h-28 bg-muted">
        {r.featuredImage ? (
          <img
            src={r.featuredImage}
            alt={p.tailNumber}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground/40">
            <PlaneIcon className="size-10" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          {status.variant === "danger" && p.groundedReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>{p.groundedReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Badge variant={status.variant}>{status.label}</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/aircraft/$resourceId"
              params={{ resourceId: String(r.id) }}
              className="rounded font-mono text-lg font-semibold tracking-tight outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {p.tailNumber}
            </Link>
            <div className="truncate text-sm text-muted-foreground">{planeTitle(p)}</div>
          </div>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-1 shrink-0"
                    aria-label={`Actions for ${p.tailNumber}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {canManageResources(roles) && (
                <>
                  <DropdownMenuItem onSelect={() => actions.onEdit(r)}>
                    <Pencil className="size-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => actions.onToggleGround(r)}>
                    {p.grounded ? (
                      <>
                        <PlaneTakeoff className="size-4" /> Return to service
                      </>
                    ) : (
                      <>
                        <TowerControl className="size-4" /> Ground aircraft
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => actions.onApprove(r)}>
                    <ShieldCheck className="size-4" /> Approve renters
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => actions.onDetails(r)}>
                <PlaneIcon className="size-4" /> View details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {p.categoryClass && (
          <div className="mt-2 mb-4">
            <Badge variant="outline" className="capitalize">
              {p.categoryClass}
            </Badge>
          </div>
        )}

        {/* -mx-4 + px-4 so the divider spans the full card width (breaks out of the p-4 content padding). */}
        <div className="-mx-4 mt-auto flex items-end justify-between gap-4 border-t border-border px-4 pt-4">
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1">
                  <span className="tnum font-medium text-foreground">
                    {(p.hobbsTime / 10).toFixed(1)}
                  </span>
                  Hobbs
                </span>
              </TooltipTrigger>
              <TooltipContent>Hobbs meter time</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1">
                  <span className="tnum font-medium text-foreground">
                    {(p.tachTime / 10).toFixed(1)}
                  </span>
                  tach
                </span>
              </TooltipTrigger>
              <TooltipContent>Tachometer time</TooltipContent>
            </Tooltip>
          </div>
          {rate && (
            <div className="text-right text-sm">
              <span className="tnum font-semibold">{formatMoney(rate.cents)}</span>
              <span className="text-xs text-muted-foreground">
                {" "}
                {rate.basis}
                {rate.per}
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
