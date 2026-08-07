import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TablePagination } from "@/components/table-pagination";
import { FILL_BODY_MIN } from "@/components/table-view";
import { useIsMobile } from "@/hooks/use-mobile";
import type { PagingState } from "@/lib/paging";
import { cn } from "@/lib/utils";

/**
 * Extra column facts this table understands.
 *
 * `sortKey` is the field the API orders by, as a dot path into the row — it is
 * what makes a column sortable. A column without one renders a plain header,
 * which is the honest outcome: a computed or composed column ("Aircraft · Type",
 * a status derived from three fields) has nothing the server can order by, and
 * a sort arrow that quietly reordered the current page only would be worse than
 * no arrow at all.
 */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- both params are required by the interface
  interface ColumnMeta<TData extends unknown, TValue> {
    sortKey?: string;
    /** Right-align numerics (money, hours, counts). */
    numeric?: boolean;
    /**
     * A fixed column width, as any CSS length ("9rem", "12%").
     *
     * Set it wherever the SAME table is rendered with different data and the layout
     * shifting between them would read as a different screen — a filtered list, most
     * obviously. Without it the browser sizes every column to the widest cell on the page
     * in hand, so narrowing a list to three rows re-lays out all five columns.
     *
     * Opt-in per column. Columns that set no width share whatever is left, so a table can
     * pin its short, predictable columns and let one content column flex.
     */
    width?: string;
  }
}

function sortIcon(dir: false | "asc" | "desc") {
  if (dir === "asc") return <ChevronUp className="size-3.5" />;
  if (dir === "desc") return <ChevronDown className="size-3.5" />;
  return <ChevronsUpDown className="size-3.5 opacity-40" />;
}

/**
 * The console's table.
 *
 * Paged and sorted BY THE SERVER, always — `paging` is required, and there is
 * no unpaged mode. That is deliberate rather than strict: the API caps every
 * list at 1,000 rows, so a table that renders whatever array it was handed
 * doesn't show a big collection slowly, it shows a truncated one with no sign
 * that anything is missing. Requiring the prop means a new table cannot be
 * written that way by accident.
 *
 * For the same reason there is no client-side filter here. Search is a server
 * `q` param on every list that has one; filtering the fifty rows in the browser
 * would search the page, not the collection.
 */
export function DataTable<T>({
  columns,
  data,
  paging,
  total,
  loading = false,
  toolbar,
  mobileCard,
  emptyMessage = "Nothing here yet.",
  fill = false,
  onRowClick,
  isRowSelected,
  showPageSize,
  docShot,
}: {
  columns: ColumnDef<T, unknown>[];
  /** One page of rows, as the API returned them. */
  data: T[];
  /** Page/sort state from `usePaging()`. Drives the pager and the column headers. */
  paging: PagingState;
  /** `pagination.total` — how many rows there are in all, not how many are on screen. */
  total: number;
  /** Fetching the next page: dims the rows instead of blanking them. */
  loading?: boolean;
  /** Rendered above the table (search input, filters, actions). */
  toolbar?: ReactNode;
  /** When provided and on a phone, rows render as stacked cards instead of a table. */
  mobileCard?: (row: T) => ReactNode;
  emptyMessage?: ReactNode;
  /**
   * Fill the available height and scroll only the rows — the toolbar, column
   * headers and pager stay put. Use inside a <TableView> (or any `flex min-h-0
   * flex-1` column) so table pages don't scroll the whole page.
   *
   * Takes effect on md+ only, in step with <TableView> and the app shell: on a
   * phone there is no spare height to fill, and bounding the rows there is what
   * squeezed them to a sliver under a tall header. On md+ the rows keep a
   * FILL_BODY_MIN floor for the same reason — see <TableView>.
   */
  fill?: boolean;
  /** Opens a detail panel/sheet when a row is clicked. */
  onRowClick?: (row: T) => void;
  /**
   * Marks the row whose record is open in the detail panel. Worth passing
   * wherever `onRowClick` opens one: the panel docks BESIDE the table rather
   * than over it, so the list stays on screen, and without a highlight nothing
   * says which of forty rows is the one being shown.
   */
  isRowSelected?: (row: T) => boolean;
  showPageSize?: boolean;
  /**
   * Crop target for the help documentation's screenshots. The page passes it
   * rather than this component writing one: every list in the console renders
   * this table, so a literal attribute here would have all of them answer to a
   * single id and the capture would photograph whichever loaded first. Inert,
   * nothing styles or queries it.
   */
  docShot?: string;
}) {
  const isMobile = useIsMobile();

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // The server already ordered and cut this page. Re-deriving either here
    // would reorder the page in isolation and quietly contradict the pager.
    manualPagination: true,
    manualSorting: true,
  });

  const rows = table.getRowModel().rows;

  /** asc → desc → unsorted, so a column can be put back the way it was found. */
  function toggleSort(sortKey: string) {
    const current = paging.sort;
    if (current?.key !== sortKey) return paging.setSort({ key: sortKey, dir: "asc" });
    if (current.dir === "asc") return paging.setSort({ key: sortKey, dir: "desc" });
    return paging.setSort(null);
  }

  const pager = (
    <TablePagination
      paging={paging}
      total={total}
      returned={data.length}
      loading={loading}
      showPageSize={showPageSize}
      className={fill ? "md:shrink-0" : undefined}
    />
  );

  return (
    // When fill, tag for the app-shell's :has() rule so the wrapper takes a
    // definite height and these rows scroll internally (not the whole page).
    <div
      data-fill-page={fill ? "" : undefined}
      data-doc-shot={docShot}
      className={fill ? "flex flex-col gap-3 md:min-h-0 md:flex-1" : "space-y-3"}
    >
      {toolbar ? <div className={fill ? "md:shrink-0" : undefined}>{toolbar}</div> : null}

      {isMobile && mobileCard ? (
        // This branch only ever renders below md, so `fill` has nothing to fill:
        // the cards run down the page and the page scrolls.
        <div className={cn("space-y-2.5", loading && "opacity-60")}>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            rows.map((row) => <div key={row.id}>{mobileCard(row.original)}</div>)
          )}
        </div>
      ) : (
        <Table
          containerClassName={cn(
            fill
              ? cn("rounded-md border border-border md:flex-1 md:overflow-auto", FILL_BODY_MIN)
              : undefined,
            // Keep the previous page readable while the next one loads rather
            // than collapsing to a spinner — paging should not blink.
            loading && "opacity-60"
          )}
        >
          {/* Widths belong on a <colgroup> rather than on the cells: a `width` on a th is
              a suggestion that auto layout is free to overrule, and it does. Rendered only
              when at least one column asks for one, so every existing table keeps the
              content-driven sizing it was built against. */}
          {table.getAllLeafColumns().some((c) => c.columnDef.meta?.width) && (
            <colgroup>
              {table.getAllLeafColumns().map((c) => (
                <col key={c.id} style={{ width: c.columnDef.meta?.width }} />
              ))}
            </colgroup>
          )}
          <THead className={fill ? "sticky top-0 z-10 bg-background" : undefined}>
            {table.getHeaderGroups().map((hg) => (
              <TR key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const sortKey = h.column.columnDef.meta?.sortKey;
                  const sorted =
                    sortKey && paging.sort?.key === sortKey ? paging.sort.dir : (false as const);
                  return (
                    <TH key={h.id} className={h.column.columnDef.meta?.numeric ? "text-right" : undefined}>
                      {h.isPlaceholder ? null : sortKey ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(sortKey)}
                          aria-label={`Sort by ${h.column.id}`}
                          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sortIcon(sorted)}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TH>
                  );
                })}
              </TR>
            ))}
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR className="hover:bg-transparent">
                <TD
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TD>
              </TR>
            ) : (
              rows.map((row) => {
                const selected = isRowSelected?.(row.original) ?? false;
                return (
                  <TR
                    key={row.id}
                    // On the element itself, not only in the class list: it is what
                    // the detail panel's keyboard stepper scrolls back into view.
                    data-selected={selected ? "" : undefined}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      // A left rule as well as a fill — the fill alone is easy to lose
                      // against the hover state while scanning down a long list.
                      selected && "bg-accent hover:bg-accent [box-shadow:inset_2px_0_0_0_var(--primary)]"
                    )}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TD
                        key={cell.id}
                        className={cell.column.columnDef.meta?.numeric ? "text-right" : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TD>
                    ))}
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      )}

      {pager}

      {/* The page's bottom gutter — see <TableView>, which carries the same
          spacer for pages that don't put a table here. `-mt-3` cancels this
          column's own `gap-3` so the gutter is exactly the shell's 32px and not
          the gap on top of it. */}
      {fill && <div aria-hidden className="hidden md:-mt-3 md:block md:h-8 md:shrink-0" />}
    </div>
  );
}
