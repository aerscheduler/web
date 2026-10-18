import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { uploadToPresignedPost, UploadError, type PresignedPost } from "@/lib/upload";
import { conversationKeys } from "@/features/messages";
import type { MessageAttachment } from "@/types/messages";

//---------------------------------------------------------------------------------
// Photos and files in Messages (2026-10-17).
//
// A file picked in a composer UPLOADS AT ONCE, while the writer is still typing: the server
// hands back an unsent upload slot (POST /conversations/attachments) and the bytes go straight
// to storage. Send then names the slots in `attachmentIds`. So the person on the other end is
// never told about a message whose picture has not arrived, and a file can be picked in New
// message before the conversation exists.
//---------------------------------------------------------------------------------

/** What the picker offers; the server holds the real list (services/conversationAttachments). */
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";
export const MAX_ATTACHMENTS = 10;

type Slot = MessageAttachment & { upload: PresignedPost };

/** One file in a composer, from the moment it is picked until the message goes. */
export type DraftAttachment = {
  key: string;
  file: File;
  /** A local preview for a picture, so the thumbnail shows before the upload finishes. */
  previewUrl: string | null;
  status: "uploading" | "ready" | "failed";
  id: number | null;
  error?: string;
};

const isPicture = (f: File) => /^image\/(jpeg|png|gif|webp)$/.test(f.type);

/** The composer's files: pick, upload, take back out, and the ids a send names. */
export function useDraftAttachments() {
  const [drafts, setDrafts] = React.useState<DraftAttachment[]>([]);
  const live = React.useRef(drafts);
  live.current = drafts;

  // Object URLs are released when their draft goes, and when the composer does.
  React.useEffect(() => () => live.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl)), []);

  const patch = (key: string, p: Partial<DraftAttachment>) => setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const upload = async (items: DraftAttachment[]) => {
    let slots: Slot[];
    try {
      slots = await api<Slot[]>("/conversations/attachments", { method: "POST", body: { fileNames: items.map((d) => d.file.name) } });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Couldn't attach that file.";
      items.forEach((d) => patch(d.key, { status: "failed", error }));
      toast.error(error);
      return;
    }
    await Promise.all(
      items.map(async (d, i) => {
        const slot = slots[i]!;
        try {
          await uploadToPresignedPost(slot.upload, d.file);
          patch(d.key, { status: "ready", id: slot.id });
        } catch (e) {
          // The slot is useless now; give it back so it never sits on anybody's quota.
          void api(`/conversations/attachments/${slot.id}`, { method: "DELETE" }).catch(() => undefined);
          const error = e instanceof UploadError ? e.message : "That file didn't upload.";
          patch(d.key, { status: "failed", error });
          toast.error(error);
        }
      })
    );
  };

  const add = (files: File[]) => {
    if (!files.length) return;
    const room = MAX_ATTACHMENTS - live.current.length;
    if (room <= 0) return void toast.error(`A message can carry up to ${MAX_ATTACHMENTS} files.`);
    if (files.length > room) toast.error(`A message can carry up to ${MAX_ATTACHMENTS} files. Added the first ${room}.`);
    const items = files.slice(0, room).map<DraftAttachment>((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: isPicture(file) ? URL.createObjectURL(file) : null,
      status: "uploading",
      id: null,
    }));
    setDrafts((all) => [...all, ...items]);
    void upload(items);
  };

  const remove = (key: string) => {
    const d = live.current.find((x) => x.key === key);
    if (!d) return;
    if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    if (d.id != null) void api(`/conversations/attachments/${d.id}`, { method: "DELETE" }).catch(() => undefined);
    setDrafts((all) => all.filter((x) => x.key !== key));
  };

  const retry = (key: string) => {
    const d = live.current.find((x) => x.key === key);
    if (!d) return;
    patch(key, { status: "uploading", error: undefined });
    void upload([{ ...d, status: "uploading" }]);
  };

  /** After a send: the drafts become the message, so their previews are handed over, not freed. */
  const takeAll = () => {
    const taken = live.current;
    setDrafts([]);
    return taken;
  };

  return {
    drafts,
    add,
    remove,
    retry,
    takeAll,
    readyIds: drafts.filter((d) => d.status === "ready").map((d) => d.id!),
    uploading: drafts.some((d) => d.status === "uploading"),
    failed: drafts.some((d) => d.status === "failed"),
  };
}

/** The files waiting in a composer: a thumbnail or a file chip each, with an X. */
export function DraftStrip({
  drafts,
  onRemove,
  onRetry,
}: {
  drafts: DraftAttachment[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  if (!drafts.length) return null;
  return (
    <ul aria-label="Attached files" className="flex flex-wrap gap-2 pb-2">
      {drafts.map((d) => (
        <li key={d.key} className="group relative" data-attachment-draft={d.status}>
          {d.previewUrl ? (
            <img src={d.previewUrl} alt={d.file.name} className="size-16 rounded-lg border object-cover" />
          ) : (
            <div className="flex h-16 w-44 items-center gap-2 rounded-lg border bg-muted/40 px-2.5">
              <FileGlyph name={d.file.name} className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-xs font-medium">{d.file.name}</span>
            </div>
          )}
          {d.status === "uploading" && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60" aria-label="Uploading">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </span>
          )}
          {d.status === "failed" && (
            <button
              type="button"
              onClick={() => onRetry(d.key)}
              title={d.error}
              aria-label={`Try ${d.file.name} again`}
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-amber-700 dark:text-amber-400"
            >
              <RotateCw className="size-5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(d.key)}
            aria-label={`Remove ${d.file.name}`}
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FileGlyph({ name, className }: { name: string; className?: string }) {
  return /\.(xlsx?|csv)$/i.test(name) ? <FileSpreadsheet className={className} aria-hidden /> : <FileText className={className} aria-hidden />;
}

function kindOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return { pdf: "PDF", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", csv: "CSV", txt: "Text", heic: "Photo", heif: "Photo" }[ext] ?? "File";
}

/**
 * A sent message's photos and files: pictures inline (one large, several in a grid), anything
 * else a card that opens the file. Links are signed for 15 minutes, so a picture that fails to
 * load refetches the thread once for fresh ones.
 */
export function MessageAttachments({
  attachments,
  conversationId,
  mine,
  local,
}: {
  attachments: Array<Pick<MessageAttachment, "fileName" | "isImage" | "url"> & { id: number | string }>;
  conversationId?: number;
  mine: boolean;
  /** Still sending: drawn from the composer's own previews, not yet links. */
  local?: boolean;
}) {
  const qc = useQueryClient();
  const refreshed = React.useRef(false);
  const refresh = () => {
    if (refreshed.current || conversationId == null) return;
    refreshed.current = true;
    void qc.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) });
  };
  const pictures = attachments.filter((a) => a.isImage && a.url);
  const files = attachments.filter((a) => !(a.isImage && a.url));
  return (
    <div className={cn("flex max-w-[75%] flex-col gap-1", mine ? "items-end self-end" : "items-start")} data-message-attachments="">
      {pictures.length > 0 && (
        <div className={cn("grid gap-1", pictures.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {pictures.map((a) => (
            <a
              key={a.id}
              href={local ? undefined : (a.url ?? undefined)}
              target="_blank"
              rel="noreferrer"
              className={cn("block overflow-hidden rounded-[14px] border bg-muted", local && "opacity-60")}
            >
              <img
                src={a.url ?? undefined}
                alt={a.fileName}
                onError={refresh}
                className={cn("block object-cover", pictures.length === 1 ? "max-h-72 max-w-[280px]" : "size-36")}
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={local ? undefined : (a.url ?? undefined)}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex w-64 max-w-full items-center gap-2.5 rounded-[14px] border bg-background px-3 py-2.5 text-left hover:bg-muted/50",
            local && "opacity-60"
          )}
        >
          <FileGlyph name={a.fileName} className="size-6 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{a.fileName}</span>
            <span className="block text-xs text-muted-foreground">{kindOf(a.fileName)}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
