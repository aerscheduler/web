import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";

function sortIcon(dir: false | "asc" | "desc") {
  if (dir === "asc") return <ChevronUp className="size-3.5" />;
  if (dir === "desc") return <ChevronDown className="size-3.5" />;
  return <ChevronsUpDown className="size-3.5 opacity-40" />;
}

export function DataTable<T>({
  columns,
  data,
  toolbar,
  globalFilter,
  onGlobalFilterChange,
  mobileCard,
  emptyMessage = "Nothing here yet.",
  fill = false,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Rendered above the table (search input, filters, actions). */
  toolbar?: ReactNode;
  /** Controlled global filter string (client-side — the API has no server search). */
  globalFilter?: string;
  onGlobalFilterChange?: (v: string) => void;
  /** When provided and on a phone, rows render as stacked cards instead of a table. */
  mobileCard?: (row: T) => ReactNode;
  emptyMessage?: ReactNode;
  /**
   * Fill the available height and scroll only the rows — the toolbar and column
   * headers stay put. Use inside a <TableView> (or any `flex min-h-0 flex-1` column)
   * so table pages don't scroll the whole page. Off by default (inline table).
   */
  fill?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const isMobile = useIsMobile();

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}>
      {toolbar ? <div className={fill ? "shrink-0" : undefined}>{toolbar}</div> : null}

      {isMobile && mobileCard ? (
        <div
          className={
            fill ? "min-h-0 flex-1 space-y-2.5 overflow-auto" : "space-y-2.5"
          }
        >
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
          containerClassName={
            fill
              ? "min-h-0 flex-1 overflow-auto rounded-md border border-border"
              : undefined
          }
        >
          <THead className={fill ? "sticky top-0 z-10 bg-background" : undefined}>
            {table.getHeaderGroups().map((hg) => (
              <TR key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TH key={h.id}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortIcon(h.column.getIsSorted())}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TH>
                ))}
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
              rows.map((row) => (
                <TR key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}
