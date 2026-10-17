import * as React from "react";
import { ArrowUp, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalSearch } from "@/features/queries";
import { SEARCH_TYPE_ICON, SEARCH_TYPE_LABEL } from "@/lib/search-links";
import type { SearchEntityType, SearchResult } from "@/types/api";

/** What the @ picker offers, in this order. The server narrows it to what the caller may read. */
const MENTION_TYPES: SearchEntityType[] = ["person", "resource", "reservation", "workorder", "squawk"];
const LETTER: Partial<Record<SearchEntityType, string>> = { person: "p", resource: "r", reservation: "v", workorder: "w", squawk: "s" };

type Mention = { text: string; token: string };

/** The "@word" being typed right before the caret, if any. */
function activeQuery(value: string, caret: number): { start: number; q: string } | null {
  const before = value.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]{0,40})$/);
  if (!m) return null;
  return { start: before.length - m[2]!.length - 1, q: m[2]! };
}

function mentionLabel(r: SearchResult): string {
  return r.type === "person" ? `@${r.title}` : r.title;
}

/**
 * The text box under a conversation. Typing @ opens a picker of people, aircraft, bookings,
 * work orders and squawks (global search, so only what the writer may open); a pick writes the
 * name into the text, and on send each picked name becomes the server's token.
 *
 * Enter sends, Shift+Enter is a new line. The picker is a plain listbox driven from the text
 * box's own keys, so the caret never leaves the text.
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
  const [value, setValue] = React.useState("");
  const [mentions, setMentions] = React.useState<Mention[]>([]);
  const [query, setQuery] = React.useState<{ start: number; q: string } | null>(null);
  const [active, setActive] = React.useState(0);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const listId = React.useId();

  const search = useGlobalSearch(query?.q ?? "", { types: MENTION_TYPES, limit: 4 }, { enabled: !!query && query.q.length > 0 });
  const options = React.useMemo(() => {
    if (!query || !query.q) return [];
    const rows = (search.data?.results ?? []).filter((r) => LETTER[r.type]);
    return MENTION_TYPES.flatMap((t) => rows.filter((r) => r.type === t)).slice(0, 10);
  }, [search.data, query]);

  React.useEffect(() => setActive(0), [query?.q]);

  // Grow with the text, up to about eight lines, then scroll. Re-measured when the box's width
  // changes too: a height taken while the column was narrow (mid-layout, or in the dock before
  // it expanded) otherwise stays stuck at three lines for one.
  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);
  React.useLayoutEffect(fit, [value, fit]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const sync = (next: string, caret: number) => {
    setValue(next);
    setQuery(activeQuery(next, caret));
  };

  const pick = (r: SearchResult) => {
    if (!query) return;
    const text = mentionLabel(r);
    const id = r.type === "person" ? Number(r.params.orgUserId ?? r.id) : r.id;
    const token = `{${LETTER[r.type]}:${id}}`;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}${text} ${value.slice(caret)}`;
    setMentions((m) => (m.some((x) => x.text === text) ? m : [...m, { text, token }]));
    setValue(next);
    setQuery(null);
    const at = query.start + text.length + 1;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
    });
  };

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    // Longest first, so "@Dana Kim" is matched before a shorter "@Dana".
    let body = trimmed;
    for (const m of [...mentions].sort((a, b) => b.text.length - a.text.length)) {
      body = body.split(m.text).join(m.token);
    }
    onSend(body);
    setValue("");
    setMentions([]);
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query && options.length) {
      if (e.key === "ArrowDown") return e.preventDefault(), setActive((i) => (i + 1) % options.length);
      if (e.key === "ArrowUp") return e.preventDefault(), setActive((i) => (i - 1 + options.length) % options.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), pick(options[active]!);
    }
    if (query && e.key === "Escape") return e.preventDefault(), setQuery(null);
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const openAt = () => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const needsSpace = caret > 0 && !/\s/.test(value[caret - 1]!);
    const next = `${value.slice(0, caret)}${needsSpace ? " " : ""}@${value.slice(caret)}`;
    const at = caret + (needsSpace ? 2 : 1);
    sync(next, at);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
    });
  };

  const showList = !!query;
  let lastGroup: string | null = null;

  return (
    <div className="relative">
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Mention"
          className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-sm overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {!query.q ? (
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
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={openAt}
          disabled={disabled}
          aria-label="Mention a person, aircraft, booking or work order"
          className="mb-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <AtSign className="size-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-end rounded-[20px] border bg-background py-1 pl-3.5 pr-1 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-controls={showList ? listId : undefined}
            aria-expanded={showList}
            onChange={(e) => sync(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={(e) => setQuery(activeQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0))}
            onKeyDown={onKeyDown}
            onBlur={() => setQuery(null)}
            className="max-h-[200px] min-h-[30px] flex-1 resize-none bg-transparent py-1 text-sm leading-[22px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={disabled || !value.trim()}
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
