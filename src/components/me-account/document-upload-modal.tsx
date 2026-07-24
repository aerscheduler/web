import * as React from "react";
import { toast } from "sonner";
import { useDocumentTypes, useUploadDocument } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { DocumentType } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
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

/**
 * Upload a document against an org-defined type. Members can't upload `restricted` types (an
 * admin does that for them), and types marked `expires` require an expiry date.
 */
export function DocumentUploadModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isStaff } = useAuth();
  const typesQ = useDocumentTypes({ enabled: open });
  const upload = useUploadDocument();

  const [typeId, setTypeId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [expiresAt, setExpiresAt] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTypeId("");
      setFile(null);
      setExpiresAt("");
      setError(null);
    }
  }, [open]);

  // Members can only upload non-restricted types; admins can upload any.
  const types = (typesQ.data ?? []).filter((t) => isStaff || !t.restricted);
  const selectedType: DocumentType | undefined = types.find((t) => String(t.id) === typeId);
  const needsExpiry = selectedType?.expires ?? false;

  const valid = !!selectedType && !!file && (!needsExpiry || !!expiresAt);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedType) return setError("Pick a document type.");
    if (!file) return setError("Choose a file to upload.");
    if (needsExpiry && !expiresAt) return setError("This document needs an expiry date.");

    try {
      await upload.mutateAsync({
        documentTypeId: selectedType.id,
        file,
        expiresAt: needsExpiry ? new Date(expiresAt).toISOString() : undefined,
      });
      toast.success("Document uploaded");
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
      description="Add a medical, certificate, or other required document."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="doc-type">Document type</Label>
          {typesQ.isLoading ? (
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          ) : types.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No document types are set up yet. An admin can add them from the mobile app.
            </p>
          ) : (
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger id="doc-type" className="w-full">
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
        </div>

        {needsExpiry && (
          <div className="space-y-1.5">
            <Label htmlFor="doc-expires">Expires on</Label>
            <Input
              id="doc-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="doc-file">File</Label>
          <Input
            id="doc-file"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">PDF or image, up to 5 MB.</p>
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
          <Button type="submit" disabled={!valid || upload.isPending}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
