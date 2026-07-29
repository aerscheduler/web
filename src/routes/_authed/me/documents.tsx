import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, ExternalLink, FileText, Plus, Upload } from "lucide-react";
import { useDocumentTypes, useMemberDocuments } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { UserDocument } from "@/types/api";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearch } from "@/components/list-search";
import { ListFilters, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { ExpiryBadge } from "@/components/documents/document-row";
import { DocumentUploadModal } from "@/components/me-account/document-upload-modal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/me/documents")({
  component: MyDocumentsPage,
});

function fmt(iso: string | null | undefined) {
  return iso ? formatDate(iso, "MMM d, yyyy") : "—";
}

const columns: ColumnDef<UserDocument, unknown>[] = [
  {
    id: "type",
    accessorFn: (d) => d.documentType.name,
    header: "Document",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.documentType.name}</div>
        {row.original.documentType.description && (
          <div className="truncate text-xs text-muted-foreground">
            {row.original.documentType.description}
          </div>
        )}
      </div>
    ),
  },
  {
    id: "uploaded",
    accessorFn: (d) => d.createdAt,
    header: "Uploaded",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{fmt(row.original.createdAt)}</span>
    ),
  },
  {
    id: "expires",
    accessorFn: (d) => d.expiresAt ?? "",
    header: "Expires",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.documentType.expires ? fmt(row.original.expiresAt) : "—"}
      </span>
    ),
  },
  {
    id: "status",
    accessorFn: (d) => d.expiresAt ?? "on-file",
    header: "Status",
    cell: ({ row }) => <ExpiryBadge doc={row.original} />,
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    cell: ({ row }) => {
      const href = row.original.fileUrls?.[0];
      if (!href) return null;
      return (
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" /> View
          </a>
        </Button>
      );
    },
  },
];

function DocumentCard({ doc }: { doc: UserDocument }) {
  const href = doc.fileUrls?.[0];
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{doc.documentType.name}</div>
        <div className="text-xs text-muted-foreground">
          Uploaded {fmt(doc.createdAt)}
          {doc.documentType.expires && doc.expiresAt && <> · Expires {fmt(doc.expiresAt)}</>}
        </div>
      </div>
      <ExpiryBadge doc={doc} />
      {href && (
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
          </a>
        </Button>
      )}
    </Card>
  );
}

function MyDocumentsPage() {
  const { organization, orgUserId } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedQ = useDebouncedValue(search);
  const [facets, setFacets] = useState<ListFilterValues>({});
  const typesQ = useDocumentTypes();

  const documentTypeIdRaw =
    typeof facets.documentTypeId === "string" ? Number(facets.documentTypeId) : undefined;
  const status =
    facets.status === "expired" || facets.status === "expiring" || facets.status === "good"
      ? facets.status
      : undefined;

  const q = useMemberDocuments(orgUserId, {
    q: debouncedQ || undefined,
    documentTypeId: Number.isFinite(documentTypeIdRaw) ? documentTypeIdRaw : undefined,
    status,
    includeArchived: typeof facets.includeArchived === "boolean" ? facets.includeArchived : undefined,
  });
  const docs = q.data ?? [];

  const filtersActive =
    !!debouncedQ ||
    (typeof facets.documentTypeId === "string" && facets.documentTypeId !== "") ||
    status != null ||
    facets.includeArchived === true;

  const facetDefs = useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "documentTypeId",
        label: "Type",
        allLabel: "All types",
        options: (typesQ.data ?? []).map((t) => ({
          value: String(t.id),
          label: t.name,
        })),
      },
      {
        kind: "select",
        key: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "expired", label: "Expired" },
          { value: "expiring", label: "Expiring" },
          { value: "good", label: "Good" },
        ],
      },
      {
        kind: "boolean",
        key: "includeArchived",
        label: "Archived",
        trueLabel: "Include archived",
        falseLabel: "Hide archived",
      },
    ],
    [typesQ.data]
  );

  if (!organization) {
    return (
      <TableView>
        <TableView.Header>
          <PageHeader title="Documents" subtitle="Medicals, certificates, and agreements." />
        </TableView.Header>
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Join or pick a flight school to manage your documents here."
          />
        </Card>
      </TableView>
    );
  }

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Documents"
          subtitle="Keep your medical, certificates, and agreements current."
          actions={
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" /> Upload
            </Button>
          }
        />
      </TableView.Header>

      {q.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={6} cols={4} />
        </Card>
      ) : q.isError ? (
        <Card className="min-h-0 flex-1">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : docs.length === 0 && !filtersActive ? (
        <Card className="min-h-0 flex-1">
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
        <DataTable
          fill
          columns={columns}
          data={docs}
          toolbar={
            <div className="flex flex-col gap-2">
              <ListSearch
                value={search}
                onChange={setSearch}
                placeholder="Search documents…"
                aria-label="Search documents"
              />
              <ListFilters facets={facetDefs} values={facets} onChange={setFacets} />
            </div>
          }
          mobileCard={(doc) => <DocumentCard doc={doc} />}
          emptyMessage="No documents match your search."
        />
      )}

      <DocumentUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </TableView>
  );
}
