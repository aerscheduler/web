import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILL_BODY_MIN } from "@/components/table-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/states";

/**
 * The list-and-record layout: what there is down one side, the one you picked filling the
 * rest of the screen.
 *
 * The console's default until now was a full-width list that opens a right-hand drawer.
 * That is the wrong trade for anything somebody WORKS in rather than glances at. The drawer
 * is a fixed slice of the window whatever the window is, so a squawk write-up gets the same
 * 26rem on a 3440px monitor as on a laptop, and the list it covers is still sitting there
 * behind it doing nothing. Reading one record and moving to the next means opening, closing,
 * opening, and the record you were comparing against is gone the moment you open the next.
 *
 * Here the list keeps its column and the record gets everything else, which is most of the
 * screen on the machines dispatchers and technicians actually use. Moving down the list is
 * an arrow key.
 *
 * DELIBERATELY GENERIC. It knows nothing about squawks: it is the shape shared by every
 * queue this product has or is about to have, and each one differs only in what a row looks
 * like and what a record looks like. Squawks first, then reservations (which have exactly
 * this problem today, a full-page list plus a drawer), notifications, and the messaging
 * threads that come after. Anything that reaches for `SquawkCard` inside here has broken
 * the point of it.
 *
 * WHAT IT OWNS: the two-pane frame and its scrolling, the mobile single-pane switch and the
 * way back, selection, keyboard navigation, focus, and the row's own states (selected,
 * hover, focus ring). All the things that are easy to get subtly wrong and pointless to
 * re-litigate per queue.
 *
 * WHAT IT DOES NOT OWN: the data, the URL, searching, filtering and paging. Those differ
 * per queue and already have homes (`useListQueryState`, `ListSearchBar`, `usePaging`).
 * Pass the search bar as `toolbar` and the pager as `listFooter` and they land in the right
 * place, pinned, with the list scrolling between them.
 *
 * Usage:
 *
 *   <InboxView
 *     items={squawks}
 *     getItemKey={(s) => s.id}
 *     selectedKey={openId}
 *     onSelectKey={(id) => navigate({ search: (p) => ({ ...p, open: id ?? undefined }) })}
 *     renderItem={(s) => <SquawkRow squawk={s} />}
 *     renderDetail={(s) => <SquawkRecord squawk={s} />}
 *     toolbar={<ListSearchBar … />}
 *     listFooter={<TablePagination … />}
 *     listLabel="Open squawks"
 *   />
 */

export type InboxViewProps<T> = {
  items: T[];
  /** Stable identity. Also what a consumer puts in the URL. */
  getItemKey: (item: T) => string | number;
  /** Null when nothing is open, which on a phone means the list is what you see. */
  selectedKey: string | number | null;
  onSelectKey: (key: string | number | null) => void;
  /** The row's contents. The button, its states and its semantics are handled here. */
  renderItem: (item: T, state: { selected: boolean }) => React.ReactNode;
  renderDetail: (item: T) => React.ReactNode;
  /**
   * The open record, when the consumer already has it and it may not be in `items`.
   *
   * A notification links straight to record #4,812, which is on page nine of a list nobody
   * has scrolled. Without this the deep link would land on an empty pane, so a consumer
   * that fetches the record by id passes it here and it wins over the lookup.
   */
  selectedItem?: T | null;
  /** Names the list for screen readers: "Open squawks", "Reservations". */
  listLabel: string;
  /** Names the record region. Defaults to the singular of nothing, so pass one. */
  detailLabel?: string;
  /** Pinned above the list: search, filters. */
  toolbar?: React.ReactNode;
  /** Pinned below the list: pagination. */
  listFooter?: React.ReactNode;
  /** Shown in the record pane with nothing open. Desktop only; see the mobile note below. */
  placeholder?: React.ReactNode;
  /** Replaces the whole thing when there is nothing to list at all. */
  empty?: React.ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Skeleton for the list while loading. */
  listSkeleton?: React.ReactNode;
  /** Width of the list column from md up. Wider suits a queue with long titles. */
  listWidth?: string;
  className?: string;
  /** Crop target for the help documentation's screenshots. Inert. */
  docShot?: string;
};

export function InboxView<T>({
  items,
  getItemKey,
  selectedKey,
  onSelectKey,
  renderItem,
  renderDetail,
  selectedItem,
  listLabel,
  detailLabel,
  toolbar,
  listFooter,
  placeholder,
  empty,
  loading,
  error,
  onRetry,
  listSkeleton,
  listWidth = "md:w-[20rem] lg:w-[22rem] xl:w-[24rem]",
  className,
  docShot,
}: InboxViewProps<T>) {
  const listRef = React.useRef<HTMLUListElement>(null);
  const detailRef = React.useRef<HTMLDivElement>(null);
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const listId = React.useId();
  const detailId = React.useId();

  const keys = React.useMemo(() => items.map((i) => String(getItemKey(i))), [items, getItemKey]);
  const activeKey = selectedKey == null ? null : String(selectedKey);
  const activeIndex = activeKey == null ? -1 : keys.indexOf(activeKey);

  const open = React.useMemo(() => {
    if (selectedItem !== undefined && selectedItem !== null) return selectedItem;
    if (activeIndex >= 0) return items[activeIndex];
    return null;
  }, [selectedItem, activeIndex, items]);

  // On a phone this is a one-pane screen: the list, or the record, never both. Splitting a
  // 375px window into a list column and a record column gives neither enough to be read.
  const showingDetail = selectedKey != null;

  /**
   * Whether the pending selection change came from the keyboard, and so should drag focus
   * with it.
   *
   * Focus must NOT follow a selection that came from anywhere else. Clicking a row already
   * focuses it, and a deep link or a Back button arriving while the reader is typing in the
   * search box would otherwise yank the caret out of the field.
   */
  const focusOnCommit = React.useRef(false);

  /**
   * Keep the open row on screen, and take focus with it when a key moved it.
   *
   * Selection moves from outside the list as well as from inside it, a notification deep
   * link, the browser's back button, an arrow key that scrolled past the fold, and in every
   * one of those the row has to come to the reader rather than the reader hunting it.
   * `nearest` so a row already in view is left exactly where it is; anything else makes the
   * list jump under someone who is only reading.
   *
   * In an effect rather than in the handler: the row a jump lands on (End, or an arrow into
   * a part of a long queue React has just re-rendered) does not exist yet when the key is
   * pressed, so focusing there silently did nothing and left the screen reader announcing
   * the row somebody had already left.
   */
  React.useEffect(() => {
    if (activeKey == null) return;
    const el = optionRefs.current.get(activeKey);
    if (!el) return;
    if (focusOnCommit.current) {
      focusOnCommit.current = false;
      el.focus();
    }
    el.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  /**
   * Selection follows the arrow keys, which is what every mail client has trained people to
   * expect and what makes a queue quick to work: down, read, down, read, without a click.
   * Focus travels with it (roving tabindex) so the ring stays where the reader is.
   */
  const move = React.useCallback(
    (to: number) => {
      if (keys.length === 0) return;
      const next = Math.min(keys.length - 1, Math.max(0, to));
      const item = items[next];
      if (item == null) return;
      focusOnCommit.current = true;
      onSelectKey(getItemKey(item));
    },
    [keys.length, items, getItemKey, onSelectKey]
  );

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(activeIndex < 0 ? 0 : activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(activeIndex < 0 ? 0 : activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(keys.length - 1);
        break;
      case "Escape":
        // Only means something on a phone, where it is the way back out of the record.
        if (showingDetail) {
          event.preventDefault();
          onSelectKey(null);
        }
        break;
    }
  };

  if (error) {
    return (
      <Card className={cn("min-h-0 flex-1 p-0", className)}>
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    );
  }

  // An empty queue has no list to put beside a record, so it takes the whole frame rather
  // than sitting in a 20rem column next to an empty pane telling the reader nothing twice.
  if (empty && !loading && items.length === 0 && selectedKey == null) {
    return <>{empty}</>;
  }

  return (
    <div
      data-doc-shot={docShot}
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-4 md:flex-1 md:flex-row md:gap-5",
        className
      )}
    >
      {/* THE LIST COLUMN. Fixed width from md so the record gets every pixel the window
          grows by, which is the whole reason this exists. */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-3",
          listWidth,
          "md:shrink-0",
          // Phone: the record replaces the list rather than sitting under it.
          showingDetail && "hidden md:flex"
        )}
      >
        {toolbar && <div className="shrink-0">{toolbar}</div>}

        {loading && listSkeleton ? (
          <div className={cn(FILL_BODY_MIN, "min-h-0 md:flex-1 md:overflow-y-auto")}>
            {listSkeleton}
          </div>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={listLabel}
            aria-controls={detailId}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            className={cn(
              FILL_BODY_MIN,
              // `overscroll-contain` so flicking past the end of a long queue on a trackpad
              // does not then scroll the page behind it.
              "min-h-0 space-y-1.5 overscroll-contain md:flex-1 md:overflow-y-auto md:pr-1"
            )}
          >
            {items.map((item, index) => {
              const key = keys[index]!;
              const selected = key === activeKey;
              return (
                <li key={key}>
                  <button
                    ref={(el) => {
                      if (el) optionRefs.current.set(key, el);
                      else optionRefs.current.delete(key);
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    // Roving tabindex: one stop for the whole queue, so tabbing through the
                    // page does not mean 25 stops before the record beside it.
                    tabIndex={selected || (activeIndex < 0 && index === 0) ? 0 : -1}
                    onClick={() => onSelectKey(getItemKey(item))}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? // Border AND tint, not tint alone: at the contrast a tint can
                          // safely use against a card, "which one am I reading" was a
                          // guess on a bright screen.
                          "border-primary/40 bg-primary/[0.07]"
                        : "border-border bg-card hover:bg-accent/40"
                    )}
                  >
                    {renderItem(item, { selected })}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {listFooter && <div className="shrink-0">{listFooter}</div>}
      </div>

      {/* THE RECORD. */}
      <div
        ref={detailRef}
        id={detailId}
        role="region"
        aria-label={detailLabel ?? listLabel}
        tabIndex={-1}
        className={cn(
          "min-h-0 min-w-0 flex-col md:flex md:flex-1",
          FILL_BODY_MIN,
          "md:overflow-y-auto",
          showingDetail ? "flex" : "hidden md:flex"
        )}
      >
        {open ? (
          <>
            {/* The way back, on the phone only: on md+ the list never left. */}
            <div className="mb-3 shrink-0 md:hidden">
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onSelectKey(null)}>
                <ChevronLeft className="size-4" /> {listLabel}
              </Button>
            </div>
            {renderDetail(open)}
          </>
        ) : (
          // Only reachable on md+: a phone with nothing open is showing the list.
          <div className="hidden min-h-0 flex-1 md:flex">{placeholder}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The "nothing open yet" pane.
 *
 * Its own export because every queue needs one and an empty half-screen is the single
 * easiest thing in this layout to leave looking broken.
 */
export function InboxPlaceholder({
  icon: Icon,
  title,
  body,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
      <div className="max-w-xs">
        {Icon && <Icon className="mx-auto mb-3 size-8 text-muted-foreground/40" />}
        <p className="text-sm font-medium">{title}</p>
        {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}
