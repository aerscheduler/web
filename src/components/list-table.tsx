import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSecondPress } from "@/lib/use-second-press";

/**
 * A list that lines up like a table: grouped rows under pinned headers, parent rows with their
 * children indented beneath, and every row, group and child sharing one set of columns. Drawn
 * like Linear's issue lists (hairline rows, no grid lines, colour only where it means something);
 * Tony picked the look from a mockup on 2026-09-30.
 *
 * WHEN TO USE IT: a bounded set read as a whole, one job's items and lines, one shop's open jobs.
 * It takes every row at once and groups them in the browser. A long list that pages on the server
 * belongs in DataTable, which is paged by contract: a group split across two pages would show the
 * wrong count and the wrong total.
 *
 * WHAT IT OWNS: the column layout, the groups and their totals, folding, the keyboard (arrows move,
 * Enter opens, Left and Right fold), row states, and the narrow layout, where every column not
 * marked `keep` folds into a line under the title. Row actions show on hover with a mouse and are
 * always visible on a touch screen: the front desk runs the console on an iPad.
 */

export type ListTableColumn = {
  id: string;
  header?: React.ReactNode;
  /** A CSS grid track, "8rem" or "minmax(0,1fr)". */
  width: string;
  align?: "start" | "end";
  /**
   * In a narrow list: stays a column ("keep"), folds into the line under the title (the
   * default), or is left out ("hide"), for a column that only says something in a grid, like
   * a progress bar, which would leave a stray separator in the folded line.
   */
  narrow?: "keep" | "fold" | "hide";
  /** Its header sorts the rows. The list only draws the sort; the caller orders the rows. */
  sortable?: boolean;
};

/** Which column the rows are ordered by; `title` is the title column. */
export type ListTableSort = { id: string; desc: boolean };

export type ListTableRow = {
  id: string;
  title: React.ReactNode;
  /** A status icon or a kind icon, before the title. */
  leading?: React.ReactNode;
  /** Small tags after the title. In a narrow list they move under it. */
  tags?: React.ReactNode;
  /** A muted line under the title: how a line was priced, when an item was done. */
  subtitle?: React.ReactNode;
  /** Keyed by column id. */
  cells?: Record<string, React.ReactNode>;
  /** The title runs across every column but the last: a row with nothing in the middle ones. */
  span?: boolean;
  /** A parent row: a step bolder than its children. */
  emphasis?: boolean;
  /** A parent row that starts with its children hidden: a healthy tail's inspections. */
  defaultFolded?: boolean;
  /** Not counted (a line not billed), drawn quieter. */
  dim?: boolean;
  /** The row's menu. Clicks inside it never open the row. */
  actions?: React.ReactNode;
  /** Enter, or a click on the row. A row with children and no `onOpen` folds instead. */
  onOpen?: () => void;
  /** A double click: the record's own page, when a click only opens a panel beside the list. */
  onOpenPage?: () => void;
  /** The record showing beside the list. */
  selected?: boolean;
  /** For assistive technology, when the title is not plain text. */
  label?: string;
  /** Hooks for tests and the docs screenshots. */
  testId?: string;
  children?: ListTableRow[];
};

export type ListTableGroup = {
  id: string;
  label: React.ReactNode;
  /** A dot or a status icon before the label. */
  marker?: React.ReactNode;
  count?: React.ReactNode;
  /** Shown in the last column: the group's total. */
  summary?: React.ReactNode;
  rows: ListTableRow[];
  /**
   * Groups inside this one, each under its own header pinned beneath this one's: grouped by
   * date, then by resource. A group with subgroups draws theirs after its own `rows`.
   */
  subgroups?: ListTableGroup[];
  /** A + on the group's header that adds a row already in this group: "Add a finding". */
  onAdd?: () => void;
  /** What the + adds, for its label and tooltip. */
  addLabel?: string;
};

/** Narrower than this, the folding columns go under the title. Measured on the list, not the window. */
const NARROW_AT = 600;

export function ListTable({
  label,
  columns,
  groups,
  titleHeader,
  showHeader = false,
  toolbar,
  footer,
  empty,
  stickyTop = "0px",
  fill = false,
  docShot,
  className,
  sort = null,
  onSortChange,
  titleSortable = false,
  narrowAt = NARROW_AT,
  childNoun = "lines",
}: {
  /** What the list is, for assistive technology. */
  label: string;
  columns: ListTableColumn[];
  groups: ListTableGroup[];
  titleHeader?: React.ReactNode;
  /** The column labels. Off by default, like Linear; on where the numbers need naming. */
  showHeader?: boolean;
  toolbar?: React.ReactNode;
  /** A last row: a label, and a value in the last column; an action sits just before the value. */
  footer?: { label: React.ReactNode; value: React.ReactNode; action?: React.ReactNode };
  /** Shown when no group has a row. */
  empty?: React.ReactNode;
  /** Where the group headers pin, from the top of the scrolling area. */
  stickyTop?: string;
  /**
   * Take the height it is given and scroll its rows inside, the toolbar, the column labels and
   * the footer staying put: the page itself does not scroll. The parent must bound the height
   * (a flex column with `min-h-0`).
   */
  fill?: boolean;
  docShot?: string;
  className?: string;
  /**
   * Sorting from the column headers: a click sorts by that column, again the other way, a third
   * time back to the list's own order. Rows stay in their groups; the caller orders them.
   */
  sort?: ListTableSort | null;
  onSortChange?: (sort: ListTableSort | null) => void;
  titleSortable?: boolean;
  /**
   * The width, in pixels, below which the folding columns go under the title. Raise it for a
   * list with many columns: past their total the title column is squeezed to nothing.
   */
  narrowAt?: number;
  /** What a parent's children are, for its fold button: "Show its aircraft". */
  childNoun?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const clippedTip = useClippedTip();
  const header = (id: string, content: React.ReactNode, sortable: boolean, end = false) => {
    if (!sortable || !onSortChange) {
      return (
        <span key={id} role="columnheader" className={cn("truncate", end && "text-right")}>
          {content}
        </span>
      );
    }
    const on = sort?.id === id ? sort : null;
    const next = !on ? { id, desc: false } : !on.desc ? { id, desc: true } : null;
    const Arrow = on?.desc ? ArrowDown : ArrowUp;
    return (
      <span key={id} role="columnheader" aria-sort={on ? (on.desc ? "descending" : "ascending") : "none"} className={cn("min-w-0", end && "text-right")}>
        <button
          type="button"
          onClick={() => onSortChange(next)}
          className={cn(
            "group/sort inline-flex max-w-full items-center gap-1 rounded uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            end && "flex-row-reverse",
            on && "text-foreground"
          )}
        >
          <span className="truncate">{content}</span>
          <Arrow className={cn("size-3 shrink-0", on ? "opacity-100" : "opacity-0 group-hover/sort:opacity-50")} aria-hidden />
        </button>
      </span>
    );
  };
  const narrow = useNarrow(ref, narrowAt);
  const [foldedGroups, setFoldedGroups] = React.useState<Set<string>>(() => new Set());
  // The rows somebody folded or unfolded by hand, and which way. Stored as the state they
  // chose rather than as a flip of the default: a row whose default changes under it (a tail
  // that went from Current to Due soon) must not have a remembered flip turn it the wrong way.
  const [chosenFolds, setChosenFolds] = React.useState<Map<string, boolean>>(() => new Map());
  const isRowFolded = (r: ListTableRow) => chosenFolds.get(r.id) ?? r.defaultFolded ?? false;
  /** Fold or unfold a parent row; with no `open`, the other way from how it is. */
  const foldRow = (r: ListTableRow, open?: boolean) => {
    const fold = open === undefined ? !isRowFolded(r) : !open;
    if (fold === isRowFolded(r)) return;
    setChosenFolds((prev) => new Map(prev).set(r.id, fold));
  };
  const [focusId, setFocusId] = React.useState<string | null>(null);
  // A double click opens the row's own page, even after the first click docked a panel and the
  // list moved under the pointer.
  const secondPress = useSecondPress<ListTableRow>((r) => r.onOpenPage?.());

  const shown = narrow ? columns.filter((c) => c.narrow === "keep") : columns;
  const template = ["minmax(0,1fr)", ...shown.map((c) => c.width), "2rem"].join(" ");
  const last = shown.length; // index (0-based, after the title) of the last data column
  const hasRows = groups.some(groupHasRows);
  const headerShown = showHeader && !narrow && hasRows;
  // Group headers pin under the column labels when those are shown and pinned too.
  const groupTop = headerShown ? `calc(${stickyTop} + 2rem)` : stickyTop;

  // Every row by id, for the keyboard.
  const byId = new Map<string, { row: ListTableRow; parent: string | null }>();
  const index = (g: ListTableGroup) => {
    for (const r of g.rows) {
      byId.set(r.id, { row: r, parent: null });
      for (const c of r.children ?? []) byId.set(c.id, { row: c, parent: r.id });
    }
    g.subgroups?.forEach(index);
  };
  groups.forEach(index);
  const firstIn = (list: ListTableGroup[]): string | null => {
    for (const g of list) {
      if (foldedGroups.has(g.id)) continue;
      const id = g.rows[0]?.id ?? firstIn(g.subgroups ?? []);
      if (id) return id;
    }
    return null;
  };
  const firstId = firstIn(groups);
  const tabbable = focusId != null && byId.has(focusId) ? focusId : firstId;

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, open?: boolean) =>
    set((prev) => {
      const next = new Set(prev);
      const isFolded = next.has(id);
      const fold = open === undefined ? !isFolded : !open;
      if (fold) next.add(id);
      else next.delete(id);
      return next;
    });

  const focusRow = (id: string) => {
    setFocusId(id);
    ref.current?.querySelector<HTMLElement>(`[data-lt-row="${CSS.escape(id)}"]`)?.focus();
  };

  const activate = (r: ListTableRow) => {
    if (r.onOpen) r.onOpen();
    else if (r.children?.length) foldRow(r);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-lt-row]");
    if (!el || el !== e.target) return; // keys inside a menu or a button are theirs
    const id = el.dataset.ltRow!;
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>("[data-lt-row]") ?? [])];
    const i = rows.indexOf(el);
    const entry = byId.get(id);
    const go = (j: number) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, j))];
      if (target) focusRow(target.dataset.ltRow!);
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        go(i - 1);
        break;
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(rows.length - 1);
        break;
      case "ArrowRight":
        if (entry?.row.children?.length && isRowFolded(entry.row)) {
          e.preventDefault();
          foldRow(entry.row, true);
        }
        break;
      case "ArrowLeft":
        if (entry?.row.children?.length && !isRowFolded(entry.row)) {
          e.preventDefault();
          foldRow(entry.row, false);
        } else if (entry?.parent) {
          e.preventDefault();
          focusRow(entry.parent);
        }
        break;
      case "Enter":
        if (entry) {
          e.preventDefault();
          activate(entry.row);
        }
        break;
    }
  }

  const cellClass = (c: ListTableColumn) => cn("min-w-0 truncate tnum", c.align === "end" && "text-right");

  const renderRow = (r: ListTableRow, level: 2 | 3, lastChild: boolean, depth = 0) => {
    const hasKids = !!r.children?.length;
    const folded = isRowFolded(r);
    const kept = shown;
    const folding = narrow
      ? columns.filter((c) => c.narrow !== "keep" && c.narrow !== "hide" && r.cells?.[c.id] != null && r.cells[c.id] !== "")
      : [];
    const titleSpan = r.span ? `1 / span ${Math.max(1, kept.length)}` : undefined;
    return (
      <React.Fragment key={r.id}>
        <div
          role="row"
          aria-level={level + depth}
          aria-expanded={hasKids ? !folded : undefined}
          aria-selected={r.selected || undefined}
          aria-label={r.label}
          data-lt-row={r.id}
          data-testid={r.testId}
          tabIndex={tabbable === r.id ? 0 : -1}
          onFocus={() => setFocusId(r.id)}
          onClick={(e) => {
            // React bubbles events through portals: a click inside a dialog opened from this
            // row (a Grade dialog, a menu) arrives here although it is nowhere near the row.
            if (!e.currentTarget.contains(e.target as Node)) return;
            // A click on a button, a link or a menu inside the row is that control's, not the row's.
            const control = (e.target as HTMLElement).closest("button, a, input, select, textarea, [role='menuitem'], [data-row-ignore]");
            if (control && control !== e.currentTarget) return;
            activate(r);
          }}
          onMouseDown={r.onOpenPage ? (e) => secondPress.press(r, e) : undefined}
          onMouseOver={clippedTip.onMouseOver}
          onMouseLeave={clippedTip.onMouseLeave}
          className={cn(
            "group/row relative grid min-h-10 cursor-default items-center gap-x-3 border-b border-border/70 pr-1 pl-4 text-[13px] outline-none",
            "hover:bg-accent/60 focus-visible:bg-accent",
            r.selected && "bg-accent before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary",
            "focus-visible:before:absolute focus-visible:before:inset-y-0 focus-visible:before:left-0 focus-visible:before:w-0.5 focus-visible:before:bg-primary",
            r.dim && "text-muted-foreground",
            (r.onOpen || hasKids) && "cursor-pointer"
          )}
          style={{ gridTemplateColumns: template }}
        >
          <div
            role="gridcell"
            className={cn(
              "flex min-w-0 items-center gap-2 self-stretch py-2",
              // A child hangs from its parent's leading icon (the tree line runs down beneath it)
              // and starts past the parent's title, so the nesting reads at a glance (Tony,
              // 2026-09-30: level with the parent, the lines read as more items).
              level === 3 &&
                cn(
                  "relative pl-[52px]",
                  "before:absolute before:top-0 before:left-[31px] before:border-l before:border-border",
                  lastChild ? "before:bottom-1/2" : "before:bottom-0",
                  "after:absolute after:top-1/2 after:left-[31px] after:w-3.5 after:border-t after:border-border"
                ),
              // A subgroup's rows hang from its chevron on the same tree line, so they read as
              // the subgroup's, not the outer group's.
              level === 2 &&
                depth > 0 &&
                cn(
                  "relative pl-9",
                  "before:absolute before:top-0 before:left-[31px] before:border-l before:border-border",
                  lastChild ? "before:bottom-1/2" : "before:bottom-0",
                  "after:absolute after:top-1/2 after:left-[31px] after:w-3 after:border-t after:border-border"
                )
            )}
            style={titleSpan ? { gridColumn: titleSpan } : undefined}
          >
            {level === 2 &&
              (hasKids ? (
                <button
                  type="button"
                  aria-label={folded ? `Show its ${childNoun}` : `Hide its ${childNoun}`}
                  onClick={() => foldRow(r)}
                  className="-ml-1 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  tabIndex={-1}
                >
                  <ChevronDown className={cn("size-3.5 transition-transform", folded && "-rotate-90")} />
                </button>
              ) : (
                <span className="-ml-1 size-5 shrink-0" aria-hidden />
              ))}
            {r.leading && <span className="flex shrink-0 items-center">{r.leading}</span>}
            <div className="min-w-0 flex-1">
              {/* The title wins the room: it shrinks only past the whole cell, and the tags give
                  way first. A tag that doesn't fit wraps to a second line this one hides, and when
                  not even one fits the whole strip wraps away, so no tag is ever cut in half. */}
              <div className={cn("flex min-w-0 items-center gap-x-2", !narrow && r.tags && "h-5 flex-wrap overflow-hidden")}>
                <span className={cn("max-w-full shrink-0", narrow ? "min-w-0 [overflow-wrap:break-word]" : "truncate", r.emphasis && "font-medium")}>{r.title}</span>
                {!narrow && r.tags && <span className="flex h-5 min-w-min flex-1 flex-wrap items-center gap-x-1.5 overflow-hidden">{r.tags}</span>}
              </div>
              {narrow && r.tags && <div className="mt-1 flex flex-wrap items-center gap-1.5">{r.tags}</div>}
              {r.subtitle && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{r.subtitle}</div>}
              {folding.length > 0 && (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground tnum">
                  {folding.map((c, i) => (
                    <React.Fragment key={c.id}>
                      {i > 0 && <span aria-hidden>·</span>}
                      <span className="inline-flex items-center gap-1">{r.cells![c.id]}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
          {(r.span ? kept.slice(-1) : kept).map((c) => (
            <div key={c.id} role="gridcell" data-col={c.id} className={cellClass(c)}>
              {r.cells?.[c.id]}
            </div>
          ))}
          <div role="gridcell" className="flex justify-end">
            {r.actions && (
              <span className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100">
                {r.actions}
              </span>
            )}
          </div>
        </div>
        {hasKids && !folded && r.children!.map((c, i) => renderRow(c, 3, i === r.children!.length - 1, depth))}
      </React.Fragment>
    );
  };

  /** A group's header and its rows; `depth` 1 is a subgroup, its header pinned under its parent's. */
  const renderGroup = (g: ListTableGroup, depth: 0 | 1): React.ReactNode => {
    const folded = foldedGroups.has(g.id);
    const subgroups = (g.subgroups ?? []).filter(groupHasRows);
    return (
      <div key={g.id} role="rowgroup">
        <div
          role="row"
          aria-level={depth + 1}
          aria-expanded={!folded}
          onClick={() => toggle(setFoldedGroups, g.id)}
          className={cn(
            "group/group sticky grid h-9 cursor-pointer items-center gap-x-3 border-b border-border/70 pr-1 pl-4 text-[13px] backdrop-blur select-none",
            depth === 0 ? "z-[5] bg-muted/60 supports-[backdrop-filter]:bg-muted/80" : "z-[4] bg-card/90 supports-[backdrop-filter]:bg-card/80"
          )}
          style={{ gridTemplateColumns: template, top: depth === 0 ? groupTop : `calc(${groupTop} + 2.25rem)` }}
        >
          <div
            role="gridcell"
            className={cn("flex min-w-0 items-center gap-2", depth === 1 && "pl-6")}
            style={{ gridColumn: `1 / span ${Math.max(1, last)}` }}
          >
            <button
              type="button"
              aria-label={folded ? "Show the group" : "Hide the group"}
              className="-ml-1 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", folded && "-rotate-90")} />
            </button>
            {g.marker && <span className="flex shrink-0 items-center">{g.marker}</span>}
            <span className="truncate font-medium">{g.label}</span>
            {g.count != null && <span className="shrink-0 text-muted-foreground tnum">{g.count}</span>}
          </div>
          <div role="gridcell" className="truncate text-right text-muted-foreground tnum">
            {g.summary}
          </div>
          <div role="gridcell" className="flex justify-end">
            {g.onAdd && (
              <button
                type="button"
                aria-label={g.addLabel ?? "Add"}
                title={g.addLabel}
                onClick={(e) => {
                  // The header folds on a click; the + only adds.
                  e.stopPropagation();
                  g.onAdd!();
                }}
                className="grid size-6 place-items-center rounded text-muted-foreground opacity-0 outline-none transition-opacity group-hover/group:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        {!folded && g.rows.map((r, i) => renderRow(r, 2, i === g.rows.length - 1, depth))}
        {!folded && subgroups.map((sg) => renderGroup(sg, 1))}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className={cn("overflow-clip rounded-lg border border-border bg-card", fill && "flex min-h-0 flex-col", className)}
      data-doc-shot={docShot}
    >
      {toolbar && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">{toolbar}</div>}
      <div
        role="treegrid"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(fill && "min-h-0 flex-1 overflow-auto overscroll-contain")}
      >
        {headerShown && (
          <div
            role="row"
            className="sticky z-[6] grid h-8 items-center gap-x-3 border-b border-border/70 bg-card pr-1 pl-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            style={{ gridTemplateColumns: template, top: stickyTop }}
          >
            {header("title", titleHeader, titleSortable)}
            {shown.map((c) => header(c.id, c.header, !!c.sortable, c.align === "end"))}
            <span role="columnheader" aria-label="Actions" />
          </div>
        )}
        {!hasRows && empty}
        {groups.filter(groupHasRows).map((g) => renderGroup(g, 0))}
      </div>
      {footer && hasRows && (
        <div data-slot="list-table-footer" className="grid shrink-0 items-center gap-x-3 border-t border-border pr-1 pl-4 py-3 text-[13px]" style={{ gridTemplateColumns: template }}>
          <span className="flex min-w-0 items-center justify-between gap-3" style={{ gridColumn: `1 / span ${Math.max(1, last)}` }}>
            <span className="truncate text-muted-foreground">{footer.label}</span>
            {footer.action}
          </span>
          <span className="text-right font-semibold tnum">{footer.value}</span>
          <span aria-hidden />
        </div>
      )}
      {clippedTip.node}
    </div>
  );
}

function groupHasRows(g: ListTableGroup): boolean {
  return g.rows.length > 0 || !!g.subgroups?.some(groupHasRows);
}

/**
 * Hovering text the row cut short shows it whole, at once: a title, a subtitle or a cell clipped
 * with an ellipsis. Not the browser's own `title` tooltip, which waits a second or more and no
 * page can shorten (Tony, 2026-10-05). One label per list, under the clipped text (above it at
 * the bottom of the window), gone when the pointer leaves it or anything scrolls.
 */
function useClippedTip() {
  const [tip, setTip] = React.useState<{ el: HTMLElement; text: string } | null>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const onMouseOver = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".truncate");
    const text = el && e.currentTarget.contains(el) && el.scrollWidth > el.clientWidth ? el.textContent?.trim() : "";
    setTip((t) => (!el || !text ? null : t?.el === el ? t : { el, text }));
  }, []);
  const hide = React.useCallback(() => setTip(null), []);
  React.useLayoutEffect(() => {
    const node = tipRef.current;
    if (!tip || !node) return;
    const r = tip.el.getBoundingClientRect();
    const { width, height } = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 8 - width))}px`;
    node.style.top = `${r.bottom + 4 + height > window.innerHeight - 8 ? r.top - 4 - height : r.bottom + 4}px`;
    node.style.visibility = "visible";
  }, [tip]);
  React.useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);
  const node = tip
    ? createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          className="pointer-events-none invisible fixed top-0 left-0 z-50 max-w-sm rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-md [overflow-wrap:anywhere]"
        >
          {tip.text}
        </div>,
        document.body
      )
    : null;
  return { onMouseOver, onMouseLeave: hide, node };
}

/** Whether the list itself is narrow: beside a sidebar a list can be narrow on a wide window. */
function useNarrow(ref: React.RefObject<HTMLElement | null>, at: number): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setNarrow(el.getBoundingClientRect().width < at);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, at]);
  return narrow;
}

/** A small tag: an optional dot, then the label, in the list's quiet style. */
/** A tag's pill. Exported so a tag that opens a menu looks the same as one that does not. */
export const LIST_TAG_CLASS =
  "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 text-[11px] font-medium whitespace-nowrap text-muted-foreground";

/**
 * A tag that opens something. Hover never fills it (Tony, after Linear): the text and the outline
 * get louder and the background stays put.
 */
export const LIST_TAG_BUTTON_CLASS =
  "outline-none transition-colors hover:border-foreground/35 hover:text-foreground data-[state=open]:border-foreground/35 data-[state=open]:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function ListTag({ children, dot, className }: { children: React.ReactNode; dot?: string; className?: string }) {
  return (
    <span className={cn(LIST_TAG_CLASS, className)}>
      {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * ListTable's loading state: the same frame, toolbar strip, column labels, group headers and
 * hairline rows, so the list doesn't jump when the data lands. Pass the list's own columns.
 */
export function ListTableSkeleton({
  columns,
  groups = 3,
  rows = 4,
  toolbar = true,
  showHeader = true,
  fill = false,
  className,
  narrowAt = NARROW_AT,
}: {
  columns: Pick<ListTableColumn, "id" | "width" | "align" | "narrow">[];
  groups?: number;
  rows?: number;
  toolbar?: boolean;
  showHeader?: boolean;
  fill?: boolean;
  className?: string;
  /** The list's own `narrowAt`, so the skeleton folds where the list will. */
  narrowAt?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const narrow = useNarrow(ref, narrowAt);
  const shown = narrow ? [] : columns;
  const template = ["minmax(0,1fr)", ...shown.map((c) => c.width), "2rem"].join(" ");
  // Steady widths, not random ones: a skeleton that reshuffles on every render flickers.
  const titleWidths = ["62%", "48%", "71%", "55%", "40%", "66%"];
  return (
    <div
      ref={ref}
      aria-busy
      aria-label="Loading"
      className={cn("overflow-hidden rounded-lg border border-border bg-card", fill && "flex min-h-0 flex-col", className)}
    >
      {toolbar && (
        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-4">
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      )}
      {showHeader && !narrow && (
        <div className="grid h-8 items-center gap-x-3 border-b border-border/70 pr-1 pl-4" style={{ gridTemplateColumns: template }}>
          <Skeleton className="h-2.5 w-14" />
          {shown.map((c) => (
            <Skeleton key={c.id} className={cn("h-2.5 w-10", c.align === "end" && "justify-self-end")} />
          ))}
          <span />
        </div>
      )}
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g}>
          <div className="flex h-9 items-center gap-2 border-b border-border/70 bg-muted/60 pl-4">
            <Skeleton className="size-3.5 rounded" />
            <Skeleton className="h-3 w-32" />
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="grid min-h-10 items-center gap-x-3 border-b border-border/70 pr-1 pl-4"
              style={{ gridTemplateColumns: template }}
            >
              <div className="flex min-w-0 items-center gap-2 pl-6">
                <Skeleton className="size-2 shrink-0 rounded-full" />
                <Skeleton className="h-3" style={{ width: titleWidths[(g * rows + r) % titleWidths.length] }} />
              </div>
              {shown.map((c, i) => (
                <Skeleton key={c.id} className={cn("h-3", c.align === "end" && "justify-self-end")} style={{ width: `${70 - ((i + r) % 3) * 15}%` }} />
              ))}
              <span />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const NO_SUBGROUP = "__none";

/**
 * "Group by: Status", for a list's toolbar. The list owns no grouping of its own (the caller
 * builds the groups), so this is only the control, the same on every list that offers it.
 * Pass `then` for a second level: "Group by Date, then Resource", the caller nesting the
 * groups as `subgroups`.
 */
export function GroupByMenu<T extends string>({
  value,
  options,
  onChange,
  then,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  then?: { value: T | null; onChange: (value: T | null) => void };
}) {
  const current = options.find((o) => o.value === value) ?? options[0]!;
  // A second level by the same thing as the first would nest every group in one copy of itself.
  const thenOptions = options.filter((o) => o.value !== current.value);
  const sub = then ? thenOptions.find((o) => o.value === then.value) ?? null : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(LIST_TAG_CLASS, LIST_TAG_BUTTON_CLASS, "h-6 px-2.5 text-[12px]")}>
        <span className="text-muted-foreground">Group by</span>
        <span className="text-foreground">{current.label}</span>
        {sub && (
          <>
            <span className="text-muted-foreground">then</span>
            <span className="text-foreground">{sub.label}</span>
          </>
        )}
        <ChevronDown className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            const hit = options.find((o) => o.value === v);
            if (!hit) return;
            onChange(hit.value);
            // The second level can't be what the first now is.
            if (then && then.value === hit.value) then.onChange(null);
          }}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {then && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Then by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sub?.value ?? NO_SUBGROUP}
              onValueChange={(v) => then.onChange(thenOptions.find((o) => o.value === v)?.value ?? null)}
            >
              <DropdownMenuRadioItem value={NO_SUBGROUP}>Nothing</DropdownMenuRadioItem>
              {thenOptions.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
