import * as React from "react";
import { ArrowUp, AtSign, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { shortcutLabel } from "@/lib/platform";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MentionEditor, type MentionEditorHandle } from "@/components/messages/mention-editor";
import { ATTACHMENT_ACCEPT, DraftStrip, useDraftAttachments, type DraftAttachment } from "@/components/messages/attachments";

/**
 * The text box under a conversation. Typing @ opens a picker of people, aircraft, bookings,
 * work orders and squawks (global search, so only what the writer may open); a pick becomes a
 * pill in the text (components/messages/mention-editor.tsx), and the message goes to the server
 * with each pill as its token.
 *
 * One card: the text on top, + and Send under it. The + menu adds photos or files (also Mod+U,
 * dropping them on the card, or pasting a picture) or starts a mention; typing @ does that too,
 * so there is no separate @ button. Each file uploads at once and waits above the text; Send
 * waits until they are all up.
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
      className={cn(
        "rounded-[22px] border bg-background transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15",
        dragging && "border-primary/50 bg-primary/5 ring-2 ring-primary/30"
      )}
      onKeyDownCapture={(e) => {
        // Mod+U picks files, the same shortcut the + menu shows.
        if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "u") {
          e.preventDefault();
          if (!disabled) fileRef.current?.click();
        }
      }}
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
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        aria-label="Add photos or files"
        data-testid="message-attach-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      {hasFiles && (
        <div className="px-3 pt-3">
          <DraftStrip drafts={files.drafts} onRemove={files.remove} onRetry={files.retry} />
        </div>
      )}
      <MentionEditor
        ref={ref}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onSubmit={send}
        allowEmptySubmit={files.readyIds.length > 0}
        onEmptyChange={setEmpty}
        className="px-3.5 pt-2"
        editorClassName={"messages-editor max-h-[200px] min-h-[24px] overflow-y-auto text-sm leading-[22px]" + (disabled ? " opacity-60" : "")}
      />
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Add photos, files or a mention"
              title="Add photos, files or a mention"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground disabled:opacity-50"
            >
              <Plus className="size-[18px]" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-60"
            // Mention moves the caret into the text; do not hand focus back to the +.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <Paperclip aria-hidden />
              Add photos or files
              <DropdownMenuShortcut>{shortcutLabel("U")}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ref.current?.insertAt()}>
              <AtSign aria-hidden />
              Mention someone
              <DropdownMenuShortcut>@</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => ref.current?.submit()}
          disabled={!canSend}
          aria-label="Send"
          className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
