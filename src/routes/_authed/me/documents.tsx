import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Building2, ExternalLink, FileText, Plus, Upload } from "lucide-react";
import { useMemberDocuments } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { UserDocument } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { DocumentUploadModal } from "@/components/me-account/document-upload-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/me/documents")({
  component: MyDocumentsPage,
});

function fmt(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "—";
}

function ExpiryBadge({ doc }: { doc: UserDocument }) {
  if (!doc.documentType.expires || !doc.expiresAt) {
    return <Badge variant="secondary">On file</Badge>;
  }
  const days = differenceInCalendarDays(parseISO(doc.expiresAt), new Date());
  const warn = doc.documentType.warningPeriod ?? 30;
  if (days < 0) return <Badge variant="danger">Expired</Badge>;
  if (days <= warn) return <Badge variant="warning">Expires in {days}d</Badge>;
  return <Badge variant="success">Valid</Badge>;
}

function DocumentRow({ doc }: { doc: UserDocument }) {
  const href = doc.fileUrls?.[0];
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{doc.documentType.name}</div>
        <div className="text-xs text-muted-foreground">
          Uploaded {fmt(doc.createdAt)}
          {doc.documentType.expires && doc.expiresAt && (
            <> · Expires {fmt(doc.expiresAt)}</>
          )}
        </div>
      </div>
      <ExpiryBadge doc={doc} />
      {href && (
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" /> View
          </a>
        </Button>
      )}
    </div>
  );
}

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
        <PageHeader title="My documents" subtitle="Medicals, certificates, and agreements." />
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
        title="My documents"
        subtitle="Keep your medical, certificates, and agreements current."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="size-4" /> Upload
          </Button>
        }
      />

      {q.isLoading ? (
        <Card className="divide-y divide-border overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
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
