import { differenceInCalendarDays, parseISO } from "date-fns";
import { ExternalLink, FileText } from "lucide-react";
import type { UserDocument } from "@/types/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function fmt(iso: string | null | undefined) {
  return iso ? formatDate(iso, "MMM d, yyyy") : "–";
}

/**
 * Status for a document, from its type's `warningPeriod` (days before expiry to warn).
 * Non-expiring types have no status to show beyond "we have it".
 */
export function ExpiryBadge({ doc }: { doc: UserDocument }) {
  if (!doc.documentType.expires || !doc.expiresAt) {
    return <Badge variant="secondary">On file</Badge>;
  }
  const days = differenceInCalendarDays(parseISO(doc.expiresAt), new Date());
  const warn = doc.documentType.warningPeriod ?? 30;
  if (days < 0) return <Badge variant="danger">Expired</Badge>;
  if (days <= warn) return <Badge variant="warning">Expires in {days}d</Badge>;
  return <Badge variant="success">Valid</Badge>;
}

/** One filed document, shared by the self-serve page and the admin member profile. */
export function DocumentRow({ doc }: { doc: UserDocument }) {
  const href = doc.fileUrls?.[0];
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
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
            <ExternalLink className="size-4" /> View
          </a>
        </Button>
      )}
    </div>
  );
}
