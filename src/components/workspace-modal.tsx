import type { MouseEvent, ReactNode } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * A WORKSPACE modal: a tool you open over whatever page you are on, work in, and close to land
 * back where you were. 90% of the window on a desktop, the whole screen on a phone. First used
 * by Messages (2026-10-16), whose dock's Expand opens one.
 *
 * Use it instead of a full-screen ROUTE. A route takes you away from the page you were
 * working on and needs a page header to say where you are; a workspace modal does neither.
 * Ordinary forms and confirmations stay in <ResponsiveModal>; this is for a whole tool.
 *
 * What it gives you, so the next one is this component and not a one-off:
 *  - The size above, no title row (`title` is for screen readers only), and one close button
 *    in the top-right corner. Escape and the backdrop close it too, except while focus is in
 *    something marked `data-keeps-escape` (an inline editor cancelling itself).
 *  - A link clicked inside it (a mention, a profile, a booking) goes to that page, and the
 *    modal steps aside so you see it. With no `onLeave` the modal closes and the link navigates
 *    as usual; with one, the click is handed over (`onLeave(href)`) and the caller navigates,
 *    so it can animate the two together. This covers popovers and menus the content opens too
 *    (React events bubble through their portals).
 *  - `viewTransitionName` makes the modal one end of a View Transition morph (Messages grows
 *    its floating panel into it). The modal's own zoom is then off so the two don't fight.
 *  - A padded flex column the content fills (panes inside scroll on their own), inset so
 *    nothing sits under the close button: a right gutter on a desktop, a top one on a phone.
 */

/**
 * The in-app path a click follows in this tab (the router will navigate), or null. A click
 * meant for a new tab or window, or an outside link, does not count.
 */
export function followsInAppLink(e: MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.origin !== window.location.origin) return null;
  return a.pathname + a.search + a.hash;
}

export function WorkspaceModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  onLeave,
  viewTransitionName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen readers only: the tool's name ("Messages"). */
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** A link inside was followed; navigate to `href` yourself. Default: close, link navigates. */
  onLeave?: (href: string) => void;
  viewTransitionName?: string;
}) {
  const onClickCapture = (e: MouseEvent) => {
    const href = followsInAppLink(e);
    if (!href) return;
    if (!onLeave) return onOpenChange(false);
    e.preventDefault();
    onLeave(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={viewTransitionName ? { viewTransitionName } : undefined}
        // An element marked `data-keeps-escape` (an inline edit) uses Escape to cancel itself;
        // the modal must not close underneath it.
        onEscapeKeyDown={(e) => {
          if (document.activeElement?.closest("[data-keeps-escape]")) e.preventDefault();
        }}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          // Desktop: 90% of the window. Phone: the whole screen, no rounding or border.
          "h-[90vh] w-[90vw] max-w-none sm:max-w-none",
          "max-sm:h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0",
          // `!`: tw-animate's animate-in/out are not merged away by cn, and a closing zoom keeps
          // the dialog mounted, so it and the launcher would share a transition name and the
          // browser would skip the morph.
          viewTransitionName && "data-[state=closed]:animate-none! data-[state=open]:animate-none!",
          className
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
        <div onClickCapture={onClickCapture} className="flex min-h-0 flex-1 flex-col p-4 pr-14 max-sm:pr-4 max-sm:pt-14">
          {children}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={`Close ${title}`}
          title="Close"
          className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
