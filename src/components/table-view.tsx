import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The least height a filled body is allowed to be squeezed to (md+ only, since
 * below md nothing is bounded). ~20rem is around six rows plus a column header.
 * short enough that it almost never binds on a normal page, tall enough that
 * when it does the list is still a list. Shared with <DataTable fill> so the two
 * halves of the same layout agree on the number.
 */
export const FILL_BODY_MIN = "md:min-h-80";

/**
 * Full-height layout for list/table/board pages (People, Aircraft, Billing,
 * Schedule…). The fixed chrome (page header, tabs, filters) stays put, and
 * only the body scrolls, instead of the whole page scrolling. Works because the
 * app shell bounds the content area's height.
 *
 * DESKTOP ONLY (md+), deliberately. The trade this layout makes, spend fixed
 * height on chrome, scroll the rest, only pays when there is height to spend.
 * On a phone the chrome can BE the viewport, and the body it was protecting
 * collapses to a couple of rows. Below md every rule here is off, so the page
 * scrolls as one; the app shell's `:has([data-fill-page])` bound is gated the
 * same way, and the two have to stay in step.
 *
 * THE HEADER CANNOT STARVE THE BODY. A header is `shrink-0` and its height is
 * whatever the page puts in it. People stacks two request panels above the
 * filters, and a busy week of join requests is genuinely tall. Left alone the
 * body is simply "what's left", which on a full viewport can be nothing, and the
 * list silently becomes a two-row slot. So the body's `min-h-0` is replaced by a
 * real floor (`FILL_BODY_MIN`): it still shrinks to share the viewport, just not
 * past the point of being a list. When the header is too tall for even that, the
 * body overflows this column and the shell's `main` scrolls it into reach.
 * a scrolling page beats an invisible table.
 *
 * Note the floor belongs on the BODY, not here: this column keeps `min-h-0` so
 * it still sizes to the viewport. Dropping it makes its automatic minimum
 * content-based (a scroll container's min-content size is its full content)
 * and every table page would size to all its rows and scroll the whole page.
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
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "className">) {
  return (
    // data-fill-page tells the app-shell wrapper to take a DEFINITE height
    // (:has([data-fill-page]) → h-full) so this flex-1 column is bounded to the
    // viewport and its body scrolls internally instead of the whole page.
    // `min-w-0` for the same reason as `min-h-0`: a flex item's automatic
    // minimum size is its content's, so a page with a wide table would push past
    // the viewport and scroll sideways instead of scrolling inside the table.
    <div
      data-fill-page
      className={cn("flex min-w-0 flex-col gap-4 md:min-h-0 md:flex-1", className)}
      {...rest}
    >
      {children}
      {/* THE PAGE'S BOTTOM GUTTER, as a trailing flex item rather than padding.
          The shell hands it over (it zeroes its own `pb` for fill pages) because
          padding no longer works here: this column is bounded to the viewport, so
          a body pushed past it by a tall header paints straight through any
          padding on the column or the wrapper and the last row ends up flush
          against the window. A flex item is laid out after its siblings, so it
          travels with the overflow; when nothing overflows it just takes its 32px
          off the top of the same gutter. `-mt-4` cancels this column's `gap-4`,
          so the result is the shell's gutter exactly.

          Hidden when the page puts a <DataTable fill> here: that table is then
          the thing that overflows, and it carries its own copy of this spacer.
          keeping both would double the gutter on every table page. */}
      <div
        aria-hidden
        className="hidden md:-mt-4 md:block md:h-8 md:shrink-0 md:[[data-fill-page]:has([data-fill-page])>&]:hidden"
      />
    </div>
  );
}

/** The pinned top region (page header, tabs, filters), never scrolls. */
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
 * schedule boards). Takes remaining height; overflow scrolls inside, on md+,
 * for the reason above.
 */
function Body({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(FILL_BODY_MIN, "md:flex-1 md:overflow-auto", className)}>{children}</div>
  );
}

TableView.Header = Header;
TableView.Body = Body;
