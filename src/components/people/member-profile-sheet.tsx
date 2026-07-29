import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { rolesOf, type Currency, type OrganizationUser } from "@/types/api";
import { useMemberCurrencies, useMemberDocuments } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleBadges } from "@/components/role-badges";
import { DocumentRow } from "@/components/documents/document-row";
import { DocumentUploadModal } from "@/components/me-account/document-upload-modal";
import { CurrencyStatusBadge, currencyStatus } from "@/components/me-money/currency-status";
import {
  RenewCurrencyDialog,
  canOfferRenew,
  isDocumentGated,
} from "@/components/people/renew-currency-dialog";
import { MemberInstructionSection } from "@/components/people/member-instruction-section";
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

      <MemberInstructionSection ou={ou} />
      <MemberCurrencies ou={ou} />
      <MemberDocuments ou={ou} />
    </>
  );
}

/**
 * Desk sign-off for a member's currencies. Admin/dispatcher can list via the
 * per-type endpoint; renew uses the same POST as the Flutter renew sheet.
 */
function MemberCurrencies({ ou }: { ou: OrganizationUser }) {
  const { isStaff, isAdmin, roles, orgUserId } = useAuth();
  const [active, setActive] = useState<Currency | null>(null);

  const q = useMemberCurrencies(ou.id, { enabled: isStaff });
  const isOwningMember = ou.id === orgUserId;
  const currencies = useMemo(() => {
    const list = q.data ?? [];
    return [...list].sort((a, b) => {
      const weight = (c: Currency) => {
        switch (currencyStatus(c).key) {
          case "expired":
          case "notSignedOff":
            return 0;
          case "expiring":
            return 1;
          default:
            return 2;
        }
      };
      return weight(a) - weight(b);
    });
  }, [q.data]);

  if (!isStaff) return null;

  return (
    <div className="border-t border-border px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Currencies</h3>
      </div>

      {q.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : q.isError ? (
        <p className="text-sm text-muted-foreground">Couldn't load currencies.</p>
      ) : currencies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No currency records for this member — check that they&apos;re in a group
          scoped by a{" "}
          <Link to="/settings" className="underline underline-offset-2">
            currency rule
          </Link>
          .
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border">
          {currencies.map((c) => {
            const status = currencyStatus(c);
            const gated = isDocumentGated(c);
            const canRenew = canOfferRenew(c, roles, isAdmin, isOwningMember);
            const label = c.renewedBy == null ? "Sign off" : "Renew";
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-1 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {c.currencyType?.name ?? "Currency"}
                  </div>
                  <div className="mt-0.5">
                    <CurrencyStatusBadge status={status} />
                  </div>
                </div>
                {gated ? (
                  <span className="max-w-[9rem] text-right text-xs text-muted-foreground">
                    Renew via document upload
                  </span>
                ) : canRenew ? (
                  <Button variant="outline" size="sm" onClick={() => setActive(c)}>
                    {label}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <RenewCurrencyDialog
        currency={active}
        open={active != null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      />
    </div>
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
  const q = useMemberDocuments(ou.id, undefined, { enabled: isStaff || isSelf });
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

      {q.isPending ? (
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
