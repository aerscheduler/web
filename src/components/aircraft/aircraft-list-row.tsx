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
import type { AircraftActions } from "@/components/aircraft/aircraft-card";
import { planeRate, planeStatus, planeTitle } from "@/components/aircraft/lib";
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
import { canGroundResources, canManageResources } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";

export function AircraftListRow({
  r,
  actions,
}: {
  r: Resource;
  actions: AircraftActions;
}) {
  const { roles } = useAuth();
  const p = r.type?.plane;
  if (!p) return null;

  const status = planeStatus(p);
  const rate = planeRate(p);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Link
        to="/aircraft/$resourceId"
        params={{ resourceId: String(r.id) }}
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold tracking-tight">{p.tailNumber}</span>
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
        <div className="truncate text-xs text-muted-foreground">{planeTitle(p)}</div>
      </Link>

      <div className="hidden gap-4 text-xs text-muted-foreground sm:flex">
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
        <div className="w-24 shrink-0 text-right text-sm">
          <span className="tnum font-semibold">{formatMoney(rate.cents)}</span>
          <span className="text-xs text-muted-foreground">
            {" "}
            {rate.basis}
            {rate.per}
          </span>
        </div>
      )}

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
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
            <DropdownMenuItem onSelect={() => actions.onEdit(r)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
          )}
          {/* Its own gate, WIDER than the rest of this menu. A technician may take a tail
              off the line and put it back but may not edit or approve it, and the aircraft
              record has said so since the grounding route landed. This menu had not caught
              up, so the one role built around maintenance could release an aeroplane from
              the record page and not from the fleet it sits in. */}
          {canGroundResources(roles) && (
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
          )}
          {canManageResources(roles) && (
            <DropdownMenuItem onSelect={() => actions.onApprove(r)}>
              <ShieldCheck className="size-4" /> Approve members
            </DropdownMenuItem>
          )}
          {(canManageResources(roles) || canGroundResources(roles)) && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => actions.onDetails(r)}>
            <PlaneIcon className="size-4" /> View details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
