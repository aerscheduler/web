import { useMemo, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { rolesOf, type OrganizationUser } from "@/types/api";
import { useMemberDocuments } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleBadges } from "@/components/role-badges";
import { DocumentRow } from "@/components/documents/document-row";
import { DocumentUploadModal } from "@/components/me-account/document-upload-modal";
import { formatDate, initials } from "@/lib/utils";
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
        <Row label="Joined">{formatDate(ou.createdAt, "MMMM d, yyyy")}</Row>
        <Row label="Member ID">
          <span className="tabular-nums text-muted-foreground">#{ou.id}</span>
        </Row>
      </dl>

      <MemberDocuments ou={ou} />
    </>
  );
}

/**
 * A member's documents, with an upload button for admins — this is how a restricted
 * ("admin upload only") type gets filed on someone else's behalf. Dispatchers can read
 * the list but not upload, matching what the server allows.
 */
function MemberDocuments({ ou }: { ou: OrganizationUser }) {
  const { isStaff, isAdmin, orgUserId } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);

  const isSelf = ou.id === orgUserId;
  const q = useMemberDocuments(ou.id, { enabled: isStaff || isSelf });
  const docs = useMemo(() => (q.data ?? []).filter((d) => !d.archivedAt), [q.data]);

  if (!isStaff && !isSelf) return null;

  return (
    <div className="border-t border-border px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Documents</h3>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" /> Upload
          </Button>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : q.isError ? (
        <p className="text-sm text-muted-foreground">Couldn't load documents.</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing on file{isAdmin ? " — upload a medical, certificate, or agreement." : "."}
        </p>
      ) : (
        <div className="-mx-3 divide-y divide-border">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        </div>
      )}

      <DocumentUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        targetOrgUserId={ou.id}
        targetName={memberName(ou)}
      />
    </div>
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
