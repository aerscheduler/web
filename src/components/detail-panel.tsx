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
  /** True while a panel is docked, so the outlet can claim its width. */
  docked: boolean;
  setDocked: (v: boolean) => void;
};

const DetailPanelCtx = React.createContext<Ctx | null>(null);

/**
 * Wraps the app shell so a page anywhere below can dock a detail panel into the
 * outlet without threading props through every layout.
 */
export function DetailPanelProvider({ children }: { children: React.ReactNode }) {
  const [mount, setMount] = React.useState<HTMLElement | null>(null);
  const [docked, setDocked] = React.useState(false);
  const value = React.useMemo(() => ({ mount, setMount, docked, setDocked }), [mount, docked]);
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
  return (
    <aside
      ref={ctx?.setMount ?? null}
      aria-hidden={ctx?.docked ? undefined : true}
      style={{ width: ctx?.docked ? PANEL_WIDTH : 0 }}
      className={cn(
        "flex min-h-0 shrink-0 flex-col overflow-hidden bg-background",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        ctx?.docked && "border-l",
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

  const setDocked = ctx?.setDocked;
  React.useEffect(() => {
    if (!setDocked) return;
    setDocked(docked && open);
    return () => setDocked(false);
  }, [setDocked, docked, open]);

  // Docked, the panel is NOT modal (no scrim, no focus trap) so Escape and the
  // arrow keys have to be claimed deliberately, and given up whenever a dialog,
  // dropdown or popover is layered above us (those own the keyboard while open).
  const stepRef = React.useRef(onStep);
  stepRef.current = onStep;
  React.useEffect(() => {
    if (!open || !docked) return;
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
  }, [open, docked, onOpenChange]);

  const body = (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", className)}>{children}</div>
  );

  if (docked) {
    if (!open || !ctx?.mount) return null;
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
