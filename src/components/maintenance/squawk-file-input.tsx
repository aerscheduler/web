import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocsHint } from "@/components/docs-hint";
import { PendingFilePreview } from "@/components/maintenance/squawk-attachments";
import { normalizeUploadFile, UPLOAD_PHOTO_EXTS, looksLikeHeic } from "@/lib/normalize-upload-file";

const ACCEPT =
  ".jpg,.jpeg,.png,.pdf,.heic,.heif,image/jpeg,image/png,image/heic,image/heif,application/pdf";
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
  helpText,
  max = MAX,
  onBusyChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  hint?: boolean;
  /** Override the append-only squawk copy (papers can be replaced). */
  helpText?: string;
  /** Remaining slots. Defaults to 5, the server cap per pick or per papers category. */
  max?: number;
  /** True while a pick is being read or transcoded, so Save cannot race the photo. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addingRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const [adding, setAdding] = useState(false);

  function clearPicker() {
    if (inputRef.current) inputRef.current.value = "";
  }

  async function add(list: FileList | null) {
    if (addingRef.current) {
      toast.error("Still adding that photo.");
      clearPicker();
      return;
    }
    if (!list?.length) return;
    addingRef.current = true;
    setAdding(true);
    onBusyChange?.(true);
    try {
      const added: File[] = [];
      let skipped = false;
      let unreadableHeic = false;
      let oversized = false;
      let capped = false;
      for (const raw of Array.from(list)) {
        if (filesRef.current.length + added.length >= max) {
          capped = true;
          break;
        }
        if (raw.size > MAX_BYTES) {
          oversized = true;
          continue;
        }
        const head = new Uint8Array(await raw.slice(0, 16).arrayBuffer());
        const file = await normalizeUploadFile(raw);
        if (!file) {
          if (looksLikeHeic(head)) unreadableHeic = true;
          else skipped = true;
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !(UPLOAD_PHOTO_EXTS as readonly string[]).includes(ext)) {
          skipped = true;
          continue;
        }
        if (file.size > MAX_BYTES) {
          oversized = true;
          continue;
        }
        added.push(file);
      }
      if (added.length) onChange([...filesRef.current, ...added].slice(0, max));
      if (unreadableHeic) {
        toast.error("Couldn't read that iPhone photo. Use the phone app, or export a JPEG from Photos.");
      }
      if (skipped) toast.error("Use a photo (jpg or png) or a PDF. Chrome on a Mac may not read a HEIC file.");
      if (oversized) toast.error("That file is too large. The limit is 25 MB.");
      if (capped) toast.error(`You can attach up to ${max} files.`);
    } finally {
      clearPicker();
      addingRef.current = false;
      setAdding(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">Photos or PDFs</span>
        {hint ? <DocsHint topic="squawk-attach" /> : null}
      </div>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`}>
              <PendingFilePreview
                file={file}
                disabled={disabled || adding}
                onRemove={() => onChange(files.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => add(e.target.files)}
            disabled={disabled || adding}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || adding}
          >
            <Paperclip className="size-3.5" />
            Attach
          </Button>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        {helpText ??
          `Up to ${MAX} photos or PDFs (jpg, png). They stay with the thread and cannot be deleted afterwards. iPhone Camera and Photos work. Chrome on a Mac may not read a raw HEIC.`}
      </p>
    </div>
  );
}
