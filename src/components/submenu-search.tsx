import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A search box that works inside a Radix menu submenu.
 *
 * A menu is not a form. Radix's keyboard model assumes focus lives on a menu ITEM and drives
 * everything from there, so an `<input>` dropped into one is a foreign body and four separate
 * things break — each of which had to be wired back by hand:
 *
 *  1. **Typeahead ate the keystrokes.** Menus jump focus to the item starting with whatever
 *     letter you typed, so the box lost focus on the first character.
 *  2. **Focus never reached the box.** Radix opens a submenu on HOVER while deliberately
 *     leaving focus on the trigger — and the trigger lives in the PARENT menu, so a handler on
 *     the submenu content never even saw the keystroke. `captureTyping` goes on the trigger.
 *  3. **Tab escaped the menu**, which closed the submenu and threw away the query.
 *  4. **Arrow keys and Enter did nothing** from the box, because it is not part of the
 *     roving-focus ring Radix navigates.
 *
 * The box is deliberately NOT auto-focused when the submenu opens. Radix switches submenus as
 * the pointer travels down the field list, and a focused input inside one holds it open — so
 * autofocus silently broke browsing by hover. The first real keystroke takes focus instead,
 * which costs nothing: the caret arrives exactly when you start typing.
 *
 * Usage — spread the three handlers onto the trigger, the content and the box:
 *
 *     const search = useSubmenuSearch();
 *     <DropdownMenuSub onOpenChange={search.setOpen}>
 *       <DropdownMenuSubTrigger onKeyDown={search.captureTyping}>…</DropdownMenuSubTrigger>
 *       <DropdownMenuSubContent ref={search.contentRef} onKeyDown={search.onContentKeyDown}>
 *         <SubmenuSearchBox search={search} placeholder="Search aircraft…" />
 *         …options…
 */
export interface SubmenuSearch {
  query: string;
  setQuery: (q: string) => void;
  setOpen: (open: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  captureTyping: (e: ReactKeyboardEvent) => void;
  onContentKeyDown: (e: ReactKeyboardEvent) => void;
  onSearchKeyDown: (e: ReactKeyboardEvent) => void;
}

export function useSubmenuSearch(): SubmenuSearch {
  const [query, setQuery] = useState("");
  // Radix stays in charge of opening and closing — this only OBSERVES it. Feeding `open` back
  // as a controlled prop breaks sibling switching, so hovering another field can no longer
  // close this one and two submenus sit open at once.
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Reopening a field should offer the whole list again, not the last thing searched for.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  /** The option rows currently rendered in this submenu, in visual order. */
  const items = () =>
    Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemcheckbox"],[role="menuitemradio"],[role="menuitem"]'
      ) ?? []
    ).filter((el) => !el.hasAttribute("data-disabled"));

  const appendChar = (char: string) => {
    setQuery((q) => q + char);
    inputRef.current?.focus();
  };

  /** Printable key pressed while focus is anywhere but the box → it lands in the box. */
  const captureTyping = (e: ReactKeyboardEvent) => {
    if (!open) return; // closed submenu — let the parent menu's own typeahead work
    if (e.target instanceof HTMLInputElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    appendChar(e.key);
  };

  /**
   * Keys pressed once focus has moved onto the option rows.
   *
   * Arrow keys are Radix's roving focus and are left alone. This adds the two things it has no
   * concept of: Tab cycles within the results rather than tabbing out of the menu, and
   * Backspace jumps back to the box so a query can be corrected without the mouse.
   */
  const onContentKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Backspace" && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      e.stopPropagation();
      setQuery((q) => q.slice(0, -1));
      inputRef.current?.focus();
      return;
    }

    if (e.key === "Tab") {
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        // Walking back past the first result returns to the box, not out of the menu.
        if (i <= 0) inputRef.current?.focus();
        else list[i - 1]?.focus();
      } else {
        list[i < 0 || i === list.length - 1 ? 0 : i + 1]?.focus();
      }
      return;
    }

    captureTyping(e);
  };

  /** Keys pressed while the box itself has focus. */
  const onSearchKeyDown = (e: ReactKeyboardEvent) => {
    const list = items();

    // Tab means "go to the results", not "leave" — inside an open filter menu that is what you
    // actually want, and letting it escape destroys the query you just typed. Shift+Tab out of
    // the box is handled by the content, which walks back through the results first.
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      if (list.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      list[0]?.focus();
      return;
    }
    if (e.key === "ArrowUp") {
      if (list.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      list[list.length - 1]?.focus();
      return;
    }
    // Enter takes the top match — the "type three letters and hit Enter" path. `click()` routes
    // through Radix's own select handling, so a checkbox toggles and the menu stays open while
    // a radio commits, exactly as clicking would.
    if (e.key === "Enter") {
      if (list.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      list[0]?.click();
      return;
    }
    // Escape falls through so Radix closes the submenu. Everything else is ordinary text
    // editing and must not reach the menu's typeahead.
    if (e.key === "Escape") return;
    e.stopPropagation();
  };

  return {
    query,
    setQuery,
    setOpen,
    inputRef,
    contentRef,
    captureTyping,
    onContentKeyDown,
    onSearchKeyDown,
  };
}

/** The box itself. Pair with {@link useSubmenuSearch}. */
export function SubmenuSearchBox({
  search,
  placeholder,
  className,
}: {
  search: SubmenuSearch;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 border-b border-border p-1", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={search.inputRef}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={search.onSearchKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 border-none pl-7 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

/**
 * Minimal guard for a plain VALUE input inside a menu (a number, a date) — one that has no
 * option list under it to navigate into.
 *
 * Same first problem as the search box: the menu's typeahead would steal every keystroke.
 * Tab is swallowed too, because tabbing out closes the submenu and discards what was typed.
 * Escape and the arrows stay the menu's to handle.
 */
export function stopMenuTypeahead(e: ReactKeyboardEvent) {
  if (e.key === "Escape" || e.key === "ArrowDown" || e.key === "ArrowUp") return;
  if (e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  e.stopPropagation();
}

/** Case-insensitive match on an option's label and its optional secondary hint. */
export function optionMatches(
  o: { label: string; hint?: string },
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle);
}
