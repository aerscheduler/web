import type { Role } from "@/types/api";
import { Badge } from "@/components/ui/badge";

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
