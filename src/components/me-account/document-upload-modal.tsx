import * as React from "react";
import { toast } from "sonner";
import { useDocumentTypes, useMembers, useUploadDocument } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { DocumentType } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox } from "@/components/combobox";
import { memberName } from "@/components/people/util";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Fields that can block submit, in focus order, mapped to their control ids. */
const FIELDS = [
  { key: "member", id: "doc-member" },
  { key: "type", id: "doc-type" },
  { key: "expiresAt", id: "doc-expires" },
  { key: "file", id: "doc-file" },
] as const;

/**
 * Upload a document against an org-defined type. Members can't upload `restricted` types (an
 * admin files those on their behalf), and types marked `expires` require an expiry date.
 *
 * Admins can file a document against another member. Pass `targetOrgUserId` to pin the upload
 * to one person (the member profile sheet does this); leave it out on the self-serve page and
 * admins get a roster picker instead, defaulting to themselves.
 */
export function DocumentUploadModal({
  open,
  onOpenChange,
  targetOrgUserId,
  targetName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pin the upload to this member instead of showing a picker. */
  targetOrgUserId?: number;
  /** Display name for a pinned target, so the form says whose record this lands on. */
  targetName?: string;
}) {
  const { isAdmin, orgUserId } = useAuth();
  const typesQ = useDocumentTypes({ enabled: open });
  const upload = useUploadDocument();

  // Only admins may file against someone else, and only when the caller hasn't pinned a target.
  const canPickMember = isAdmin && targetOrgUserId == null;
  const membersQ = useMembers(undefined, { enabled: open && canPickMember });

  const [memberId, setMemberId] = React.useState("");
  const [typeId, setTypeId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // Default the picker to the caller so "upload for" is never ambiguous.
      setMemberId(canPickMember && orgUserId != null ? String(orgUserId) : "");
      setTypeId("");
      setFile(null);
      setExpiresAt("");
      setError(null);
      setShowErrors(false);
    }
  }, [open, canPickMember, orgUserId]);

  // Who the document ends up filed against, in OrganizationUser id space.
  const forOrgUserId = canPickMember
    ? memberId
      ? Number(memberId)
      : null
    : (targetOrgUserId ?? orgUserId);
  const isForSomeoneElse = forOrgUserId != null && forOrgUserId !== orgUserId;

  const memberOptions = React.useMemo(
    () =>
      (membersQ.data ?? []).map((ou) => ({
        value: String(ou.id),
        label: ou.id === orgUserId ? `${memberName(ou)} (you)` : memberName(ou),
        hint: ou.user?.email ?? undefined,
      })),
    [membersQ.data, orgUserId]
  );

  // Members can only upload non-restricted types; admins can upload any. Retired
  // (inactive) types stay on existing documents but can't be filed against again.
  // Gate on isAdmin, not isStaff: the server checks the adminRole relation, so offering
  // restricted types to a dispatcher would only earn them a 403 at submit.
  const types = (typesQ.data ?? []).filter((t) => t.active && (isAdmin || !t.restricted));
  const selectedType: DocumentType | undefined = types.find((t) => String(t.id) === typeId);
  const needsExpiry = selectedType?.expires ?? false;

  // Per-field validity, derived every render so inline messages clear as you fix them.
  const errors: Record<string, string> = {
    member: canPickMember && forOrgUserId == null ? "Pick who this document is for." : "",
    type: !selectedType ? "Pick a document type." : "",
    expiresAt: needsExpiry && !expiresAt ? "This document needs an expiry date." : "",
    file: !file ? "Choose a file to upload." : "",
  };
  const firstInvalid = FIELDS.find((f) => errors[f.key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (upload.isPending) return;
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (firstInvalid || !selectedType || !file) {
      setShowErrors(true);
      if (firstInvalid) document.getElementById(firstInvalid.id)?.focus();
      return;
    }

    setError(null);
    try {
      await upload.mutateAsync({
        documentTypeId: selectedType.id,
        file,
        expiresAt: needsExpiry ? new Date(expiresAt).toISOString() : undefined,
        // Omitted for self-uploads so the request stays identical to what it was before.
        orgUserId: isForSomeoneElse ? forOrgUserId : undefined,
      });
      toast.success(isForSomeoneElse ? "Document uploaded for member" : "Document uploaded");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't upload the document";
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Upload document"
      description={
        targetOrgUserId != null
          ? "File a document against this member's record."
          : "Add a medical, certificate, or other required document."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Pinned target: no choice to make, but be explicit about whose record this lands on. */}
        {isForSomeoneElse && !canPickMember && targetName && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            Uploading for <span className="font-medium">{targetName}</span>
          </div>
        )}

        {canPickMember && (
          <div className="space-y-1.5">
            <Label htmlFor="doc-member">Upload for</Label>
            {membersQ.isLoading ? (
              <div className="h-9 animate-pulse rounded-md bg-muted" />
            ) : (
              <Combobox
                id="doc-member"
                options={memberOptions}
                value={memberId}
                onChange={setMemberId}
                placeholder="Select a member"
                searchPlaceholder="Search members…"
                emptyText="No members found."
                invalid={showErrors && !!errors.member}
              />
            )}
            {isForSomeoneElse && (
              <p className="text-xs text-muted-foreground">
                This document will be filed against their record, not yours.
              </p>
            )}
            {showErrors && errors.member && (
              <p className="text-xs text-destructive">{errors.member}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="doc-type">Document type</Label>
          {typesQ.isLoading ? (
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          ) : types.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No document types are set up yet. An admin can add them under Settings →
              Document types.
            </p>
          ) : (
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger
                id="doc-type"
                className="w-full"
                aria-invalid={showErrors && !!errors.type}
              >
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedType?.description && (
            <p className="text-xs text-muted-foreground">{selectedType.description}</p>
          )}
          {showErrors && errors.type && (
            <p className="text-xs text-destructive">{errors.type}</p>
          )}
        </div>

        {needsExpiry && (
          <div className="space-y-1.5">
            <Label htmlFor="doc-expires">Expires on</Label>
            <Input
              id="doc-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              aria-invalid={showErrors && !!errors.expiresAt}
            />
            {showErrors && errors.expiresAt && (
              <p className="text-xs text-destructive">{errors.expiresAt}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="doc-file">File</Label>
          <Input
            id="doc-file"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-invalid={showErrors && !!errors.file}
          />
          <p className="text-xs text-muted-foreground">PDF or image, up to 5 MB.</p>
          {showErrors && errors.file && (
            <p className="text-xs text-destructive">{errors.file}</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
