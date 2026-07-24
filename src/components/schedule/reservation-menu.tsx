import { Ban, Eye, MoreHorizontal, UserX } from "lucide-react";
import type { Reservation } from "@/types/api";
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

/** Row/block overflow menu: open details, cancel, mark no-show. */
export function ReservationMenu({
  r,
  onView,
  onCancel,
  onNoShow,
  className,
}: {
  r: Reservation;
  onView: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  onNoShow: (r: Reservation) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onNoShow(r)}>
          <UserX className="size-4" /> Mark no-show
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onCancel(r)}>
          <Ban className="size-4" /> Cancel reservation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
