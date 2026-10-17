import type { ReactNode } from "react";
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
 *  - A padded flex column the content fills (panes inside scroll on their own), inset so
 *    nothing sits under the close button: a right gutter on a desktop, a top one on a phone.
 */

export function WorkspaceModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen readers only: the tool's name ("Messages"). */
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
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
          className
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
        <div className="flex min-h-0 flex-1 flex-col p-4 pr-14 max-sm:pr-4 max-sm:pt-14">{children}</div>
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
