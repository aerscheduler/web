import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileText, Plus, Upload } from "lucide-react";
import { useMemberDocuments } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { DocumentRow } from "@/components/documents/document-row";
import { DocumentUploadModal } from "@/components/me-account/document-upload-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/me/documents")({
  component: MyDocumentsPage,
});

function MyDocumentsPage() {
  const { organization, orgUserId } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);

  const q = useMemberDocuments(orgUserId);
  const docs = useMemo(
    () => (q.data ?? []).filter((d) => !d.archivedAt),
    [q.data]
  );

  if (!organization) {
    return (
      <div>
        <PageHeader title="Documents" subtitle="Medicals, certificates, and agreements." />
        <Card className="p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Join or pick a flight school to manage your documents here."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Keep your medical, certificates, and agreements current."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="size-4" /> Upload
          </Button>
        }
      />

      {q.isPending ? (
        <Card className="divide-y divide-border overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5">
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : docs.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No documents yet"
            body="Upload your medical, pilot certificate, or renter agreement to keep them on file."
            action={
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" /> Upload a document
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        </Card>
      )}

      <DocumentUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
