import * as React from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Above this the record gets its own column beside the list; below it, the
 * modal drawer we have always shipped. 1180px is the point where the content
 * column (max 1280px) plus a 384px panel stops fitting without crushing the
 * table, narrower than that and the push costs more than it gives.
 */
const DOCK_QUERY = "(min-width: 1180px)";

/** Matches the drawer's `sm:max-w-md`, so a record reads the same either way. */
const PANEL_WIDTH = "24rem";

type Ctx = {
  /** The docked column's DOM node, the portal target. Null until mounted. */
  mount: HTMLElement | null;
  setMount: (el: HTMLElement | null) => void;
  /** Which panel currently owns the dock. Null while it is empty. */
  active: string | null;
  /** Take the dock, closing whoever held it. */
  claim: (id: string, close: () => void) => void;
  /** Give it up, if this panel still holds it. */
  release: (id: string) => void;
};

const DetailPanelCtx = React.createContext<Ctx | null>(null);

/**
 * Wraps the app shell so a page anywhere below can dock a detail panel into the
 * outlet without threading props through every layout.
 *
 * There is ONE dock, and it holds ONE record. Every open panel on the page used to
 * portal into the same column, so a page with two kinds of record on it (the
 * dashboard's schedule and its invoices, a report's rows) stacked them: the second
 * one rendered below the first, off the bottom of a column that does not scroll, so
 * clicking a booking while an invoice was open looked like the click did nothing,
 * and closing one revealed the other still sitting there. The dock is a claim now,
 * and taking it closes the previous holder, which is what "swaps in place" already
 * meant on a single-record page.
 */
export function DetailPanelProvider({ children }: { children: React.ReactNode }) {
  const [mount, setMount] = React.useState<HTMLElement | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  //Held outside state so a claim can reach the outgoing panel's closer without the
  //claiming effect having to depend on it (and re-run when it changes).
  const holder = React.useRef<{ id: string; close: () => void } | null>(null);

  const claim = React.useCallback((id: string, close: () => void) => {
    const prev = holder.current;
    holder.current = { id, close };
    setActive(id);
    if (prev && prev.id !== id) prev.close();
  }, []);

  const release = React.useCallback((id: string) => {
    if (holder.current?.id !== id) return;
    holder.current = null;
    setActive(null);
  }, []);

  const value = React.useMemo(
    () => ({ mount, setMount, active, claim, release }),
    [mount, active, claim, release],
  );
  return <DetailPanelCtx.Provider value={value}>{children}</DetailPanelCtx.Provider>;
}

/**
 * The column a docked panel renders into. Lives in the app shell, OUTSIDE the
 * content's `max-w-[1280px]` wrapper, so on a wide monitor the panel spends the
 * empty gutter instead of eating the list. It is always in the DOM, the portal
 * needs a target before anything can decide to dock, and simply has no width
 * while closed.
 */
export function DetailPanelOutlet() {
  const ctx = React.useContext(DetailPanelCtx);
  const open = ctx?.active != null;
  return (
    <aside
      ref={ctx?.setMount ?? null}
      aria-hidden={open ? undefined : true}
      style={{ width: open ? PANEL_WIDTH : 0 }}
      className={cn(
        "flex min-h-0 shrink-0 flex-col overflow-hidden bg-background",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        open && "border-l",
      )}
    />
  );
}

/**
 * A record's detail view.
 *
 * On a wide screen it is a real column beside the list: the page stays live, the
 * row you picked stays visible, and picking another row swaps this panel in
 * place instead of making you close one drawer to open the next. Below the
 * breakpoint it falls back to the modal `Sheet`, which is already the right
 * answer on a laptop and a phone.
 *
 * `onStep` opts a surface into ↑/↓ paging through its list, pass it only when
 * the caller knows the order on screen.
 */
export function DetailPanel({
  open,
  onOpenChange,
  title,
  description,
  badge,
  footer,
  onStep,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Read to screen readers as the panel's description; keep it short. */
  description?: React.ReactNode;
  /** Status chip shown opposite the title. */
  badge?: React.ReactNode;
  /** Sticky action row under the scrolling body. */
  footer?: React.ReactNode;
  /** Move to the previous (-1) or next (+1) record in the list. */
  onStep?: (delta: -1 | 1) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(DetailPanelCtx);
  const canDock = useMediaQuery(DOCK_QUERY);
  const docked = canDock && ctx?.mount != null;

  //Take the dock while open, hand it back on close or unmount. Whoever held it is
  //closed by the claim, so a page never has to remember to shut one panel before
  //opening another (and every page that forgot ended up with two in the column).
  const id = React.useId();
  const closeRef = React.useRef(onOpenChange);
  closeRef.current = onOpenChange;
  const claim = ctx?.claim;
  const release = ctx?.release;
  React.useEffect(() => {
    if (!claim || !release || !docked || !open) return;
    claim(id, () => closeRef.current(false));
    return () => release(id);
  }, [claim, release, docked, open, id]);

  //Never two in the column at once. The claim above settles this an effect later than
  //the render that opened us, so until it lands the incoming panel draws nothing rather
  //than drawing underneath the outgoing one.
  const holdsDock = ctx?.active === id;

  // Docked, the panel is NOT modal (no scrim, no focus trap) so Escape and the
  // arrow keys have to be claimed deliberately, and given up whenever a dialog,
  // dropdown or popover is layered above us (those own the keyboard while open).
  const stepRef = React.useRef(onStep);
  stepRef.current = onStep;
  React.useEffect(() => {
    if (!open || !docked || !holdsDock) return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (document.querySelector("[role='dialog'], [data-radix-popper-content-wrapper]")) return;
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // Never steal an arrow key from something being typed in or scrolled by it.
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
          el.closest("[role='listbox'], [role='menu'], [role='combobox']"))
      ) {
        return;
      }
      if (!stepRef.current) return;
      e.preventDefault();
      stepRef.current(e.key === "ArrowDown" ? 1 : -1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, docked, holdsDock, onOpenChange]);

  const body = (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", className)}>{children}</div>
  );

  if (docked) {
    if (!open || !holdsDock || !ctx?.mount) return null;
    return createPortal(
      <section
        aria-label={typeof title === "string" ? title : "Details"}
        className="flex h-full w-full min-w-0 flex-col gap-0"
        // The outlet animates its width; without this the content would reflow
        // through every intermediate width and visibly jitter on open.
        style={{ width: PANEL_WIDTH }}
      >
        <div className="flex shrink-0 flex-col gap-1.5 border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate font-semibold text-foreground">{title}</h2>
              {badge}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close details"
              className="-mr-1 shrink-0 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>

        {body}

        {footer && <div className="shrink-0 border-t p-4">{footer}</div>}
      </section>,
      ctx.mount,
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b">
          <div className="flex items-center justify-between gap-3 pr-6">
            <SheetTitle className="truncate">{title}</SheetTitle>
            {badge}
          </div>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Record details</SheetDescription>
          )}
        </SheetHeader>

        {body}

        {footer && <div className="shrink-0 border-t p-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
