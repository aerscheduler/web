import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { rolesOf, type OrganizationUser } from "@/types/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleBadges } from "@/components/role-badges";
import { initials } from "@/lib/utils";
import { memberName } from "./util";

export function MemberProfileSheet({
  member,
  open,
  onOpenChange,
}: {
  member: OrganizationUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {member && <ProfileBody ou={member} />}
      </SheetContent>
    </Sheet>
  );
}

function ProfileBody({ ou }: { ou: OrganizationUser }) {
  const name = memberName(ou);
  const email = ou.user?.email;
  const phone = ou.user?.details?.phone;
  const roles = rolesOf(ou);

  return (
    <>
      <SheetHeader className="gap-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            {ou.profileImage && <AvatarImage src={ou.profileImage} alt={name} />}
            <AvatarFallback className="text-base">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="truncate text-lg">{name}</SheetTitle>
            {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
          </div>
        </div>
        <div>
          {ou.grounded ? (
            <Badge variant="danger">Grounded</Badge>
          ) : (
            <Badge variant="outline">Active</Badge>
          )}
        </div>
      </SheetHeader>

      <dl className="divide-y divide-border px-4">
        <Row label="Roles">
          <RoleBadges roles={roles} />
        </Row>
        <Row label="Identifier">
          <span className="tabular-nums">{ou.identifier || "—"}</span>
        </Row>
        {phone && <Row label="Phone">{phone}</Row>}
        <Row label="Joined">{format(parseISO(ou.createdAt), "MMMM d, yyyy")}</Row>
        <Row label="Member ID">
          <span className="tabular-nums text-muted-foreground">#{ou.id}</span>
        </Row>
      </dl>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{children}</dd>
    </div>
  );
}
