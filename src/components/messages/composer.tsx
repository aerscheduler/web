import * as React from "react";
import { ArrowUp, AtSign } from "lucide-react";
import { MentionEditor, type MentionEditorHandle } from "@/components/messages/mention-editor";

/**
 * The text box under a conversation. Typing @ opens a picker of people, aircraft, bookings,
 * work orders and squawks (global search, so only what the writer may open); a pick becomes a
 * pill in the text (components/messages/mention-editor.tsx), and the message goes to the server
 * with each pill as its token.
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
  onSend: (body: string) => void;
  autoFocus?: boolean;
}) {
  const ref = React.useRef<MentionEditorHandle>(null);
  const [empty, setEmpty] = React.useState(true);

  const send = (body: string) => {
    if (disabled) return;
    onSend(body);
    ref.current?.clear();
  };

  return (
    <div className="flex items-end gap-2">
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
          onEmptyChange={setEmpty}
          className="flex-1"
          editorClassName={"messages-editor max-h-[200px] min-h-[30px] overflow-y-auto py-1 text-sm leading-[22px]" + (disabled ? " opacity-60" : "")}
        />
        <button
          type="button"
          onClick={() => ref.current?.submit()}
          disabled={disabled || empty}
          aria-label="Send"
          className="mb-px ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
