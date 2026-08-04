import { rolesOf, type OrganizationUser } from "@/types/api";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleBadges } from "@/components/role-badges";
import { initials } from "@/lib/utils";
import { MemberRowActions } from "./member-row-actions";
import { memberName } from "./util";

export function MemberCard({
  ou,
  onView,
  onEditRoles,
}: {
  ou: OrganizationUser;
  onView: (ou: OrganizationUser) => void;
  onEditRoles: (ou: OrganizationUser) => void;
}) {
  const name = memberName(ou);
  const email = ou.user?.email;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          {ou.profileImage && <AvatarImage src={ou.profileImage} alt={name} />}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{name}</div>
              {email && (
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Same precedence as the table's Status column: archived wins, because
                  a retired member's grounding is history rather than a live state. */}
              {ou.archivedAt ? (
                <Badge variant="secondary">Archived</Badge>
              ) : ou.grounded ? (
                <Badge variant="danger">Grounded</Badge>
              ) : (
                <Badge variant="outline">Active</Badge>
              )}
              <MemberRowActions ou={ou} onView={onView} onEditRoles={onEditRoles} />
            </div>
          </div>
          <div className="mt-2">
            <RoleBadges roles={rolesOf(ou)} />
          </div>
        </div>
      </div>
    </Card>
  );
}
