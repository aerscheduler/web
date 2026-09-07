import { FileText, Paperclip } from "lucide-react";

/** Last path segment of a signed GET URL, before the query string. */
export function attachmentName(url: string): string {
  const path = url.split("?")[0] ?? url;
  const name = path.split("/").pop();
  if (!name) return "Attachment";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function isImage(url: string): boolean {
  const name = attachmentName(url).toLowerCase();
  return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png");
}

/**
 * Photos and PDFs on a squawk or a note.
 *
 * URLs are already signed by the single-squawk read. A missing list is "not loaded",
 * an empty list is "none attached".
 */
export function SquawkAttachments({
  fileUrls,
  compact = false,
}: {
  fileUrls?: string[] | null;
  compact?: boolean;
}) {
  if (!fileUrls?.length) return null;

  return (
    <ul className={compact ? "mt-1.5 flex flex-wrap gap-2" : "mt-2 flex flex-wrap gap-2"}>
      {fileUrls.map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[12px] hover:bg-muted"
          >
            {isImage(url) ? (
              <img src={url} alt="" className="size-8 rounded object-cover" />
            ) : (
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="max-w-[12rem] truncate">{attachmentName(url)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SquawkPaperclip({ has }: { has?: boolean }) {
  if (!has) return null;
  return (
    <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />
  );
}
