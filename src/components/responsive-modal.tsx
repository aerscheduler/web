import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/** Width tokens for desktop dialogs. Mobile drawers are always full-bleed. */
const SIZE_CLASS = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-3xl",
  "3xl": "sm:max-w-4xl",
  "4xl": "sm:max-w-5xl",
} as const;

export type ResponsiveModalSize = keyof typeof SIZE_CLASS;

/**
 * A modal that renders as a centered Dialog on `md+` and a bottom Drawer on phones.
 * the standard container for quick create/edit forms across the console.
 *
 * Layout is always header (fixed) → body (scrolls) → optional footer (fixed), so long
 * forms never scroll the title or actions off-screen.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Sticky action row under the scrollable body. Omit when actions live in `children`. */
  footer?: React.ReactNode;
  size?: ResponsiveModalSize;
  className?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("max-h-[90vh]", className)}>
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-4",
              footer != null ? "pb-2" : "pb-5"
            )}
          >
            {children}
          </div>
          {footer != null && (
            <DrawerFooter className="shrink-0 border-t pt-4">{footer}</DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Override the stock grid + padding so regions can stick independently.
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0",
          SIZE_CLASS[size],
          className
        )}
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pr-12 pb-3 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5", footer != null ? "pb-4" : "pb-5")}>
          {children}
        </div>
        {footer != null && (
          <div className="shrink-0 border-t bg-card px-5 py-4">{footer}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
