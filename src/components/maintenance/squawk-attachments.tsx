import { useEffect, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";

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

export function isImageName(name: string): boolean {
  const n = name.toLowerCase().split("?")[0] ?? name.toLowerCase();
  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".gif") ||
    n.endsWith(".webp")
  );
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (url.startsWith("blob:")) return isImageName(fileName ?? "");
  return isImageName(attachmentName(url));
}

/**
 * One photo or PDF. Photos render as the photo. A PDF is a document card.
 * Used on squawks, notes, papers, and inspection files so they look the same.
 */
export function AttachmentPreview({
  url,
  name,
  compact = false,
  onRemove,
}: {
  url: string;
  name?: string;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const label = name ?? attachmentName(url);
  const [broken, setBroken] = useState(false);
  const looksLikePhoto = isImageUrl(url, name);
  const frame = compact ? "h-36 w-full bg-muted/40 object-contain" : "h-48 w-full bg-muted/40 object-contain";

  useEffect(() => {
    setBroken(false);
  }, [url]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
      {looksLikePhoto ? (
        broken ? (
          <div className={`flex items-center justify-center px-3 text-center text-sm text-muted-foreground ${compact ? "h-36" : "h-48"}`}>
            Could not load that photo.
          </div>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={url}
              alt={label}
              className={frame}
              onError={() => setBroken(true)}
            />
          </a>
        )
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-3 hover:bg-muted/40"
        >
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        </a>
      )}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{label}</p>
        {onRemove ? (
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
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
  onRemove,
}: {
  fileUrls?: string[] | null;
  compact?: boolean;
  onRemove?: (url: string) => void;
}) {
  if (!fileUrls?.length) return null;

  return (
    <ul className={compact ? "mt-1.5 space-y-2" : "mt-2 space-y-3"}>
      {fileUrls.map((url) => (
        <li key={url}>
          <AttachmentPreview
            url={url}
            compact={compact}
            onRemove={onRemove ? () => onRemove(url) : undefined}
          />
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

/** Local file chosen but not uploaded yet. Same preview as a signed URL. */
export function PendingFilePreview({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!url) return null;
  return (
    <AttachmentPreview
      url={url}
      name={file.name}
      onRemove={disabled ? undefined : onRemove}
    />
  );
}
