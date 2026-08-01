import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Full-height layout for list/table/board pages (People, Aircraft, Billing,
 * Schedule…). The fixed chrome — page header, tabs, filters — stays put, and
 * only the body scrolls, instead of the whole page scrolling. Works because the
 * app shell bounds the content area's height.
 *
 * Usage:
 *
 *   <TableView>
 *     <TableView.Header>
 *       <PageHeader … />
 *       <Tabs … />
 *     </TableView.Header>
 *     <DataTable fill … />
 *     // or <TableView.Body>…list / board…</TableView.Body>
 *   </TableView>
 */
export function TableView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // data-fill-page tells the app-shell wrapper to take a DEFINITE height
    // (:has([data-fill-page]) → h-full) so this flex-1 column is bounded to the
    // viewport and its body scrolls internally instead of the whole page.
    // `min-w-0` for the same reason as `min-h-0`: a flex item's automatic
    // minimum size is its content's, so a page with a wide table would push past
    // the viewport and scroll sideways instead of scrolling inside the table.
    <div data-fill-page className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-4", className)}>
      {children}
    </div>
  );
}

/** The pinned top region (page header, tabs, filters) — never scrolls. */
function Header({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("shrink-0 space-y-4", className)}>{children}</div>;
}

/**
 * Scrollable body for non-DataTable content (card grids, divide-y lists,
 * schedule boards). Takes remaining height; overflow scrolls inside.
 */
function Body({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto", className)}>{children}</div>
  );
}

TableView.Header = Header;
TableView.Body = Body;
