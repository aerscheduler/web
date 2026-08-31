import { Ban, Copy, Eye, MoreHorizontal, Pencil } from "lucide-react";
import type { Reservation } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { canCancelReservation, canEditReservation } from "./close-out";
import { canCreateReservationType } from "@/lib/permissions";

/**
 * Row/block overflow menu. Only rendered when the viewer can actually act on the
 * reservation, the block/row itself already opens details on click, so for a
 * plain member looking at someone else's flight there's nothing to show and the
 * menu is hidden entirely (mirrors Flutter, which never surfaces cancel to a
 * non-staff/non-crew viewer).
 */
export function ReservationMenu({
  r,
  onView,
  onEdit,
  onDuplicate,
  onCancel,
  className,
  onOpenChange,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  /** Omitted on surfaces that have no edit affordance. */
  onEdit?: (r: Reservation) => void;
  /** "Book another like this." Omitted on surfaces that can't create. */
  onDuplicate?: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  className?: string;
  /**
   * Fires when the dropdown opens or closes. Surfaces that hide this menu until
   * hover need it: the trigger's own `data-state` is unusable, because the
   * tooltip wraps it with `asChild` and its state wins the merge, so a CSS
   * `has-[[data-state=open]]` rule reads "closed" the whole time the menu is up.
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const { roles, orgUserId } = useAuth();
  const canCancel = canCancelReservation(r, roles, orgUserId);
  const canEdit = onEdit != null && canEditReservation(r, roles, orgUserId);
  // Duplicating CREATES, so it is gated on being allowed to create that type.
  // not on being allowed to edit this particular booking. Someone can be able to
  // book another dual flight without being able to touch this one.
  const canDuplicate = onDuplicate != null && canCreateReservationType(roles, r.type);

  // Nothing actionable → no menu (details are reachable by clicking the block).
  if (!canCancel && !canEdit && !canDuplicate) return null;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7 text-muted-foreground", className)}
              aria-label={`Actions for ${r.title}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onView(r)}>
          <Eye className="size-4" /> View details
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onSelect={() => onEdit(r)}>
            <Pencil className="size-4" /> Edit reservation
          </DropdownMenuItem>
        )}
        {canDuplicate && (
          <DropdownMenuItem onSelect={() => onDuplicate(r)}>
            <Copy className="size-4" /> Duplicate
          </DropdownMenuItem>
        )}
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onCancel(r)}>
              <Ban className="size-4" /> Cancel reservation
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
