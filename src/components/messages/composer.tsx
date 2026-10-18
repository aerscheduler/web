import * as React from "react";
import { ArrowUp, AtSign, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MentionEditor, type MentionEditorHandle } from "@/components/messages/mention-editor";
import { ATTACHMENT_ACCEPT, DraftStrip, useDraftAttachments, type DraftAttachment } from "@/components/messages/attachments";

/**
 * The text box under a conversation. Typing @ opens a picker of people, aircraft, bookings,
 * work orders and squawks (global search, so only what the writer may open); a pick becomes a
 * pill in the text (components/messages/mention-editor.tsx), and the message goes to the server
 * with each pill as its token.
 *
 * Photos and files come in by the paperclip, by dropping them on the box, or by pasting a
 * picture. Each uploads at once and waits above the text; Send waits until they are all up.
 *
 * Enter sends, Shift+Enter is a new line.
 */
export function Composer({
  placeholder,
  disabled,
  onSend,
  autoFocus,
}: {
  placeholder: string;
  disabled?: boolean;
  /** `attachments` are the drafts that went with it, for an optimistic bubble. */
  onSend: (body: string, attachmentIds: number[], attachments: DraftAttachment[]) => void;
  autoFocus?: boolean;
}) {
  const ref = React.useRef<MentionEditorHandle>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const files = useDraftAttachments();
  const hasFiles = files.drafts.length > 0;
  const canSend = !disabled && !files.uploading && !files.failed && (!empty || files.readyIds.length > 0);

  const send = (body: string) => {
    if (disabled) return;
    if (files.uploading) return void toast.message("Still uploading. It sends when the files are up.");
    if (files.failed) return void toast.error("A file didn't upload. Try it again or remove it.");
    if (!body && !files.readyIds.length) return;
    const ids = files.readyIds;
    onSend(body, ids, files.takeAll());
    ref.current?.clear();
  };

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    files.add(Array.from(list));
    ref.current?.focus();
  };

  return (
    <div
      className={cn("rounded-[22px] transition-colors", dragging && "bg-primary/5 ring-2 ring-primary/30")}
      onDragOver={(e) => {
        if (disabled || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (disabled || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      onPasteCapture={(e) => {
        // A pasted screenshot is a file; pasted words stay words.
        const pasted = Array.from(e.clipboardData.files);
        if (disabled || !pasted.length) return;
        e.preventDefault();
        files.add(pasted);
      }}
    >
      {hasFiles && (
        <div className="pl-10">
          <DraftStrip drafts={files.drafts} onRemove={files.remove} onRetry={files.retry} />
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          aria-label="Attach photos or files"
          data-testid="message-attach-input"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Attach photos or files"
          title="Attach photos or files"
          className="mb-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Paperclip className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => ref.current?.insertAt()}
          disabled={disabled}
          aria-label="Mention a person, aircraft, booking or work order"
          className="mb-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <AtSign className="size-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-end rounded-[20px] border bg-background py-1 pl-3.5 pr-1 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <MentionEditor
            ref={ref}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            onSubmit={send}
            allowEmptySubmit={files.readyIds.length > 0}
            onEmptyChange={setEmpty}
            className="flex-1"
            editorClassName={"messages-editor max-h-[200px] min-h-[30px] overflow-y-auto py-1 text-sm leading-[22px]" + (disabled ? " opacity-60" : "")}
          />
          <button
            type="button"
            onClick={() => ref.current?.submit()}
            disabled={!canSend}
            aria-label="Send"
            className="mb-px ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
