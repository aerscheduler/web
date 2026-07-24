import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Full-height layout for table-centric pages (People, Aircraft list, Billing…).
 * The fixed chrome — page header, tabs, filters, and the table's own column
 * headers — stays put, and only the table body scrolls, instead of the whole
 * page scrolling. Works because the app shell bounds the content area's height.
 *
 * Usage: put the fixed content inside <TableView.Header>, then render the table
 * (a <DataTable fill /> or any `flex min-h-0 flex-1` element) as the next child:
 *
 *   <TableView>
 *     <TableView.Header>
 *       <PageHeader … />
 *       <Tabs … />
 *     </TableView.Header>
 *     <DataTable fill … />
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
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4", className)}>
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

TableView.Header = Header;
