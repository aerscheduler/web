import { useRef } from "react";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocsHint } from "@/components/docs-hint";

const ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";
const MAX = 5;
/** Same ceiling the server signs into the S3 POST (`UPLOAD_MAX_BYTES_DOCUMENT`). */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Pick photos or PDFs for a squawk or a note. Max five. Types are also enforced
 * on the server; this keeps a bad pick from looking successful until save.
 */
export function SquawkFileInput({
  files,
  onChange,
  disabled,
  hint = true,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  hint?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    let skipped = false;
    let oversized = false;
    let capped = false;
    for (const file of Array.from(list)) {
      if (next.length >= MAX) {
        capped = true;
        break;
      }
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["jpg", "jpeg", "png", "pdf"].includes(ext)) {
        skipped = true;
        continue;
      }
      if (file.size > MAX_BYTES) {
        oversized = true;
        continue;
      }
      next.push(file);
    }
    onChange(next);
    if (skipped) toast.error("Use a photo (jpg, png) or a PDF.");
    if (oversized) toast.error("That file is too large. The limit is 25 MB.");
    if (capped) toast.error(`You can attach up to ${MAX} files.`);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">Photos or PDFs</span>
        {hint ? <DocsHint topic="squawk-attach" /> : null}
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-[12px]"
            >
              <span className="min-w-0 truncate">{file.name}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                disabled={disabled}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < MAX && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => add(e.target.files)}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip className="size-3.5" />
            Attach
          </Button>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        Up to {MAX} photos (jpg, png) or PDFs. They stay with the thread and cannot be deleted
        afterwards.
      </p>
    </div>
  );
}
