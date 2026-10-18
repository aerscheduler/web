import * as React from "react";
import { Extension, type JSONContent } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type ReactNodeViewProps } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { cn } from "@/lib/utils";
import { useGlobalSearch } from "@/features/queries";
import { SEARCH_TYPE_ICON, SEARCH_TYPE_LABEL } from "@/lib/search-links";
import { MENTION_ICON, TOKEN_RE } from "@/components/messages/message-body";
import type { MessageRef, MessageRefType } from "@/types/messages";
import type { SearchEntityType, SearchResult } from "@/types/api";

// The text box Messages writes in: the composer under a conversation and the inline editor of
// a sent message (2026-10-17).
//
// A PICKED MENTION IS ONE THING, not words. It used to be plain text in a textarea, with a map of
// shown name -> server token applied at send: editing one letter of a picked name silently
// dropped the mention, and nothing on screen said which words were a mention. Now a pick is an
// atomic Tiptap node, drawn as a pill like the one in the sent message; one Backspace removes it
// and the caret cannot land inside it. The document is written out as the SAME body the server
// always took (plain text, a newline per line, `{r:3}` per mention), so nothing else changed.

/** What the @ picker offers, in this order. The server narrows it to what the caller may read. */
const MENTION_TYPES: SearchEntityType[] = ["person", "resource", "reservation", "workorder", "squawk"];
const LETTER: Partial<Record<SearchEntityType, string>> = { person: "p", resource: "r", reservation: "v", workorder: "w", squawk: "s" };
const KIND: Partial<Record<SearchEntityType, MessageRefType>> = {
  person: "person",
  resource: "resource",
  reservation: "reservation",
  workorder: "workOrder",
  squawk: "squawk",
};
const KIND_OF_LETTER: Record<string, MessageRefType> = { p: "person", r: "resource", v: "reservation", w: "workOrder", s: "squawk" };

/** A mention's attributes on the node: `id` is the token's inside ("r:3"), `label` what shows. */
type MentionAttrs = { id: string; label: string; kind: MessageRefType | null };

/** The document as the server's body grammar. */
export function docToBody(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((p) =>
      (p.content ?? [])
        .map((n) => (n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : n.type === "mention" ? `{${n.attrs?.id}}` : ""))
        .join("")
    )
    .join("\n");
}

/** A stored body back into a document, each token a mention pill again (for editing). */
export function bodyToDoc(body: string, refs: Record<string, MessageRef>): JSONContent {
  return {
    type: "doc",
    content: body.split("\n").map((line) => {
      const content: JSONContent[] = [];
      let last = 0;
      for (const m of line.matchAll(TOKEN_RE)) {
        const at = m.index ?? 0;
        if (at > last) content.push({ type: "text", text: line.slice(last, at) });
        const key = `${m[1]}:${m[2]}`;
        const ref = refs[key];
        // A mention the writer can no longer open keeps its token and shows the generic label
        // the server gave it, so saving an edit never drops it.
        const label = !ref ? "a record" : ref.type === "person" && !ref.hidden ? `@${ref.label}` : ref.label;
        content.push({ type: "mention", attrs: { id: key, label, kind: KIND_OF_LETTER[m[1]!] ?? null } });
        last = at + m[0].length;
      }
      if (last < line.length) content.push({ type: "text", text: line.slice(last) });
      return content.length ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  };
}

function mentionLabel(r: SearchResult): string {
  return r.type === "person" ? `@${r.title}` : r.title;
}

/** The pill, drawn the way the sent message draws the same mention. */
function MentionPill({ node }: ReactNodeViewProps) {
  const { label, kind } = node.attrs as MentionAttrs;
  const Icon = kind ? MENTION_ICON[kind] : undefined;
  return (
    <NodeViewWrapper
      as="span"
      data-mention-pill=""
      className="mx-px inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 align-baseline font-semibold leading-snug text-primary"
    >
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{label}</span>
    </NodeViewWrapper>
  );
}

const MentionNode = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-kind"),
        renderHTML: (attrs: { kind?: string | null }) => (attrs.kind ? { "data-kind": attrs.kind } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionPill, { as: "span" });
  },
});

export type MentionEditorHandle = {
  focus: () => void;
  /** Type an @ at the caret (a space first when it would touch a word), opening the picker. */
  insertAt: () => void;
  submit: () => void;
  clear: () => void;
};

type Suggest = { query: string; command: (attrs: MentionAttrs) => void };

/**
 * Enter submits, Shift+Enter is a new line, Escape (with no picker open) calls `onEscape`. The
 * @ picker is a listbox above the box, driven from the editor's own keys, so the caret never
 * leaves the text.
 */
export const MentionEditor = React.forwardRef<
  MentionEditorHandle,
  {
    placeholder: string;
    ariaLabel?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    /** Seed for an edit: the stored body and the refs that name its tokens. */
    initial?: { body: string; refs: Record<string, MessageRef> };
    onSubmit: (body: string) => void;
    /** Submit even with no words (a message of only photos). */
    allowEmptySubmit?: boolean;
    onEscape?: () => void;
    onEmptyChange?: (empty: boolean) => void;
    className?: string;
    /** Classes on the editable element itself (padding, size, line height). */
    editorClassName?: string;
    /** Where the picker opens: above (composer) or below (an edit near the top). */
    pickerClassName?: string;
  }
>(function MentionEditor(
  { placeholder, ariaLabel, disabled, autoFocus, initial, onSubmit, allowEmptySubmit, onEscape, onEmptyChange, className, editorClassName, pickerClassName },
  handle
) {
  const [suggest, setSuggest] = React.useState<Suggest | null>(null);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  const search = useGlobalSearch(suggest?.query ?? "", { types: MENTION_TYPES, limit: 4 }, { enabled: !!suggest && suggest.query.length > 0 });
  const options = React.useMemo(() => {
    if (!suggest?.query) return [];
    const rows = (search.data?.results ?? []).filter((r) => LETTER[r.type]);
    return MENTION_TYPES.flatMap((t) => rows.filter((r) => r.type === t)).slice(0, 10);
  }, [search.data, suggest?.query]);
  React.useEffect(() => setActive(0), [suggest?.query]);

  // The editor is built once; everything it calls back into goes through refs so it always
  // sees this render's values.
  const live = React.useRef({ options, active, suggest, onSubmit, onEscape, onEmptyChange, placeholder, disabled, allowEmptySubmit });
  live.current = { options, active, suggest, onSubmit, onEscape, onEmptyChange, placeholder, disabled, allowEmptySubmit };

  const pick = React.useCallback((r: SearchResult) => {
    const s = live.current.suggest;
    if (!s) return;
    const id = r.type === "person" ? Number(r.params.orgUserId ?? r.id) : r.id;
    s.command({ id: `${LETTER[r.type]}:${id}`, label: mentionLabel(r), kind: KIND[r.type] ?? null });
  }, []);

  const onSuggestKey = React.useCallback(
    ({ event }: SuggestionKeyDownProps) => {
      const { options: opts, active: at } = live.current;
      if (!opts.length) return false;
      if (event.key === "ArrowDown") return setActive((i) => (i + 1) % opts.length), true;
      if (event.key === "ArrowUp") return setActive((i) => (i - 1 + opts.length) % opts.length), true;
      if (event.key === "Enter" || event.key === "Tab") return pick(opts[at]!), true;
      return false;
    },
    [pick]
  );

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    autofocus: autoFocus ? "end" : false,
    editable: !disabled,
    content: initial ? bodyToDoc(initial.body, initial.refs) : undefined,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel ?? placeholder,
        class: cn("outline-none whitespace-pre-wrap break-words", editorClassName),
      },
    },
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder: () => live.current.placeholder }),
      MentionNode.configure({
        deleteTriggerWithBackspace: true,
        renderText: ({ node }) => String(node.attrs.label ?? ""),
        suggestion: {
          char: "@",
          items: () => [],
          render: () => ({
            onStart: (p: SuggestionProps) => setSuggest({ query: p.query, command: p.command }),
            onUpdate: (p: SuggestionProps) => setSuggest({ query: p.query, command: p.command }),
            onExit: () => setSuggest(null),
            onKeyDown: (p: SuggestionKeyDownProps) => onSuggestKey(p),
          }),
        },
      }),
      // BETWEEN the mention (101) and Tiptap's own keymap (100): after the mention, so an open
      // picker takes Enter first; before the core keymap, which would otherwise split the
      // paragraph on Enter (it did, at 50) instead of sending.
      Extension.create({
        name: "messagesKeys",
        priority: 100.5,
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              submit();
              return true;
            },
            Escape: () => {
              if (!live.current.onEscape) return false;
              live.current.onEscape();
              return true;
            },
          };
        },
      }),
    ],
    onUpdate: ({ editor: e }) => live.current.onEmptyChange?.(docToBody(e.getJSON()).trim() === ""),
  });

  function submit() {
    if (!editor || live.current.disabled) return;
    const body = docToBody(editor.getJSON()).trim();
    if (!body && !live.current.allowEmptySubmit) return;
    live.current.onSubmit(body);
  }

  React.useImperativeHandle(handle, () => ({
    focus: () => editor?.commands.focus("end"),
    insertAt: () => {
      if (!editor) return;
      const { from } = editor.state.selection;
      const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, "\n", "￼");
      const needsSpace = before !== "" && !/\s/.test(before);
      editor.chain().focus().insertContent(`${needsSpace ? " " : ""}@`).run();
    },
    submit,
    clear: () => {
      editor?.commands.clearContent(true);
    },
  }));

  // Disabled and the placeholder can change after the editor is built (the compose view turns
  // both over once someone is picked); the empty-state text is a decoration, so nudge a redraw.
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);
  React.useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel ?? placeholder,
          class: cn("outline-none whitespace-pre-wrap break-words", editorClassName),
        },
      },
    });
    editor.view.dispatch(editor.state.tr.setMeta("placeholder", placeholder));
  }, [editor, placeholder, ariaLabel, editorClassName]);

  let lastGroup: string | null = null;
  return (
    <div className={cn("relative min-w-0", className)}>
      {suggest && (
        <div
          id={listId}
          role="listbox"
          aria-label="Mention"
          className={cn(
            "absolute bottom-full left-0 z-20 mb-2 w-full min-w-64 max-w-sm overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
            pickerClassName
          )}
        >
          {!suggest.query ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">Type a name, a tail number, a booking or a work order.</p>
          ) : options.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">{search.isFetching ? "Searching…" : "No matches."}</p>
          ) : (
            options.map((r, i) => {
              const Icon = SEARCH_TYPE_ICON[r.type];
              const heading = r.type !== lastGroup ? SEARCH_TYPE_LABEL[r.type] : null;
              lastGroup = r.type;
              return (
                <React.Fragment key={`${r.type}-${r.id}`}>
                  {heading && <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{heading}</div>}
                  <div
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(r);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex h-9 cursor-default items-center gap-2 rounded-md px-2 text-sm", i === active && "bg-accent")}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {/* The name wins the width; the hint gives way first. */}
                    <span className="max-w-[70%] shrink-0 truncate font-medium">{r.title}</span>
                    {r.subtitle && <span className="ml-auto min-w-0 truncate pl-2 text-xs text-muted-foreground">{r.subtitle}</span>}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
});
