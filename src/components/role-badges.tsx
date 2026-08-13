import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Role } from "@/types/api";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  instructor: "Instructor",
  student: "Student",
  renter: "Renter",
  technician: "Technician",
};

const VARIANT: Record<Role, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "default",
  dispatcher: "secondary",
  instructor: "secondary",
  technician: "secondary",
  student: "outline",
  renter: "outline",
};

export function RoleBadges({ roles }: { roles: Role[] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">Member</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r} variant={VARIANT[r]}>
          {LABEL[r]}
        </Badge>
      ))}
    </div>
  );
}

/**
 * One chip for a header: the top role, plus a count if they hold more.
 * Click lists every role; admins get Edit roles in the same popover.
 */
export function RolesMenuBadge({
  roles,
  canEdit,
  onEdit,
}: {
  roles: Role[];
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const extra = Math.max(0, roles.length - 1);
  const lead = roles[0] ? LABEL[roles[0]] : "Member";
  const summary = extra > 0 ? `${lead} +${extra}` : lead;
  const names = roles.length ? roles.map((r) => LABEL[r]).join(", ") : "No roles";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Roles: ${names}`}
          className={cn(
            badgeVariants({ variant: "outline" }),
            "cursor-pointer hover:bg-accent hover:text-foreground"
          )}
        >
          {summary}
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-3">
        <p className="text-xs font-medium text-muted-foreground">Roles</p>
        {roles.length === 0 ? (
          <p className="mt-2 text-sm">No roles assigned.</p>
        ) : (
          <ul className="mt-2 flex flex-col items-start gap-1.5">
            {roles.map((r) => (
              <li key={r}>
                <Badge variant={VARIANT[r]}>{LABEL[r]}</Badge>
              </li>
            ))}
          </ul>
        )}
        {canEdit && onEdit ? (
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit roles
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
